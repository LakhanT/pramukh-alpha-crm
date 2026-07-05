# Database Schema — ER Diagram Description

## Entity Relationship Overview

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│    User     │──────<│  ProjectMember   │>──────│   Project   │
│             │       │  (role_id FK)    │       │             │
│ system_role │       └────────┬─────────┘       │  owner_id   │
└──────┬──────┘                │                 └──────┬──────┘
       │                       │                        │
       │              ┌────────▼────────┐               │
       │              │      Role       │               │
       │              │  (permissions)  │               │
       │              └────────┬────────┘               │
       │                       │                        │
       │              ┌────────▼────────┐               │
       │              │ RolePermission  │               │
       │              └────────┬────────┘               │
       │                       │                        │
       │              ┌────────▼────────┐               │
       │              │  Permission     │               │
       │              └─────────────────┘               │
       │                                                │
       │         ┌──────────────────────────────────────┘
       │         │
       │    ┌────▼────┐     ┌──────────────┐     ┌─────────────┐
       └───>│  Task   │────<│ TaskAssignee │>────│    User     │
            │         │     └──────────────┘     └─────────────┘
            │ parent  │     ┌──────────────┐
            │ (self)  │────<│ TaskWatcher  │
            └────┬────┘     └──────────────┘
                 │
     ┌───────────┼───────────┬──────────────┬──────────────┐
     │           │           │              │              │
┌────▼────┐ ┌────▼────┐ ┌────▼────┐  ┌──────▼──────┐ ┌─────▼──────┐
│ Comment │ │Attachmt │ │ TaskTag │  │TaskDependency│ │ActivityLog │
└─────────┘ └─────────┘ └────┬────┘  └─────────────┘ └────────────┘
                               │
                          ┌────▼────┐
                          │   Tag   │
                          └─────────┘
```

## Tables Summary

| Table | Purpose |
|-------|---------|
| `users` | Accounts with global system role (ADMIN/MEMBER) |
| `refresh_tokens` | JWT refresh token storage |
| `roles` | Configurable roles (Admin, Manager, Team Lead, Member, Viewer) |
| `permissions` | Atomic permissions (resource + action + scope) |
| `role_permissions` | Many-to-many role ↔ permission mapping |
| `projects` | Workspaces with owner and visibility |
| `project_members` | User membership in project with project-specific role |
| `tasks` | Core task entity with subtasks, recurrence, custom fields |
| `task_assignees` | Multi-assignee support |
| `task_watchers` | Users watching task updates |
| `task_dependencies` | Task blocking relationships |
| `tags` / `task_tags` | Project-scoped labels |
| `assignment_history` | Reassignment audit trail |
| `comments` | Task comments with @mention user IDs |
| `attachments` | File metadata linked to tasks |
| `activity_logs` | Field-level change audit trail |
| `notifications` | In-app notification queue |
| `notification_preferences` | Per-user notification settings |

## Key Design Decisions

1. **Project-scoped RBAC**: Users hold different `role_id` per project via `project_members`, not a single global role.
2. **System Admin**: `users.system_role = ADMIN` bypasses permission checks for admin panel access.
3. **Permissions matrix**: Stored in DB (`permissions` + `role_permissions`), not hardcoded — editable via Admin API.
4. **Activity log**: Every task field change creates a row with `old_value` → `new_value`.
5. **Multi-assignee**: `task_assignees` junction table supports assigning to multiple users.

## Assumptions

- File storage uses local `/uploads` directory (configurable to S3 via env).
- Recurrence uses a simple cron/RRULE string; full scheduler is a future enhancement.
- `custom_fields` stored as JSONB for flexibility per project.
