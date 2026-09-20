-- V3 (#32) — Recurring catch-up (ADR-0005).
--
-- Recurring rule bulanan (income atau expense, bukan Transfer) yang
-- materialisasi lewat Catch-up saat app dibuka/foreground — bukan cron, bukan
-- server-push. Occurrence adalah Transaction biasa (masuk Saldo, Spent, Alert).
--
-- Yang ditambahkan:
--   1. Tabel `recurring_rules`: kind income|expense, amount positif (12 digit),
--      wallet (komposit FK milik user yang sama, RESTRICT), category (RESTRICT),
--      due day 1–28 atau last-of-month (`due_day` null + `due_last` true),
--      `starts_on` wajib hari-1, `ends_on` opsional hari-1 ≥ starts_on,
--      status active|paused. RLS deny-by-default + grant authenticated saja.
--   2. Batas 20 rule AKTIF per user (yang paused tidak dihitung): trigger
--      `enforce_recurring_rule_limit` (23514), pola advisory-lock T2.
--   3. Rule tidak boleh menunjuk wallet yang diarsip: trigger
--      `enforce_recurring_rule_wallet_active` (23514). Picker klien juga hanya
--      menawarkan wallet aktif; trigger ini jaring pengaman server-side.
--   4. `transactions.recurring_rule_id` nullable + FK komposit
--      `(recurring_rule_id, user_id) -> recurring_rules(id, user_id)`
--      ON DELETE SET NULL (hapus rule tidak menghapus riwayat), dan
--   `transactions.occurred_on` (date tanggal jatuh tempo di tz Profile).
--      Check `transactions_recurring_shape`: occurrence harus income|expense
--      dengan occurred_on terisi; baris manual tidak membawa keduanya.
--      Hapus rule melepas kaitan via trigger detach (FK komposit RESTRICT —
--      ON DELETE SET NULL akan men-null-kan user_id juga).
--   5. Unique `(recurring_rule_id, occurred_on)` TANPA filter deleted_at —
--      catch-up tidak pernah menulis ganda, termasuk baris yang user hapus
--      sengaja (soft-delete). `occurred_on` disengaja BUKAN kolom generated
--      dari `occurred_at`: ia mengingat due yang sudah dicover walau user
--      mengedit tanggal occurrence-nya, dan ia bertahan saat rule dihapus
--   (SET NULL trigger hanya mengosongkan kaitan, bukan tanggal).
--   6. RPC `run_recurring_catchup()` (security invoker, caller = auth.uid()):
--      menulis occurrence yang due ≤ hari ini (tz Profile), dalam jendela
--      starts/ends, rule aktif, belum ada baris (termasuk soft-delete),
--      plafon 12 per rule per panggilan (tertua dulu, sisa sesi berikutnya).
--      `occurred_at` = tengah malam tanggal jatuh tempo di tz Profile
--      (BUKAN now() — dan tengah malam, bukan tengah hari, agar occurrence
--      "hari ini" tidak pernah jatuh di masa depan saat catch-up jalan pagi).
--      Bulan `starts_on` yang due day-nya sudah lewat ter-skip alami
--      (due < starts_on). `ON CONFLICT DO NOTHING` agar dua foreground yang
--      balapan tetap aman. Return jumlah baris tertulis.
--   7. Trigger arsip wallet: `wallets.archived_at` null → terisi membuat semua
--      rule aktif di wallet itu paused (auto-Jeda + banner Profile di klien).
--
-- Yang SENGAJA tidak dicampur: recurring transfer (V3 = income|expense saja),
-- arsip wallet UI (itu V4 — kolom `archived_at` sudah ada sejak T2).

-- ---------------------------------------------------------------------------
-- 1. Tabel recurring_rules
-- ---------------------------------------------------------------------------

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(18,2) not null check (amount > 0 and amount <= 999999999999),
  wallet_id uuid not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  due_day smallint,
  due_last boolean not null default false,
  starts_on date not null check (extract(day from starts_on) = 1),
  ends_on date,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Due day 1–28, atau "hari terakhir bulan" (due_day null + due_last true).
  -- 29–31 tidak ditawarkan supaya Februari tidak bolong (ADR-0005).
  -- `due_day is not null` eksplisit: `FALSE AND NULL` = NULL dan CHECK
  -- meloloskan NULL — tanpa ini, rule tanpa due bisa lolos diam-diam.
  constraint recurring_rules_due_check check (
    (due_last = false and due_day is not null and due_day between 1 and 28)
    or
    (due_last = true and due_day is null)
  ),
  check (ends_on is null or extract(day from ends_on) = 1),
  check (ends_on is null or ends_on >= starts_on),
  -- Wallet tujuan harus milik user yang sama (pola komposit T2/V2). RESTRICT:
  -- wallet yang masih dirujuk rule tidak bisa dihapus (arsip = jalurnya).
  foreign key (wallet_id, user_id) references public.wallets (id, user_id) on delete restrict,
  -- Target FK komposit balik dari transactions (pola wallets T2).
  unique (id, user_id)
);

