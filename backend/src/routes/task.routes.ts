import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate, parsePagination, paginatedResponse } from '../middleware/validate';
import * as taskService from '../services/task.service';
import { getTaskActivity, getTaskVersions, logUserAction } from '../services/audit.service';
import { prisma } from '../config/database';
import { canAccessProject } from '../services/permission.service';
import { param } from '../utils/params';

const router = Router();

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  parentId: z.string().uuid().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  dependencyIds: z.array(z.string().uuid()).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});

const bulkSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1),
  action: z.enum(['status_change', 'assign', 'delete']),
  payload: z.record(z.unknown()),
});

// List tasks in project
router.get(
  '/projects/:projectId/tasks',
  authenticate,
  requirePermission('task', 'read'),
  async (req: AuthRequest, res: Response) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const result = await taskService.listTasks(param(req.params.projectId), {
      status: req.query.status as never,
      priority: req.query.priority as never,
      assigneeId: req.query.assigneeId as string,
      tag: req.query.tag as string,
      dueBefore: req.query.dueBefore as string,
      dueAfter: req.query.dueAfter as string,
      scope: (req.query.scope as 'mine' | 'team' | 'all') || 'mine',
      sortBy: (req.query.sortBy as never) || 'position',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      viewerUserId: req.user!.id,
      viewerSystemRole: req.user!.systemRole,
      page,
      limit,
    });
    res.json(paginatedResponse(result.data, result.total, page, limit));
  }
);

// Create task
router.post(
  '/projects/:projectId/tasks',
  authenticate,
  requirePermission('task', 'create'),
  validate(createTaskSchema),
  async (req: AuthRequest, res: Response) => {
    const task = await taskService.createTask(param(req.params.projectId), req.user!.id, req.body);
    const io = req.app.get('io');
    io?.to(`project:${param(req.params.projectId)}`).emit('task:created', task);
    res.status(201).json({ task });
  }
);

// Get single task
router.get('/tasks/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const task = await taskService.getTaskById(param(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND', status: 404 });

  const allowed = await canAccessProject(req.user!.id, req.user!.systemRole, task.projectId);
  if (!allowed) return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN', status: 403 });

  res.json({ task });
});

// Update task
router.patch(
  '/tasks/:id',
  authenticate,
  requirePermission('task', 'update'),
  async (req: AuthRequest, res: Response) => {
    const task = await taskService.updateTask(param(req.params.id), req.user!.id, req.body);
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND', status: 404 });

    const io = req.app.get('io');
    io?.to(`project:${task.projectId}`).emit('task:updated', task);
    io?.to(`task:${param(req.params.id)}`).emit('task:updated', task);
    res.json({ task });
  }
);

// Delete task
router.delete(
  '/tasks/:id',
  authenticate,
  requirePermission('task', 'delete'),
  async (req: AuthRequest, res: Response) => {
    const existing = await prisma.task.findUnique({ where: { id: param(req.params.id) } });
    const deleted = await taskService.deleteTask(param(req.params.id), req.user!.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND', status: 404 });

    await logUserAction({
      userId: req.user!.id,
      action: 'task_delete',
      entityType: 'task',
      entityId: param(req.params.id),
      details: { title: existing?.title },
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent') || undefined,
    });

    const io = req.app.get('io');
    if (existing) io?.to(`project:${existing.projectId}`).emit('task:deleted', { id: param(req.params.id) });
    res.json({ message: 'Task deleted' });
  }
);

// Bulk actions
router.post('/tasks/bulk', authenticate, validate(bulkSchema), async (req: AuthRequest, res: Response) => {
  const results = await taskService.bulkAction(req.body.taskIds, req.body.action, req.body.payload, req.user!.id);
  res.json({ results });
});

// Task activity
router.get('/tasks/:id/activity', authenticate, async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const result = await getTaskActivity(param(req.params.id), page, limit);
  res.json(paginatedResponse(result.data, result.total, page, limit));
});

// Task version history
router.get('/tasks/:id/versions', authenticate, async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const result = await getTaskVersions(param(req.params.id), page, limit);
  res.json(paginatedResponse(result.data, result.total, page, limit));
});

