import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate, parsePagination, paginatedResponse } from '../middleware/validate';
import { prisma } from '../config/database';
import { canAccessProject } from '../services/permission.service';
import { logActivity } from '../services/audit.service';
import { param } from '../utils/params';
import { createNotification } from '../services/notification.service';

const router = Router();

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  visibility: z.enum(['PRIVATE', 'TEAM', 'PUBLIC']).optional(),
});

// List user's projects
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const skip = (page - 1) * limit;

  const where =
    req.user!.systemRole === 'ADMIN'
      ? {}
      : {
          OR: [
            { ownerId: req.user!.id },
            { members: { some: { userId: req.user!.id } } },
            { visibility: 'PUBLIC' as const },
          ],
        };

  const [data, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { tasks: true, members: true } },
      },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.project.count({ where }),
  ]);

  res.json(paginatedResponse(data, total, page, limit));
});

// Create project
router.post('/', authenticate, validate(projectSchema), async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.create({
    data: {
      name: req.body.name,
      description: req.body.description,
      visibility: req.body.visibility ?? 'PRIVATE',
      ownerId: req.user!.id,
      members: {
        create: {
          userId: req.user!.id,
          roleId: (await prisma.role.findFirst({ where: { name: 'Manager' } }))!.id,
        },
      },
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  await logActivity({
    entityType: 'project',
    entityId: project.id,
    action: 'created',
    changedById: req.user!.id,
    newValue: project.name,
  });

  res.status(201).json({ project });
});

// Get project
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const allowed = await canAccessProject(req.user!.id, req.user!.systemRole, param(req.params.id));
  if (!allowed) return res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN', status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: param(req.params.id) },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          role: { select: { id: true, name: true } },
        },
      },
      tags: true,
      _count: { select: { tasks: true } },
    },
  });

  if (!project) return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND', status: 404 });
  res.json({ project });
});

// Update project
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({ where: { id: param(req.params.id) } });
  if (!project) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  if (project.ownerId !== req.user!.id && req.user!.systemRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Only owner or admin can update', code: 'FORBIDDEN', status: 403 });
  }

  const updated = await prisma.project.update({
    where: { id: param(req.params.id) },
    data: req.body,
  });
  res.json({ project: updated });
});

// Delete project
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({ where: { id: param(req.params.id) } });
  if (!project) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  if (project.ownerId !== req.user!.id && req.user!.systemRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN', status: 403 });
  }
  await prisma.project.delete({ where: { id: param(req.params.id) } });
  res.json({ message: 'Project deleted' });
});

// Members
router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  const members = await prisma.projectMember.findMany({
    where: { projectId: param(req.params.id) },
    include: {
      user: { select: { id: true, name: true, email: true, department: true } },
      role: true,
    },
  });
  res.json({ data: members });
});

router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId, roleId } = req.body;
  const member = await prisma.projectMember.create({
    data: { projectId: param(req.params.id), userId, roleId },
    include: { user: { select: { id: true, name: true } }, role: true },
  });

  await createNotification({
    userId,
    type: 'GENERAL',
    message: `You were added to project`,
  });

  res.status(201).json({ member });
});

router.patch('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  const member = await prisma.projectMember.update({
    where: { projectId_userId: { projectId: param(req.params.id), userId: param(req.params.userId) } },
    data: { roleId: req.body.roleId },
    include: { role: true },
  });
  res.json({ member });
});

router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId: param(req.params.id), userId: param(req.params.userId) } },
  });
  res.json({ message: 'Member removed' });
});

export default router;
