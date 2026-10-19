# Recovery Milestones

**Like birthday rewards, but for recovery.** Members track their clean date privately, collect milestone
badges, claim small rewards from local businesses, share a celebration card if they want to, and let the
sponsors, friends and family they invite cheer them on.

Based in Falmouth, MA. Contact: contact@recoverymilestones.example (**placeholder — TODO: supply a real
contact email**, see `docs/SETUP.md`). Repo: `platinum00001/recovery-milestones`. Live:
https://platinum00001.github.io/recovery-milestones/

> **Status: v0.2, connected to Supabase.** The site uses the real database in the `milestones` schema of the
> james-sites Supabase project (no sample data; the three coach profiles are labeled Example). Sign-in is email
> magic link for now; Google and Facebook are added after their OAuth setup. Emails run in dry-run mode until a
> Resend key is set, payments are off, and the cron schedule is not enabled. Remaining manual steps are listed at
> the top of `docs/SETUP.md` (the first one, exposing the `milestones` schema in the Data API settings, is required
> before any data loads). The old local preview backend (`js/backend-demo.js`) only runs if `js/config.js` holds
> placeholder values; it is never shown on the live site.

## Features

| Area | What it does |
|---|---|
| **Sign-in** | Google first, then Facebook, plus an email magic link (Supabase Auth `signInWithOAuth` / `signInWithOtp`). Accounts with the same verified email are linked automatically; Settings can also link the other provider by hand. |
| **Milestone tracker** | 24 hours, 30/60/90 days, 6 and 9 months, 1 year, then every year after. Shows days clean, the next milestone with a live countdown, a progress bar and a timeline. Pure logic lives in `js/milestones.js` (unit tested), mirrored in SQL. |
| **Privacy** | The sobriety date is **private by default**. The name and date appear on the wall or cards only through opt-in toggles. Members can export their data as JSON and delete it. |
| **Daily check-in** | One tap a day, with current and best streak (`js/streak.js`). A missed day starts a new streak; clean time doesn't change. |
| **Badge / chip wall** | A coin-style badge for each milestone reached, plus upcoming locked badges. Private by default, with an opt-in public link (`wall.html?u=<slug>`) and a Facebook Share Dialog button. |
| **Supporter shout-outs** | Members add sponsors or friends by email and must confirm the supporter agreed (the consent is stored). On milestone days, supporters the member enabled get an email with a link to leave a note. Notes stay pending until the member approves them. |
| **Business rewards portal** | A separate business role. Businesses register (pending until an admin approves them), edit their profile and map location, and post offers that target chosen milestones, with a type and value, start and end dates, rules, a per-person limit and a total limit. |
| **Reward codes** | Each claim gets a unique 8-character code (no look-alike characters) and a client-side QR code. The QR encodes `redeem.html?code=…`. Codes work once and expire after 30 days or when the offer ends. Members can claim a reward within 30 days of reaching a qualifying milestone. |
| **Redeem screen** | Businesses type or scan a code, and it's marked used. Businesses never see member names, emails or dates. |
| **Rewards map** | Leaflet with OpenStreetMap tiles. Featured sponsors get gold pins. Businesses type coordinates or press "Find on map" for a single Nominatim lookup (rate-limited, cached, attributed). |
| **Featured sponsors** | Admins set the featured flag and tier on each business. `sponsor.html` shows the pricing tiers. With `PAYMENTS_ENABLED=false` (the default), every tier offers a **"Contact us to sponsor" mailto to contact@recoverymilestones.example**. Scaffolding for Stripe Payment Links or Checkout (`milestones-checkout` edge function) is included, but no keys are wired. |
| **Celebration cards** | `card.html?id=…` shows only what the member ticked (for example "1 Year!" without the date). It has Open Graph tags and a Facebook Share Dialog button (`facebook.com/sharer/sharer.php?u=`). Nothing is ever auto-posted. |
| **Emails** | The `milestone-notify` edge function is triggered by pg_cron. A daily run sends milestone emails (opt-in), supporter shout-outs and one-time supporter invites. An hourly run sends meeting reminders (opt-in). Email goes through Resend's free tier, using the `RESEND_API_KEY` secret. Every email includes a one-click unsubscribe link and RFC 8058 `List-Unsubscribe` headers. |
| **Meeting reminders** | The member sets the day, time and label. Emails go out about an hour before, and only if the member opted in. |
| **Recovery coaches** | A coach directory managed by admins (the seed entries are clearly marked as **Example**) and a "request a coach" form. The form stores the exact consent text, and requests appear in the admin view for follow-up. |
| **Admin view** | Aggregate counts: members, active members, check-ins, businesses, offers, codes issued and redeemed, cards, supporters and opt-ins, broken down by month and by milestone. Includes CSV export for grant reports, business approval and featured/tier controls, coach management and coach requests. |
| **Funder impact page** | Public, aggregate totals only: milestones celebrated, rewards redeemed, active businesses and supporters engaged. Small-number suppression shows any count under 10 as `<10`, enforced server-side. |
| **Design** | Warm and hopeful, mobile-first and accessible: skip link, labels, focus rings, 44px tap targets and reduced-motion friendly. Uses no web fonts and no tracking scripts, and a CSP meta tag limits where the page can load from. Every page has crisis resources in the footer (988, SAMHSA 1-800-662-4357, 911). |