create index recurring_rules_user_idx on public.recurring_rules (user_id);
create index recurring_rules_user_status_idx on public.recurring_rules (user_id, status);

create trigger recurring_rules_set_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

comment on table public.recurring_rules is
  'Jadwal bulanan income|expense milik user (ADR-0005). Materialisasi lewat run_recurring_catchup, bukan cron. Maks 20 aktif per user; arsip wallet auto-jeda.';

-- ---------------------------------------------------------------------------
-- 2. Batas 20 rule aktif per user (paused tidak dihitung)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_rule_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 5));

  select count(*) into active_count
  from public.recurring_rules
  where user_id = new.user_id
    and status = 'active'
    -- Edit rule yang sudah aktif tidak boleh dihitung sebagai rule baru:
    -- tanpa pengecualian ini, mencapai plafon akan mengunci SEMUA edit.
    and id <> coalesce(case when tg_op = 'UPDATE' then old.id end, '00000000-0000-0000-0000-000000000000');

  if active_count >= 20 then
    raise exception 'batas 20 aturan aktif tercapai' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_recurring_rule_limit() is
  'Guard V3: maks 20 recurring rule aktif per user (paused tidak dihitung). Edit rule aktif saat plafon penuh tetap boleh.';

-- Fungsi trigger tidak perlu bisa dipanggil langsung (PostgREST me-expose
-- semua fungsi sebagai RPC). Trigger tetap jalan tanpa hak EXECUTE (pola V2).
revoke all on function public.enforce_recurring_rule_limit() from public, anon, authenticated;

drop trigger if exists recurring_rules_enforce_limit on public.recurring_rules;

create trigger recurring_rules_enforce_limit
  before insert or update of status, user_id on public.recurring_rules
  for each row execute function public.enforce_recurring_rule_limit();

-- ---------------------------------------------------------------------------
-- 3. Rule tidak boleh menunjuk wallet yang diarsip
-- ---------------------------------------------------------------------------

create or replace function public.enforce_recurring_rule_wallet_active()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  wallet_archived_at timestamptz;
begin
  select w.archived_at into wallet_archived_at
  from public.wallets w
  where w.id = new.wallet_id
    and w.user_id = new.user_id;

  if wallet_archived_at is not null then
    raise exception 'wallet sudah diarsipkan: buka arsip dulu atau pilih wallet aktif'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_recurring_rule_wallet_active() is
  'Guard V3: recurring rule hanya boleh menunjuk wallet aktif. Arsip wallet auto-jeda rule lewat trigger wallets_auto_pause_rules.';

revoke all on function public.enforce_recurring_rule_wallet_active() from public, anon, authenticated;

drop trigger if exists recurring_rules_enforce_wallet_active on public.recurring_rules;

create trigger recurring_rules_enforce_wallet_active
  before insert or update of wallet_id on public.recurring_rules
  for each row execute function public.enforce_recurring_rule_wallet_active();

-- ---------------------------------------------------------------------------
-- 4. transactions.recurring_rule_id + occurred_on
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists recurring_rule_id uuid;

alter table public.transactions
  add column if not exists occurred_on date;

