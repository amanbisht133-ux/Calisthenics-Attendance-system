# CalisthenicsHQ — Attendance & Membership Tracker

Internal operations tool for a calisthenics gym: ties membership validity to
daily class attendance so trainers can instantly flag expired members on the
floor, with a full audit trail and automated reporting to the admin.

**Stack:** React + TypeScript + Vite + Tailwind CSS, backed by Supabase
(Postgres, Auth, Row Level Security, Edge Functions, pg_cron) with Resend for
transactional email and SheetJS (`xlsx`) for Excel exports.

## 1. Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) project
- A free [Resend](https://resend.com) account (for automated emails) — optional until you wire up email automation
- The [Supabase CLI](https://supabase.com/docs/guides/cli) if you want to run migrations/deploy functions from your machine

## 2. Set up the Supabase project

1. Create a new project at [supabase.com](https://supabase.com/dashboard).
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Copy `.env.example` to `.env` and paste those values in:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxxx
   ```

4. Run the migrations in `supabase/migrations/` **in order** — either:
   - Paste each file's contents into the Supabase Dashboard → **SQL Editor** and run them one at a time (`0001` → `0005`), or
   - Link the CLI and push them: `supabase link --project-ref <your-ref>` then `supabase db push`.

   > `0005_cron.sql` schedules the two report emails via `pg_cron` + `pg_net`.
   > It contains two placeholders (`<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`)
   > that only matter once you've deployed the Edge Functions (step 4 below).
   > You can safely skip `0005` until then, or set up the same two schedules
   > from **Database → Cron Jobs** in the dashboard instead.

5. Create your first **admin** account:
   - Dashboard → **Authentication → Users → Add User**, set an email + password, confirm the email.
   - Then in **SQL Editor**, promote them to admin:
     ```sql
     update public.profiles set role = 'admin' where email = 'you@yourgym.com';
     ```
   - Trainer accounts should be created afterwards from inside the app (**Admin → Trainers → Add Trainer**), which calls the `create-trainer` Edge Function.

## 3. Run the app locally

```bash
npm install
npm run dev
```

Visit the printed local URL, sign in with the admin account you created.

## 4. Deploy Edge Functions (email automation + trainer creation)

```bash
supabase functions deploy create-trainer
supabase functions deploy daily-demo-report
supabase functions deploy weekly-expired-report

# Secrets used by the report functions:
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set REPORT_FROM_EMAIL="CalisthenicsHQ <reports@yourdomain.com>"
```

Then either re-run `0005_cron.sql` with your real project ref + service role
key filled in, or add the two schedules manually from **Database → Cron
Jobs** in the dashboard, pointing at:

- `https://<project-ref>.supabase.co/functions/v1/daily-demo-report` (daily)
- `https://<project-ref>.supabase.co/functions/v1/weekly-expired-report` (weekly)

with header `Authorization: Bearer <service-role-key>`.

You can also trigger either function manually any time to test it:

```bash
supabase functions invoke daily-demo-report
supabase functions invoke weekly-expired-report
```

## How access control works

- **Admin**: full CRUD on members, batches, trainers; sees everything.
- **Trainer**: read-only on members/batches, scoped by Row Level Security to
  only the batches they're assigned to (`trainer_batches`) and their own PT
  clients (`pt_clients`). Trainers can only **insert** attendance records,
  entries, demo visitors and PT sessions — there are no update/delete
  policies on those tables for anyone, which is what makes the audit trail
  immutable once a trainer hits "Submit".

## Data model highlights

- `members.expiry_date` is auto-calculated by a trigger from `plan` +
  `start_date` (monthly/quarterly/half-yearly) — renewing a member just
  updates `start_date`/`plan` and the expiry recalculates itself.
- `attendance_entries` captures `member_status_at_time` and `is_post_expiry`
  automatically via trigger at insert time, which is what powers the live
  **Expired Memberships** page and the **Exception Report**
  (`v_expired_members` / `v_exception_report` views).
- Personal Training isn't a time-slot batch — it's modeled as a
  trainer↔member pairing (`pt_clients`) with its own append-only session log
  (`pt_sessions`).

## Project structure

```
supabase/
  migrations/        Schema, RLS policies, views, seed batches, cron
  functions/          Edge Functions (Deno): create-trainer, daily-demo-report, weekly-expired-report
src/
  lib/                Supabase client, types, date/status utils, Excel export
  context/            Auth context (session + profile + role)
  components/         Layouts (Admin/Trainer shells) + shared UI primitives
  pages/trainer/       Trainer dashboard, batch attendance, PT sessions
  pages/admin/          Overview, Members, Batches, Trainers, logs, live reports, Excel reports
```

## Notes on this build

This was built in the phased order suggested for iterative reliability:

1. Data models + auth + batches (schema, RLS, seed batches, login)
2. Trainer attendance flow (today's batches, roster, checkboxes, demo
   visitors, PT session log, immutable submit)
3. Admin dashboard + reports (overview, members/batches/trainers management,
   attendance/demo/PT logs, live Expired Memberships + Exception Report,
   Excel exports)
4. Email automation (Edge Functions + Resend + pg_cron)