## Project layout

```
*.html                    16 static pages (index, app, wall, card, note, settings, map, business, redeem,
                          sponsor, impact, coaches, admin, about, privacy, unsubscribe)
css/styles.css            all styles
js/config.js              SUPABASE_URL / ANON_KEY placeholders, PAYMENTS_ENABLED flag, map + contact settings
js/milestones.js          pure milestone logic (tested)      js/streak.js   pure streak logic (tested)
js/format.js              suppression, CSV, codes, helpers (tested)
js/api.js                 picks the Supabase backend or the preview backend
js/backend-supabase.js    supabase-js v2 (jsDelivr CDN, pinned 2.118.0) wrappers
js/backend-demo.js        preview-mode backend (fictional data, localStorage only)
js/ui.js                  header/footer/crisis bar, sign-in panel, QR, share helpers
js/pages/*.js             one module per page
vendor/                   qrcode-generator 1.4.4 (MIT), Leaflet 1.9.4 (BSD-2)
assets/                   favicon, Open Graph image
supabase/migrations/001_init.sql      schema `milestones`, tables, RLS, RPCs, admin_stats view, starter tiers
supabase/migrations/002_schedule.sql  pg_cron + pg_net jobs (daily milestones, hourly reminders)
supabase/seed.sql                     EXAMPLE coaches/businesses/offers (all labeled "(Example)") + cleanup
supabase/functions/milestone-notify   daily/hourly email function (Deno/TypeScript)
supabase/functions/milestones-unsubscribe        RFC 8058 one-click unsubscribe endpoint
supabase/functions/milestones-checkout    Stripe Checkout scaffold (disabled unless PAYMENTS_ENABLED=true)
test/*.test.mjs           node --test unit tests (+ SQL/JS parity test when a local Postgres is present)
test/sql/                 local Supabase stub + RLS/RPC behaviour tests; run with test/run-sql-tests.sh
tools/serve.mjs           tiny local static server       tools/smoke.mjs   headless-Chrome smoke test + screenshots
docs/SETUP.md             click-by-click go-live steps for James
```

## Database tables (schema `milestones`)

`profiles`, `notification_prefs`, `businesses`, `sponsor_tiers`, `sponsorships`, `offers`, `reward_claims`,
`badges`, `celebration_cards`, `supporters`, `wall_notes`, `meeting_reminders`, `checkins`, `coaches`,
`coach_requests` and `notification_log` (service-only), plus the `admin_stats` view.

The RLS rules work like this:
- **Members** see only their own rows.
- **Businesses** see only their own business and offers. They reach claims only through `business_claims()` and `redeem_code()`, which never return member identity.
- **Admins** pass an `is_admin()` role check, and admin reporting is aggregate-only.
- **Public data** goes through narrow `SECURITY DEFINER` RPCs (`public_businesses`, `public_impact`, `public_wall`, `get_card`) that return only what someone opted to show.
- **Roles, approval status, featured flags and slugs** can't be edited by clients. Column-level grants block those columns.

All tables live in their own schema, so the app can share the existing `james-sites` Supabase project without
colliding with its tables.

## Run it locally

```bash
node tools/serve.mjs 8080        # → http://localhost:8080  (preview mode until config.js is filled in)
npm test                         # unit tests (node --test)
npm run test:sql                 # needs a local Postgres: migration + seed + RLS tests
npm i && npm run smoke           # headless Chrome page checks + preview-*.png screenshots
```

## Going live

See **[docs/SETUP.md](docs/SETUP.md)**. In short: create the GitHub repo, set up Supabase (expose the schema,
run the migrations, add secrets, deploy functions, schedule cron), set up Google OAuth, Facebook Login,
Resend and the Supabase URL settings, fill in `js/config.js`, then deploy to Vercel or GitHub Pages.

## Licenses

Code: MIT (see `LICENSE`). Vendored libraries keep their own licenses: qrcode-generator is MIT
(© Kazuhiko Arase) and Leaflet is BSD-2-Clause. Map data © OpenStreetMap contributors (ODbL).