-- Kaitan ke rule milik user yang sama (komposit, pola counterparty V2).
-- RESTRICT + trigger detach di bawah (bukan ON DELETE SET NULL — SET NULL
-- pada FK komposit akan men-null-kan user_id juga dan melanggar not-null).
alter table public.transactions
  drop constraint if exists transactions_recurring_rule_fk;

alter table public.transactions
  add constraint transactions_recurring_rule_fk
  foreign key (recurring_rule_id, user_id)
  references public.recurring_rules (id, user_id)
  on delete restrict;

-- Hapus rule tidak menghapus riwayat: trigger ini mengosongkan kaitan
-- occurrence (recurring_rule_id → null, occurred_on bertahan — butir 5)
-- SEBELUM baris rule hilang, sehingga RESTRICT di atas tidak menolak hapus.
create or replace function public.detach_occurrences_on_rule_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transactions
     set recurring_rule_id = null
   where recurring_rule_id = old.id;
  return old;
end;
$$;

comment on function public.detach_occurrences_on_rule_delete() is
  'Guard V3: hapus recurring rule melepas kaitan occurrence (SET NULL manual — FK komposit tidak bisa ON DELETE SET NULL tanpa men-null-kan user_id). Riwayat tetap sebagai transaksi biasa.';

revoke all on function public.detach_occurrences_on_rule_delete() from public, anon, authenticated;

drop trigger if exists recurring_rules_detach_occurrences on public.recurring_rules;

create trigger recurring_rules_detach_occurrences
  before delete on public.recurring_rules
  for each row execute function public.detach_occurrences_on_rule_delete();

create index if not exists transactions_recurring_rule_idx
  on public.transactions (recurring_rule_id);

-- Bentuk occurrence: income|expense + occurred_on terisi. Baris manual
-- (recurring_rule_id null) tidak membawa occurred_on. Sengaja longgar ke arah
-- (null, occurred_on terisi): itu ex-occurrence yang rule-nya dihapus
-- (SET NULL mengosongkan kaitan tapi tanggal cover bertahan — butir 5).
alter table public.transactions
  drop constraint if exists transactions_recurring_shape;

alter table public.transactions
  add constraint transactions_recurring_shape check (
    recurring_rule_id is null
    or (type in ('income', 'expense') and occurred_on is not null)
  );

-- Anti-ganda catch-up, TERMASUK baris soft-deleted (tanpa filter deleted_at).
-- NULL recurring_rule_id (transaksi manual) tidak saling blokir: Postgres
-- menganggap NULL berlainan dalam unique constraint.
alter table public.transactions
  drop constraint if exists transactions_recurring_occurrence_key;

alter table public.transactions
  add constraint transactions_recurring_occurrence_key
  unique (recurring_rule_id, occurred_on);

-- ---------------------------------------------------------------------------
-- 5–6. RPC run_recurring_catchup
-- ---------------------------------------------------------------------------

create or replace function public.run_recurring_catchup()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid;
  tz text;
  today_local date;
  rule record;
  wallet_archived_at timestamptz;
  month_cursor date;
  last_month date;
  due date;
  wrote_rule integer;
  wrote_total integer := 0;
  inserted_now integer;
