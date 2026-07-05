import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { parsePagination, paginatedResponse } from '../middleware/validate';
import { prisma } from '../config/database';
import { param } from '../utils/params';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const unreadOnly = req.query.unread === 'true';

  const where = {
    userId: req.user!.id,
    ...(unreadOnly && { isRead: false }),
  };

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { relatedTask: { select: { id: true, title: true } } },
    }),
    prisma.notification.count({ where }),
  ]);

  res.json(paginatedResponse(data, total, page, limit));
});

router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  const notification = await prisma.notification.updateMany({
    where: { id: param(req.params.id), userId: req.user!.id },
    data: { isRead: true },
  });
  if (notification.count === 0) {
    return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  }
  res.json({ message: 'Marked as read' });
});

router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ message: 'All marked as read' });
});

router.get('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: req.user!.id },
  });
  res.json({ preferences: prefs });
});

router.patch('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...req.body },
    update: req.body,
  });
  res.json({ preferences: prefs });
});

export default router;
