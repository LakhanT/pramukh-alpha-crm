import { Router, Response } from 'express';
import { authenticate, requireSystemAdmin, AuthRequest } from '../middleware/auth';
import { parsePagination, paginatedResponse } from '../middleware/validate';
import { prisma } from '../config/database';
import { getAuditLog, getUserActionLogs, logUserAction } from '../services/audit.service';
import * as memberService from '../services/member.service';
import { param } from '../utils/params';

const router = Router();

router.use(authenticate, requireSystemAdmin);

// Roles CRUD
router.get('/roles', async (_req: AuthRequest, res: Response) => {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { projectMembers: true } },
    },
  });
  res.json({ data: roles });
});

router.post('/roles', async (req: AuthRequest, res: Response) => {
  const role = await prisma.role.create({
    data: { name: req.body.name, description: req.body.description },
  });
  await logUserAction({
    userId: req.user!.id,
    action: 'role_create',
    entityType: 'role',
    entityId: role.id,
    details: { name: role.name },
  });
  res.status(201).json({ role });
});

router.patch('/roles/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.role.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  if (existing.isSystem) {
    return res.status(400).json({ error: 'Cannot modify system role name', code: 'BAD_REQUEST', status: 400 });
  }
  const role = await prisma.role.update({
    where: { id: param(req.params.id) },
    data: { name: req.body.name, description: req.body.description },
  });
  res.json({ role });
});

router.delete('/roles/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.role.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  if (existing.isSystem) {
    return res.status(400).json({ error: 'Cannot delete system role', code: 'BAD_REQUEST', status: 400 });
  }
  await prisma.role.delete({ where: { id: param(req.params.id) } });
  await logUserAction({ userId: req.user!.id, action: 'role_delete', entityType: 'role', entityId: param(req.params.id) });
  res.json({ message: 'Role deleted' });
});

// Permissions
router.get('/permissions', async (_req: AuthRequest, res: Response) => {
  const permissions = await prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] });
  res.json({ data: permissions });
});

router.put('/roles/:id/permissions', async (req: AuthRequest, res: Response) => {
  const { permissionIds } = req.body;
  if (!Array.isArray(permissionIds)) {
    return res.status(400).json({ error: 'permissionIds array required', code: 'BAD_REQUEST', status: 400 });
  }

  await prisma.rolePermission.deleteMany({ where: { roleId: param(req.params.id) } });
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId: string) => ({
      roleId: param(req.params.id),
      permissionId,
    })),
  });

  await logUserAction({
    userId: req.user!.id,
    action: 'permission_change',
    entityType: 'role',
    entityId: param(req.params.id),
    details: { permissionCount: permissionIds.length },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent') || undefined,
  });

  const role = await prisma.role.findUnique({
    where: { id: param(req.params.id) },
    include: { permissions: { include: { permission: true } } },
  });
  res.json({ role });
});

// Audit log
router.get('/audit-log', async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const result = await getAuditLog(page, limit, {
    entityType: req.query.entityType as string | undefined,
    action: req.query.action as string | undefined,
    userId: req.query.userId as string | undefined,
  });
  res.json(paginatedResponse(result.data, result.total, page, limit));
});

// User action logs (login, permissions, deletions)
router.get('/user-actions', async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const result = await getUserActionLogs(page, limit, {
    userId: req.query.userId as string | undefined,
    action: req.query.action as string | undefined,
  });
  res.json(paginatedResponse(result.data, result.total, page, limit));
});

// Deleted tasks (restore within window)
router.get('/deleted-tasks', async (req: AuthRequest, res: Response) => {
  const { listDeletedTasks } = await import('../services/task.service');
  const tasks = await listDeletedTasks(req.query.projectId as string | undefined);
  res.json({ data: tasks });
});

router.post('/deleted-tasks/:id/restore', async (req: AuthRequest, res: Response) => {
  const { restoreTask } = await import('../services/task.service');
  try {
    const task = await restoreTask(param(req.params.id), req.user!.id);
    if (!task) return res.status(404).json({ error: 'Task not found or not deleted', code: 'NOT_FOUND', status: 404 });
    await logUserAction({
      userId: req.user!.id,
      action: 'task_restore',
      entityType: 'task',
      entityId: task.id,
      details: { title: task.title },
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent') || undefined,
    });
    res.json({ task });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Restore failed', code: 'BAD_REQUEST', status: 400 });
  }
});

