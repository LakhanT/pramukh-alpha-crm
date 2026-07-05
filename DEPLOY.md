# Pramukh Alpha — Deployment (Vercel + Supabase)

## 1. Supabase database

**Project:** `obwfdcjtqjdiuhulwpvi`  
**Dashboard:** https://supabase.com/dashboard/project/obwfdcjtqjdiuhulwpvi

Schema and seed are already applied. Admin logins:

| Company email | Password |
|---------------|----------|
| lakhan@pramukhalpha.com | Admin@123 |
| bharat@pramukhalpha.com | Admin@123 |

Connection strings for Vercel (region: **ap-northeast-1**):

```env
# Shared pooler — use for DATABASE_URL (runtime / serverless)
DATABASE_URL=postgresql://postgres.obwfdcjtqjdiuhulwpvi:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct — use for DIRECT_URL (Prisma migrations)
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.obwfdcjtqjdiuhulwpvi.supabase.co:5432/postgres
```

## 3. Vercel environment variables

In your Vercel project → **Settings → Environment Variables**:

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Supabase pooler URL (port 6543) |
| `DIRECT_URL` | Supabase direct URL (port 5432) |
| `JWT_ACCESS_SECRET` | Random 32+ char string |
| `JWT_REFRESH_SECRET` | Random 32+ char string |
| `FRONTEND_URL` | `https://your-app.vercel.app` |
| `CRON_SECRET` | Random string (Vercel Cron auth) |
| `NODE_ENV` | `production` |
| `UPLOAD_DIR` | `/tmp/uploads` |

Optional (email notifications):

| Variable | Notes |
|----------|-------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Your mail provider |

## 4. Deploy

**Live app:** https://pramukh-alpha-crm.vercel.app  
**GitHub:** https://github.com/LakhanT/pramukh-alpha-crm

Every push to `main` deploys automatically once GitHub is connected in Vercel → Project Settings → Git.

### Option A — Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Option B — GitHub

1. Push this repo to GitHub.
2. Import in [vercel.com/new](https://vercel.com/new).
3. Root directory: project root (contains `vercel.json`).
4. Add env vars from step 3.

## 5. Notes

- **Company email** (`@pramukhalpha.com`) is used for login only.
- **Personal email** receives task notifications and digests when set.
- **Real-time alerts** (Socket.io) are disabled on Vercel serverless; in-app notifications still work via API polling.
- **File uploads** on Vercel use `/tmp` (ephemeral). For persistent storage, connect Supabase Storage later.
- **Daily cron** runs at 8:00 UTC (due reminders, digests, recurring tasks).

## Color palette

| Role | Hex |
|------|-----|
| Primary / success | `#4A7C59` |
| Accent / warning | `#F2A679` |
| Background | `#F5F5F5` |
| CTA / danger | `#EF5B2D` |
| Sidebar / text | `#0F303A` |
