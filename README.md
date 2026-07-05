# Pramukh Alpha — Task Management System

A full-stack task management system with configurable RBAC, real-time updates, audit logging, and notifications.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT access tokens + refresh tokens |
| Real-time | Socket.io |
| Hosting | Docker Compose (self-hosted) |

## Quick Start (Docker)

```bash
# Start PostgreSQL + Backend + Frontend
docker compose up --build -d

# Run migrations and seed data (first time)
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx tsx prisma/seed.ts

# Open app
# Frontend: http://localhost
# API: http://localhost:3001/api/v1
```

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16+

### Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Admin Accounts

Default password: `Admin@123`

| Email | Name | Role |
|-------|------|------|
| lakhan@pramukhalpha.com | Lakhan Togadiya | System Admin |
| bharat@pramukhalpha.com | Bharat Gothi | System Admin |

Re-seed after changes: `cd backend && npm run db:seed`

## Documentation

- [Database Schema](docs/SCHEMA.md) — ER diagram and table descriptions
- [API Reference](docs/API.md) — All endpoints with request/response shapes
- [RBAC Design](docs/RBAC.md) — Permissions matrix and middleware logic

## Features

- **Task Management**: CRUD, subtasks, dependencies, tags, recurring tasks, bulk actions
- **Views**: Kanban board, list view, calendar view
- **RBAC**: Configurable roles per project (Admin, Manager, Team Lead, Member, Viewer)
- **Notifications**: In-app + email for due dates, overdue, mentions, reassignments, escalation
- **Audit Trail**: Field-level change logging with activity timeline
- **Collaboration**: Comments with @mentions, file attachments, real-time updates
- **Reporting**: Completion rates, overdue reports, CSV export, workload view
- **Admin Panel**: Role/permission management, audit log, user list

## Architecture Decisions

1. **Project-scoped RBAC** — Users have different roles per project via `project_members`, not a single global role.
2. **Permissions in DB** — The permissions matrix is stored in PostgreSQL, editable via Admin API (not hardcoded).
3. **JWT + Refresh tokens** — Short-lived access tokens (15min) with revocable refresh tokens in DB.
4. **Socket.io rooms** — `project:{id}` and `task:{id}` rooms for targeted real-time updates.
5. **Cron notifications** — Daily job at 8 AM processes due-date reminders and overdue escalations.

## Assumptions

- File uploads stored locally in `/uploads` (S3 can be configured via env).
- Email requires SMTP configuration in `.env` (logs to console in dev without SMTP).
- Recurrence rule stored as string; full scheduler is a future enhancement.
- PDF export not implemented; CSV export available via `/reports/export?format=csv`.

## Running Tests

```bash
cd backend
npm test
```

Tests cover RBAC permission checks and notification preference logic.
