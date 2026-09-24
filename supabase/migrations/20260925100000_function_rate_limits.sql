-- D5 (#54) — abuse guard Edge Functions: fixed-window counter per (function, key, window).
--
-- Mekanisme yang dipilih (didokumentasikan di issue #54 sebelum kode):
-- counter tabel in-function, bukan knob platform (tidak ada yang per-function
-- per-user — `functions/limits` hanya runtime caps, `[auth.rate_limit]` hanya
-- endpoint Auth) dan bukan Upstash Redis (vendor + secrets + biaya untuk 3
-- fungsi low-traffic = overkill). In-memory ditolak (edge isolates tidak
-- berbagi state). `INSERT ... ON CONFLICT DO UPDATE` atomik → aman dari
-- balapan antar request paralel.
--
-- `bucket_key` = `user_id` pemanggil (ketiga fungsi mensyaratkan JWT valid;
-- tanpa JWT tetap 401 SEBELUM rate check — tidak ada key berbasis IP agar
-- tidak bisa di-spoof via `x-forwarded-for`).
-- RLS on tanpa policy + revoke total: hanya service_role (Edge Functions)
-- yang bisa baca/tulis; panggilan RPC langsung via PostgREST ditolak.

create table public.function_rate_limits (
  function_name text not null,
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 1 check (count >= 1),
  primary key (function_name, bucket_key, window_start)
);

comment on table public.function_rate_limits is
  'D5 (#54): fixed-window counter abuse guard Edge Functions (seed-user, export-csv, delete-account). Ditulis hanya via check_function_rate_limit dengan service_role.';

alter table public.function_rate_limits enable row level security;

revoke all on table public.function_rate_limits from anon, authenticated, public;

create or replace function public.check_function_rate_limit(
  p_function text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, count integer, retry_after_seconds integer)
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_epoch bigint := floor(extract(epoch from v_now))::bigint;
  v_window_start timestamptz;
  v_count integer;
  v_retry integer;
begin
  if p_function is null or char_length(p_function) < 1 or char_length(p_function) > 128
    or p_key is null or char_length(p_key) < 1 or char_length(p_key) > 256
    or p_limit is null or p_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  v_window_start := to_timestamp((v_epoch / p_window_seconds) * p_window_seconds);

  insert into public.function_rate_limits as r (function_name, bucket_key, window_start, count)
  values (p_function, p_key, v_window_start, 1)
  on conflict (function_name, bucket_key, window_start)
  do update set count = r.count + 1
  returning r.count into v_count;

  if v_count <= p_limit then
    return query select true, v_count, 0;
  else
    v_retry := (p_window_seconds - (v_epoch % p_window_seconds))::integer;
    return query select false, v_count, v_retry;
  end if;

  -- Cleanup oportunistik: baris dua window ke belakang sudah tidak dipakai.
  delete from public.function_rate_limits
  where window_start < v_now - make_interval(secs => (p_window_seconds * 2)::double precision);
end;
$$;

comment on function public.check_function_rate_limit(text, text, integer, integer) is
  'D5 (#54): fixed-window rate check. Atomic increment; allowed=false + retry_after_seconds saat count > limit. Hanya service_role.';

revoke all on function public.check_function_rate_limit(text, text, integer, integer)
  from anon, authenticated, public;
grant execute on function public.check_function_rate_limit(text, text, integer, integer)
  to service_role;