router.post('/tasks/:id/versions/:version/restore', authenticate, requirePermission('task', 'update'), async (req: AuthRequest, res: Response) => {
  const version = parseInt(param(req.params.version), 10);
  if (Number.isNaN(version)) {
    return res.status(400).json({ error: 'Invalid version', code: 'BAD_REQUEST', status: 400 });
  }
  const task = await taskService.restoreTaskVersion(param(req.params.id), version, req.user!.id);
  if (!task) return res.status(404).json({ error: 'Task or version not found', code: 'NOT_FOUND', status: 404 });
  const io = req.app.get('io');
  io?.to(`project:${task.projectId}`).emit('task:updated', task);
  res.json({ task });
});

// Restore soft-deleted task
router.post('/tasks/:id/restore', authenticate, requirePermission('task', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const task = await taskService.restoreTask(param(req.params.id), req.user!.id);
    if (!task) return res.status(404).json({ error: 'Task not found or not deleted', code: 'NOT_FOUND', status: 404 });
    const io = req.app.get('io');
    io?.to(`project:${task.projectId}`).emit('task:created', task);
    res.json({ task });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Restore failed', code: 'BAD_REQUEST', status: 400 });
  }
});

// Assignees
router.post(
  '/tasks/:id/assignees',
  authenticate,
  requirePermission('task', 'assign'),
  async (req: AuthRequest, res: Response) => {
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds array required', code: 'BAD_REQUEST', status: 400 });
    }
    const tasks = [];
    for (const userId of userIds) {
      tasks.push(await taskService.assignUser(param(req.params.id), userId, req.user!.id));
    }
    res.json({ task: tasks[tasks.length - 1] });
  }
);

router.delete(
  '/tasks/:id/assignees/:userId',
  authenticate,
  requirePermission('task', 'assign'),
  async (req: AuthRequest, res: Response) => {
    const task = await taskService.unassignUser(param(req.params.id), param(req.params.userId), req.user!.id);
    res.json({ task });
  }
);

router.get('/tasks/:id/assignments', authenticate, async (req: AuthRequest, res: Response) => {
  const history = await prisma.assignmentHistory.findMany({
    where: { taskId: param(req.params.id) },
    include: {
      assignedTo: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: history });
});

router.get('/tasks/:id/subtasks', authenticate, async (req: AuthRequest, res: Response) => {
  const subtasks = await taskService.getSubtasks(param(req.params.id));
  res.json({ data: subtasks });
});

router.post('/tasks/:id/subtasks', authenticate, requirePermission('task', 'create'), async (req: AuthRequest, res: Response) => {
  const subtask = await taskService.createSubtask(param(req.params.id), req.user!.id, req.body);
  if (!subtask) return res.status(404).json({ error: 'Parent task not found', code: 'NOT_FOUND', status: 404 });
  res.status(201).json({ task: subtask });
});

router.post('/tasks/:id/tags', authenticate, requirePermission('task', 'update'), async (req: AuthRequest, res: Response) => {
  const task = await taskService.addTaskTag(param(req.params.id), req.body.tagId);
  res.json({ task });
});

router.delete('/tasks/:id/tags/:tagId', authenticate, requirePermission('task', 'update'), async (req: AuthRequest, res: Response) => {
  const task = await taskService.removeTaskTag(param(req.params.id), param(req.params.tagId));
  res.json({ task });
});

router.post('/tasks/:id/dependencies', authenticate, requirePermission('task', 'update'), async (req: AuthRequest, res: Response) => {
  try {
    const task = await taskService.addDependency(param(req.params.id), req.body.dependsOnTaskId);
    res.json({ task });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid dependency', code: 'BAD_REQUEST', status: 400 });
  }
});

router.delete('/tasks/:id/dependencies/:dependsOnTaskId', authenticate, requirePermission('task', 'update'), async (req: AuthRequest, res: Response) => {
  const task = await taskService.removeDependency(param(req.params.id), param(req.params.dependsOnTaskId));
  res.json({ task });
});

export default router;
