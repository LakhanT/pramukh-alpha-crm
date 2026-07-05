# RBAC & Permissions Design

## Permission Model

Permissions are stored as triples: **resource** + **action** + **scope**.

| Resource | Actions | Scope |
|----------|---------|-------|
| `task` | create, read, update, delete, assign | project |
| `project` | create, read, update, delete, manage_members | project / global |
| `comment` | create, read, update, delete | project |
| `attachment` | create, read, delete | project |
| `user` | read, update | global |
| `role` | create, read, update, delete | global |

## Default Role Matrix

| Permission | Admin | Manager | Team Lead | Member | Viewer |
|------------|:-----:|:-------:|:---------:|:------:|:------:|
| task:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| task:read | ✓ | ✓ | ✓ | ✓ | ✓ |
| task:update | ✓ | ✓ | ✓ | ✓ | ✗ |
| task:delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| task:assign | ✓ | ✓ | ✓ | ✗ | ✗ |
| project:manage_members | ✓ | ✓ | ✗ | ✗ | ✗ |
| project:update | ✓ | ✓ | ✗ | ✗ | ✗ |
| project:delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| comment:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| comment:delete | ✓ | ✓ | ✓ | own | ✗ |
| attachment:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| role:manage (global) | ✓ | ✗ | ✗ | ✗ | ✗ |

## Middleware Logic

```
1. authenticate(req) → decode JWT, attach req.user
2. requirePermission(resource, action)(req) →
   a. If req.user.systemRole === 'ADMIN' → allow
   b. Resolve projectId from req.params or req.body
   c. Lookup project_members for (userId, projectId) → roleId
   d. Query role_permissions JOIN permissions
      WHERE resource = X AND action = Y AND scope = 'project'
   e. If no match → 403 Forbidden
3. requireSystemAdmin(req) → systemRole must be ADMIN
```

## Project-Scoped Roles

A user can be **Manager** in Project A and **Viewer** in Project B. The middleware always resolves permissions against the **current project's** membership role.

## Escalation Rule

When a task is overdue by `escalation_days` (default 3, per user preference):
1. Cron job finds overdue tasks
2. Looks up project members with Manager role
3. Creates `ESCALATION` notification for managers

## Implementation Files

- `backend/src/services/permission.service.ts` — permission check logic
- `backend/src/middleware/auth.ts` — JWT authentication
- `backend/src/middleware/rbac.ts` — `requirePermission()` factory
