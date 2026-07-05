# API Route Reference

Base URL: `http://localhost:3001/api/v1`

All protected routes require `Authorization: Bearer <access_token>`.

---

## Auth

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/me` | Current user profile |

### POST `/auth/login`
**Request:**
```json
{ "email": "user@example.com", "password": "secret123" }
```
**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "uuid-token",
  "user": { "id": "...", "name": "...", "email": "...", "systemRole": "MEMBER" }
}
```

---

## Users

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/users` | global:user:read | List users (paginated) |
| GET | `/users/:id` | global:user:read | Get user |
| PATCH | `/users/:id` | global:user:update | Update user |
| GET | `/users/workload` | project:task:read | Task count per user |

---

## Projects

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/projects` | List user's projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Get project details |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/projects/:id/members` | List members |
| POST | `/projects/:id/members` | Add member with role |
| PATCH | `/projects/:id/members/:userId` | Update member role |
| DELETE | `/projects/:id/members/:userId` | Remove member |

### POST `/projects`
```json
{ "name": "Sprint Alpha", "description": "...", "visibility": "PRIVATE" }
```

---

## Tasks

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/projects/:projectId/tasks` | List tasks (filters, pagination) |
| POST | `/projects/:projectId/tasks` | Create task |
| GET | `/tasks/:id` | Get task with relations |
| PATCH | `/tasks/:id` | Update task (logs each field change) |
| DELETE | `/tasks/:id` | Delete task |
| POST | `/tasks/bulk` | Bulk assign/status/delete |
| GET | `/tasks/:id/activity` | Activity timeline |
| POST | `/tasks/:id/assignees` | Assign users |
| DELETE | `/tasks/:id/assignees/:userId` | Unassign user |
| GET | `/tasks/:id/assignments` | Reassignment history |

**Query params for list:** `status`, `priority`, `assigneeId`, `tag`, `dueBefore`, `dueAfter`, `page`, `limit`, `view` (list|kanban|calendar)

### POST `/projects/:projectId/tasks`
```json
{
  "title": "Implement login",
  "description": "...",
  "status": "TODO",
  "priority": "HIGH",
  "dueDate": "2026-07-15T00:00:00Z",
  "assigneeIds": ["uuid"],
  "tagIds": ["uuid"],
  "parentId": null,
  "dependencyIds": []
}
```

### POST `/tasks/bulk`
```json
{
  "taskIds": ["uuid1", "uuid2"],
  "action": "status_change",
  "payload": { "status": "DONE" }
}
```

---

## Comments

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/tasks/:taskId/comments` | List comments |
| POST | `/tasks/:taskId/comments` | Add comment (parses @mentions) |
| PATCH | `/comments/:id` | Edit own comment |
| DELETE | `/comments/:id` | Delete comment |

---

## Attachments

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/tasks/:taskId/attachments` | List attachments |
| POST | `/tasks/:taskId/attachments` | Upload file (multipart) |
| DELETE | `/attachments/:id` | Delete attachment |

---

## Tags

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/projects/:projectId/tags` | List project tags |
| POST | `/projects/:projectId/tags` | Create tag |
| DELETE | `/tags/:id` | Delete tag |

---

## Notifications

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/notifications` | List notifications (paginated) |
| PATCH | `/notifications/:id/read` | Mark as read |
| PATCH | `/notifications/read-all` | Mark all read |
| GET | `/notifications/preferences` | Get preferences |
| PATCH | `/notifications/preferences` | Update preferences |

---

## Admin (system ADMIN only)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/roles` | List all roles |
| POST | `/admin/roles` | Create role |
| PATCH | `/admin/roles/:id` | Update role |
| DELETE | `/admin/roles/:id` | Delete role (non-system) |
| GET | `/admin/permissions` | List permissions |
| PUT | `/admin/roles/:id/permissions` | Set role permissions |
| GET | `/admin/audit-log` | Full audit log (paginated) |

---

## Reports

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/reports/completion` | Completion rate per user/team |
| GET | `/reports/overdue` | Overdue tasks report |
| GET | `/reports/export` | Export CSV (`?format=csv`) |

---

## Pagination Response Shape

```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

## Error Response Shape

```json
{ "error": "Message", "code": "FORBIDDEN", "status": 403 }
```