// ─── Member management ───────────────────────────────────────────
router.get('/members', async (_req: AuthRequest, res: Response) => {
  const data = await memberService.listMembers();
  res.json({ data });
});

router.post('/members', async (req: AuthRequest, res: Response) => {
  try {
    const user = await memberService.createMember(req.user!.id, req.body);
    await logUserAction({
      userId: req.user!.id,
      action: 'member_create',
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent') || undefined,
    });
    res.status(201).json({ user });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed', code: 'BAD_REQUEST', status: 400 });
  }
});

router.patch('/members/:id', async (req: AuthRequest, res: Response) => {
  const user = await memberService.updateMember(req.user!.id, param(req.params.id), req.body);
  if (!user) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  await logUserAction({
    userId: req.user!.id,
    action: 'member_update',
    entityType: 'user',
    entityId: user.id,
    details: req.body,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent') || undefined,
  });
  res.json({ user });
});

router.post('/members/:id/deactivate', async (req: AuthRequest, res: Response) => {
  const user = await memberService.deactivateMember(req.user!.id, param(req.params.id));
  if (!user) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  await logUserAction({ userId: req.user!.id, action: 'member_deactivate', entityType: 'user', entityId: user.id });
  res.json({ user });
});

router.delete('/members/:id', async (req: AuthRequest, res: Response) => {
  const { reassignToId } = req.body;
  if (!reassignToId) {
    return res.status(400).json({ error: 'reassignToId required', code: 'BAD_REQUEST', status: 400 });
  }
  try {
    await memberService.deleteMember(req.user!.id, param(req.params.id), reassignToId);
    await logUserAction({
      userId: req.user!.id,
      action: 'member_delete',
      entityType: 'user',
      entityId: param(req.params.id),
      details: { reassignToId },
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent') || undefined,
    });
    res.json({ message: 'Member removed; tasks reassigned' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Delete failed', code: 'BAD_REQUEST', status: 400 });
  }
});

router.post('/members/invite', async (req: AuthRequest, res: Response) => {
  try {
    const invite = await memberService.inviteMember(req.user!.id, req.body);
    res.status(201).json({ invite });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invite failed', code: 'BAD_REQUEST', status: 400 });
  }
});

router.get('/invites', async (_req: AuthRequest, res: Response) => {
  const data = await memberService.listPendingInvites();
  res.json({ data });
});

// Users list (notifications + dropdowns)
router.get('/users', async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const [data, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        jobTitle: true,
        avatarUrl: true,
        status: true,
        systemRole: true,
        notificationPrefs: true,
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.user.count(),
  ]);
  res.json(paginatedResponse(data, total, page, limit));
});

// Organization notification settings
router.get('/notification-settings', async (_req: AuthRequest, res: Response) => {
  const { getSystemNotificationSettings } = await import('../services/notification.service');
  const settings = await getSystemNotificationSettings();
  res.json({ settings });
});

router.patch('/notification-settings', async (req: AuthRequest, res: Response) => {
  const settings = await prisma.systemNotificationSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...req.body },
    update: req.body,
  });
  res.json({ settings });
});

// Per-user notification preferences (admin)
router.get('/users/:userId/notification-preferences', async (req: AuthRequest, res: Response) => {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: param(req.params.userId) },
  });
  res.json({ preferences: prefs });
});

router.patch('/users/:userId/notification-preferences', async (req: AuthRequest, res: Response) => {
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: param(req.params.userId) },
    create: { userId: param(req.params.userId), ...req.body },
    update: req.body,
  });
  await logUserAction({
    userId: req.user!.id,
    action: 'notification_prefs_change',
    entityType: 'user',
    entityId: param(req.params.userId),
    details: req.body,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent') || undefined,
  });
  res.json({ preferences: prefs });
});

export default router;
