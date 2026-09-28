# Auth email via Resend SMTP relay, templates in Supabase Dashboard

Supabase's built-in mailer caps auth email at a low inbuilt rate with no SLA
and sends from a shared identity, while the V0 gate (unconfirmed users park at
Check Email) makes confirmation deliverability load-bearing. So production
mail goes through a custom SMTP relay: Resend (`smtp.resend.com:465/587`,
user `resend`, API key as password), sending as `noreply@cashtrix.my.id`
(sender name "Cashtrix"). Resend was picked for simplest DX at this volume
(free tier covers us); Postmark (best transactional deliverability) and SES
(cheapest at scale) stay as the switch candidates if volume or inboxing
demands it. Templates (confirmation + recovery, Indonesian) stay in Supabase —
Resend only relays — with `{{ .ConfirmationURL }}` preserved verbatim because
it carries the deep-link `RedirectTo` (`cashtrix://check-email`,
`cashtrix://reset-password`); dropping it kills the V0 gate. The repo holds
source-of-truth copies (`supabase/templates/*.html`); hosted state is applied
via Dashboard / Management API, never `supabase config push` from this repo
(the local `config.toml` holds template values and a push would overwrite
hosted site_url, MFA, and Twilio settings).

**Considered**: Dashboard-only template restyle with no SMTP (rejected, it
fixes branding but leaves rate limits and deliverability untouched); Resend
via API plus the send-email Auth Hook with full React-Email control
(rejected, hook endpoint plus signing plus latency for zero current need);
Postmark/SES now (rejected, DX cost without a deliverability complaint).

Cost: no code, no DDL, no native module. DNS records (SPF/DKIM/DMARC) on
`cashtrix.my.id` plus one API key, owner-held, never in git.