begin
  caller := (select auth.uid());
  if caller is null then
    raise exception 'harus login untuk menjalankan catch-up'
      using errcode = '42501';
  end if;

  select coalesce(
    (select p.timezone from public.profiles p where p.id = caller),
    'Asia/Jakarta'
  ) into tz;

  today_local := (now() at time zone tz)::date;

  for rule in
    select *
    from public.recurring_rules
    where user_id = caller
      and status = 'active'
    order by created_at, id
  loop
    -- Self-healing: wallet yang terarsip di luar trigger (mis. service role)
    -- membuat rule jeda di sini juga, bukan menulis occurrence gagal diam-diam.
    select w.archived_at into wallet_archived_at
    from public.wallets w
    where w.id = rule.wallet_id
      and w.user_id = caller;

    if wallet_archived_at is not null then
      update public.recurring_rules
         set status = 'paused'
       where id = rule.id
         and status = 'active';
      continue;
    end if;

    month_cursor := date_trunc('month', rule.starts_on)::date;
    last_month := date_trunc('month', today_local)::date;
    if rule.ends_on is not null and rule.ends_on < last_month then
      last_month := rule.ends_on;
    end if;

    wrote_rule := 0;
    while month_cursor <= last_month loop
      if wrote_rule >= 12 then
        -- Plafon 12 per rule per panggilan (ADR-0005): sisa menunggu sesi
        -- berikutnya agar splash tidak hang.
        exit;
      end if;

      if rule.due_last then
        due := (month_cursor + interval '1 month' - interval '1 day')::date;
      else
        due := (month_cursor + (rule.due_day - 1) * interval '1 day')::date;
      end if;

      -- Bulan starts_on yang due day-nya sudah lewat ter-skip di sini
      -- (due < starts_on): occurrence pertama = siklus berikutnya (AC V3).
      if due >= rule.starts_on
        and (rule.ends_on is null or due <= rule.ends_on)
        and due <= today_local
        and not exists (
          select 1 from public.transactions t
          where t.recurring_rule_id = rule.id
            and t.occurred_on = due
        )
      then
        insert into public.transactions
          (user_id, wallet_id, category_id, type, amount,
           occurred_at, note, idempotency_key,
           recurring_rule_id, occurred_on)
        values
          (caller, rule.wallet_id, rule.category_id, rule.kind, rule.amount,
           -- Tengah malam tanggal jatuh tempo di tz Profile (butir 6):
           -- occurrence "hari ini" tidak pernah future walau catch-up jalan pagi.
           ((due::text || ' 00:00:00')::timestamp at time zone tz),
           null, gen_random_uuid(),
           rule.id, due)
        on conflict (recurring_rule_id, occurred_on) do nothing;

        get diagnostics inserted_now = row_count;
        if inserted_now > 0 then
          wrote_rule := wrote_rule + 1;
          wrote_total := wrote_total + 1;
        end if;
      end if;

      month_cursor := (month_cursor + interval '1 month')::date;
    end loop;
  end loop;

  return wrote_total;
end;
$$;

comment on function public.run_recurring_catchup() is
  'Catch-up V3 (ADR-0005): menulis occurrence yang due ≤ hari ini dalam jendela starts/ends untuk rule aktif milik pemanggil, plafon 12 per rule per panggilan. Idempotent via unique (recurring_rule_id, occurred_on) termasuk soft-delete.';

revoke all on function public.run_recurring_catchup() from public, anon;
grant execute on function public.run_recurring_catchup() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Arsip wallet → auto-jeda rule
-- ---------------------------------------------------------------------------

create or replace function public.auto_pause_rules_on_wallet_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    update public.recurring_rules
       set status = 'paused'
     where wallet_id = new.id
       and user_id = new.user_id
       and status = 'active';
  end if;
  return new;
end;
$$;

comment on function public.auto_pause_rules_on_wallet_archive() is
  'Guard V3: mengarsip wallet menjeda semua rule aktif di wallet itu (banner Profile di klien). Buka-arsip TIDAK melanjutkan otomatis — user yang memutuskan.';

revoke all on function public.auto_pause_rules_on_wallet_archive() from public, anon, authenticated;

drop trigger if exists wallets_auto_pause_rules on public.wallets;

create trigger wallets_auto_pause_rules
  after update of archived_at on public.wallets
  for each row execute function public.auto_pause_rules_on_wallet_archive();

-- ---------------------------------------------------------------------------
-- RLS + grants — deny-by-default, pola T2 (100% tabel, tanpa USING (true))
-- ---------------------------------------------------------------------------

alter table public.recurring_rules enable row level security;

drop policy if exists recurring_rules_select_own on public.recurring_rules;
drop policy if exists recurring_rules_insert_own on public.recurring_rules;
drop policy if exists recurring_rules_update_own on public.recurring_rules;
drop policy if exists recurring_rules_delete_own on public.recurring_rules;

create policy recurring_rules_select_own on public.recurring_rules
  for select to authenticated using (user_id = (select auth.uid()));
create policy recurring_rules_insert_own on public.recurring_rules
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy recurring_rules_update_own on public.recurring_rules
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recurring_rules_delete_own on public.recurring_rules
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.recurring_rules to authenticated;
grant all on public.recurring_rules to service_role;
revoke all on public.recurring_rules from anon;
