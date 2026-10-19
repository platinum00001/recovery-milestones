# Recovery Milestones: going live (click-by-click)

## Current status (October 19, 2026)

Already done (by Grok Bot, with your approval):
- **Database:** `supabase/migrations/001_init.sql` is applied to the **james-sites** project
  (`oiousqgzqcjanikglkxl`) in its own `milestones` schema. Nothing in `public` or the other schemas was touched.
  No seed data was loaded except three coach profiles clearly labeled **(Example)**, so the coach page isn't empty.
- **Site config:** `js/config.js` holds the project URL and the *publishable* key (safe to publish; RLS protects
  the data). The preview banner and sample-data role switcher no longer show; the live site uses the real database.
- **Edge functions deployed:** `milestone-notify` (dry run: logs only, sends nothing until `RESEND_API_KEY` is set;
  returns 403 until `CRON_SECRET` is set), `milestones-unsubscribe`, `milestones-checkout` (returns "payments not
  enabled" because `PAYMENTS_ENABLED` is not `true`).
- **Not done on purpose:** no cron schedule (step 8), no payments, no Google/Facebook buttons yet
  (`AUTH_PROVIDERS: []` in `js/config.js`; email magic link only).

Still to do, in this order — each needs your own dashboard login:
1. **Expose the schema (blocking):** step 2b below. Until this is done, every data call returns
   "Invalid schema: milestones" and the pages show empty states.
2. **Redirect URL:** step 5, add `https://platinum00001.github.io/recovery-milestones/**` to Auth → URL
   Configuration → *Redirect URLs*. Leave the **Site URL** as it is (other sites use this project).
3. **Make yourself admin:** step 2c.
4. **Resend:** step 6, then set the function secrets in step 7 (`RESEND_API_KEY`, `RESEND_FROM`, `SITE_URL`,
   `CRON_SECRET`). Until Resend is set up, Supabase's built-in email only delivers magic links to members of your
   Supabase team and is rate-limited — add Resend as custom SMTP (Auth → SMTP) for real members.
5. **Google sign-in:** step 3, then add `'google'` to `AUTH_PROVIDERS` in `js/config.js`.
6. **Facebook Login:** step 4, then add `'facebook'` to `AUTH_PROVIDERS`.
7. **TODO — contact email:** the site uses the placeholder `contact@recoverymilestones.example`. Supply a real
   contact address and replace it everywhere (`rg -l recoverymilestones.example`): `js/config.js`, `about.html`,
   `privacy.html`, `impact.html`, `js/pages/unsubscribe.js`, `supabase/functions/_shared/email.ts`,
   `supabase/functions/milestones-checkout/index.ts`, and this file.
8. **Cron:** step 8, only once emails are tested.

---

Do these steps in order. Steps marked **(James)** need your own
logins (Google, Facebook, Supabase, Resend, GitHub). Everything is on free tiers.

Placeholders:
- `<project-ref>` is the Supabase project ref, for example `oiousqgzqcjanikglkxl` for **james-sites**.
- `<site>` is the public site address, for example `https://recovery-milestones.vercel.app` or your own domain.

---

## 0. Decisions first

- **Which Supabase project?** The Supabase **free plan allows 2 active projects**, and your org
  (*platinum00001's Org*) already has 2: **james-sites** and **restaurant-exchange**. Your options:
  - **Recommended: use `james-sites`.** All Recovery Milestones tables live in their own schema, `milestones`,
    so they don't collide with the tables already there (chef, wellness, tanorama, and others).
    The catch: sign-ins (`auth.users`) and the project's Auth settings are **shared** with the other sites in
    that project. That's why step 5 only *adds* redirect URLs and never changes the Site URL. It's also why
    "Delete my data" deletes the person's Recovery Milestones data but not their shared sign-in identity.
    An admin can remove that identity in Authentication → Users if asked.
  - Or pause a project you no longer need and create a dedicated `recovery-milestones` project. This is the
    cleanest option for privacy. It's still $0 on the free plan, but only 2 projects can be active at once.
- **Domain (optional).** `recoverymilestones.com` is registered by someone else. `recoverymilestones.org`
  *appeared* unregistered when we looked, but that's **unverified**, so check at a registrar before you plan
  around it. You can start on the free `*.vercel.app` or `*.github.io` address.
- **Hosting.** The site is plain static files, so any of these works:
  - **GitHub Pages:** free, and fine for a nonprofit.
  - **Vercel Hobby:** free, but officially for non-commercial use. A nonprofit community site is generally okay.
    Move to Pro if it ever becomes commercial.
  - **Netlify** or **Cloudflare Pages:** both have free tiers.

---

## 1. GitHub repo **(James, or Grok Bot once you approve)**

1. Go to github.com → **+** → **New repository**.
2. Fill it in:
   - Owner: `platinum00001`. Name: `recovery-milestones`.
   - **Public** if you want free GitHub Pages; otherwise private.
   - Don't add a README, because the project already has one.
3. Push the local folder:
   ```bash
   cd recovery-milestones
   git init -b main && git add . && git commit -m "Recovery Milestones v0.1"
   git remote add origin https://github.com/platinum00001/recovery-milestones.git
   git push -u origin main
   ```
   `.gitignore` already excludes `node_modules/` and `.env*`. **Never commit the service_role key, the Resend
   key or the Stripe keys.** Only the anon/publishable key goes in `js/config.js`.

---

## 2. Supabase database **(James)**

### 2a. Run the migration
1. Go to supabase.com/dashboard → choose your project → **SQL Editor** → **New query**.
2. Paste all of `supabase/migrations/001_init.sql` → **Run**. It should say "Success. No rows returned."
3. *(Optional, for a demo)* Paste `supabase/seed.sql` → **Run**.
   - This adds **example** coaches, businesses and offers, all labeled "(Example)".
   - The cleanup SQL at the bottom of that file removes them. **Run it before launch.**

### 2b. Expose the schema to the API
1. Go to **Project Settings → Data API** (older dashboards call it "API").
2. Under **Exposed schemas**, add `milestones` (keep `public`) → **Save**.
3. **Don't** run the generic `GRANT ALL ...` snippet from Supabase's "custom schemas" guide. The migration
   already grants exactly what's needed, and GRANT ALL would weaken the column-level protections.

### 2c. Make yourself admin
1. Sign in on the live site once, so your account exists.
2. Then run this in the SQL Editor:
   ```sql
   update milestones.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR-SIGN-IN-EMAIL');
   ```
   Use whichever email you actually signed in with.

### 2d. Check security
Go to **Advisors → Security Advisor**. Every `milestones` table should show RLS enabled.

---

## 3. Google sign-in (OAuth client) **(James)**

1. Go to console.cloud.google.com → pick or create a project (for example "Recovery Milestones") → **APIs & Services → OAuth consent screen**.
   - In newer consoles this is **Google Auth Platform → Branding / Audience**.
   - User type: **External** → **Create**.
   - App name: `Recovery Milestones`. Support email: `contact@recoverymilestones.example`.
   - App logo: optional (adding one can trigger Google's verification review).
   - App domain:
     - Home page: `<site>`
     - Privacy policy: `<site>/privacy.html`
   - Authorized domains: your site's domain, for example `vercel.app` or your own domain, **and** `supabase.co`.
   - Developer contact: your email → **Save and continue**.
   - **Scopes:** add only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are
     non-sensitive, so no verification is needed.
   - **Audience / Publishing status:** click **Publish app** so it's "In production". Otherwise only test users
     can sign in.
2. Go to **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
   - Application type: **Web application**. Name: `Recovery Milestones (Supabase)`.
   - **Authorized JavaScript origins:** `<site>` (and `http://localhost:8080` for testing).
   - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
   - Click **Create**, then copy the **Client ID** and **Client secret**.
3. In Supabase, go to **Authentication → Sign In / Providers → Google** → toggle **Enable**.
   Paste the Client ID and Client Secret → **Save**.
   *(If Google is already enabled in james-sites for another site, you can reuse that client. Just add your
   site's origin to that client in Google Cloud.)*

## 4. Facebook Login **(James — you already have a developer account)**

1. Go to developers.facebook.com → **My Apps → Create App**.
   - Use case: **"Authenticate and request data from users with Facebook Login"** → Next.
   - App name: `Recovery Milestones`. Contact email: `contact@recoverymilestones.example`.
   - Business portfolio: optional → **Create app**.
2. In the left menu, go to **Use cases → Authentication and account creation → Customize**
   (older layout: **Add product → Facebook Login → Set up → Web**).
   - Under **Permissions**, make sure `email` and `public_profile` are added. Nothing else is needed.
3. Go to **Facebook Login → Settings**.
   - **Valid OAuth Redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
   - Keep **Client OAuth login** and **Web OAuth login** set to **Yes** → **Save changes**.
4. Go to **App settings → Basic**.
   - **App domains:** your site domain (for example `recovery-milestones.vercel.app`) and `<project-ref>.supabase.co`.
   - **Privacy Policy URL:** `<site>/privacy.html`.
   - **User data deletion:** choose "Data deletion instructions URL" and enter `<site>/privacy.html#deleting-your-data`.
     The privacy page has a "Deleting your data" section.
   - **Category:** "Lifestyle" or "Health & fitness". **App icon:** 1024×1024.
   - Copy the **App ID** and **App Secret** (click Show) → **Save changes**.
5. Switch the top-bar toggle from **Development** to **Live** mode. In Development mode only app admins and
   testers can log in.
   - `email` and `public_profile` normally don't need App Review.
   - Facebook may ask you to complete **Business verification** or a data-use checkup. Follow its prompts.
6. In Supabase, go to **Authentication → Sign In / Providers → Facebook** → **Enable**.
   Paste the App ID as "Facebook client ID" and the App Secret → **Save**.

### Google + Facebook on the same login
- **Automatic linking is built in.** Supabase links identities that share the same *verified* email to one user.
  Someone who signs up with Google and later uses Facebook with the same email lands in the same account,
  with the same milestones. Nothing to switch on.
- **Optional manual linking:** for people whose Facebook email differs (or who signed up on Facebook with a
  phone number and no email):
  - Go to **Authentication → Sign In / Providers** (or **Auth → Configuration**) and turn on **Allow manual linking**.
  - Settings then shows "Also link Google / Facebook" buttons, which call `supabase.auth.linkIdentity()`.
  - If it's off, those buttons just show an error, and nothing breaks.
- The sign-in panel always lists **Google first, then Facebook, then email magic link**. You can change this in
  `AUTH_PROVIDERS` in `js/config.js`.

---

## 5. Supabase Auth URL configuration **(James)**

1. Go to **Authentication → URL Configuration**.
2. **Site URL:** if this is a dedicated project, set it to `<site>`.
   **In shared james-sites, leave the Site URL alone**, because other sites rely on it. The app always passes
   its own `redirectTo`.
3. **Redirect URLs → Add URL:**
   - `<site>/app.html`
   - `<site>/settings.html`
   - `<site>/**` *(optional wildcard)*
   - `http://localhost:8080/**` *(for local testing)*
4. **Magic-link emails:** Supabase's built-in email sender is heavily rate-limited (a few emails per hour).
   For real use, go to **Authentication → Emails → SMTP Settings** → enable custom SMTP with Resend:
   - Host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key.
   - Sender = an address on your verified domain.

---

## 6. Resend (milestone and reminder emails) **(James)**

1. Sign up at resend.com. The free tier currently allows about **3,000 emails/month and 100/day**.
2. Choose a sender:
   - **Quick test:** use `onboarding@resend.dev`. It **only delivers to your own Resend account email**,
     which is fine for testing.
   - **Real use:** go to **Domains → Add domain** (for example `recoverymilestones.org` or a subdomain of your
     site's domain). Add the DNS records Resend shows (SPF/DKIM via TXT and MX) at your registrar, then wait
     for "Verified".
3. Go to **API Keys → Create API key** with "Sending access" → copy it. You'll only see it once.

## 7. Edge functions and secrets **(James, about 10 minutes)**

You need Node.js. The Supabase CLI runs via `npx`.

```bash
cd recovery-milestones
npx supabase login
npx supabase link --project-ref <project-ref>

# secrets (never commit these)
npx supabase secrets set \
  RESEND_API_KEY=re_xxx \
  RESEND_FROM="Recovery Milestones <hello@yourdomain.org>" \
  CRON_SECRET=$(openssl rand -hex 32) \
  SITE_URL=<site> \
  DB_SCHEMA=milestones \
  PAYMENTS_ENABLED=false
npx supabase secrets list            # note: you'll need the CRON_SECRET value again in step 8

npx supabase functions deploy milestone-notify --no-verify-jwt   # protected by the x-cron-secret header
npx supabase functions deploy milestones-unsubscribe --no-verify-jwt   # public one-click unsubscribe (token-based)
npx supabase functions deploy milestones-checkout                    # stays disabled while PAYMENTS_ENABLED=false
```

Notes:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.
- To test safely, first set `DRY_RUN=true` with `npx supabase secrets set DRY_RUN=true`. Then run:
  ```bash
  curl -X POST "https://<project-ref>.supabase.co/functions/v1/milestone-notify?task=all" -H "x-cron-secret: <CRON_SECRET>"
  ```
  It returns counts and logs "[DRY_RUN] would email …" without sending anything. When it looks right, set
  `DRY_RUN=false`.

## 8. Turn on the schedule (pg_cron) **(James)**

1. Go to **Database → Extensions** → enable **pg_cron** and **pg_net**. The migration also tries to do this.
2. In the SQL Editor, store the two values the cron jobs need:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'rm_project_url');
   select vault.create_secret('<the CRON_SECRET from step 7>', 'rm_cron_secret');
   ```
3. Paste `supabase/migrations/002_schedule.sql` → **Run**. This creates two jobs:
   - `rm-milestone-notify-daily` runs at 13:00 UTC, which is 9 AM Eastern in summer and 8 AM in winter.
   - `rm-meeting-reminders-hourly` runs at the top of every hour.
4. To check: `select * from cron.job;`. After a run: `select * from cron.job_run_details order by start_time desc limit 5;`.
   Function logs are under **Edge Functions → milestone-notify → Logs**.

---

## 9. Site config and deploy **(Grok Bot can do this once you approve)**

1. Edit `js/config.js`:
   - `SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SUPABASE_ANON_KEY`: from **Project Settings → API Keys**. Either the publishable key (`sb_publishable_…`)
     or the legacy anon key works. **Never** the service_role or secret key.
   - `SITE_URL`: `<site>`
   - With real values, the preview banner disappears and the site uses Supabase.
2. Make the share-preview image absolute. Facebook needs a full URL:
   ```bash
   sed -i 's#content="assets/og-image.png"#content="<site>/assets/og-image.png"#' *.html
   ```
3. Deploy, using one of these:
   - **Vercel:**
     1. vercel.com → **Add New → Project** → import `platinum00001/recovery-milestones`.
     2. Framework preset: **Other**. No build command. Output directory: `.` (root) → **Deploy**.
   - **GitHub Pages:** repo **Settings → Pages** → Source **Deploy from a branch** → `main` / `/ (root)` → **Save**.
4. Add the final `<site>` everywhere it's needed:
   - Google: JavaScript origins (step 3).
   - Facebook: App domains (step 4).
   - Supabase: Redirect URLs (step 5).
   - Edge functions: the `SITE_URL` secret (step 7).
5. **Custom domain (optional):** add it in Vercel → Project → Domains (or GitHub Pages → Custom domain), then
   repeat step 4.

## 10. Before announcing

- [ ] Run the cleanup block at the bottom of `seed.sql` to remove the example coaches and businesses.
- [ ] Add real coaches in Admin → Recovery coaches, only with each coach's written OK.
- [ ] Sign in with Google, then with Facebook using the same email. Confirm you land on the same dashboard.
- [ ] As a test business, register, then approve it from Admin. Post an offer, claim it as a member, and redeem it.
- [ ] Turn on milestone emails for a test member whose clean date is exactly 30 days ago. Run the function with
      `DRY_RUN=false` and confirm the email arrives and the unsubscribe link works.
- [ ] Share a celebration card to Facebook. Check the preview at developers.facebook.com/tools/debug.
- [ ] Have someone in recovery read the privacy policy and the landing page.

## Optional: featured-sponsor payments (later)

The defaults are `PAYMENTS_ENABLED=false` in `js/config.js` and in the function secret. While payments are off,
every tier shows **"Contact us to sponsor"**, a mailto to contact@recoverymilestones.example, and admins set
featured/tier by hand.

To take card payments later, use one of these:
- **Payment Links:** the simplest option.
  1. In Stripe, go to **Product catalog** → create one product per tier (recurring monthly).
  2. On each one: **Create payment link**.
  3. Paste the links into `STRIPE_PAYMENT_LINKS` and set `PAYMENTS_ENABLED: true` and `PAYMENT_MODE: 'payment_links'`.
  4. When Stripe shows a payment, an admin marks the business featured.
- **Checkout via edge function:**
  1. Set the function secrets `PAYMENTS_ENABLED=true`, `STRIPE_SECRET_KEY` (start with an `sk_test_…` key)
     and `STRIPE_PRICE_SPROUT/BRANCH/CANOPY`.
  2. In config, set `PAYMENT_MODE: 'checkout'`.
  3. **Still to build:** a `stripe-webhook` function that verifies the Stripe signature and flips `featured`
     automatically.

## Local development

```bash
node tools/serve.mjs 8080     # preview mode with fictional data
npm test                      # unit tests
npm run test:sql              # migration + RLS tests on a local Postgres (if installed)
npm i && npm run smoke        # headless Chrome checks + preview-*.png screenshots
```
