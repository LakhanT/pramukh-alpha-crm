import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { createNotification } from '../services/notification.service';
import { logActivity } from '../services/audit.service';
import { param } from '../utils/params';

const router = Router();

const commentSchema = z.object({
  content: z.string().min(1),
});

/** Parse @mentions — matches @email, @name, or @username (email prefix) */
function parseMentions(content: string, projectUsers: { id: string; email: string; name: string }[]) {
  const mentions: string[] = [];
  const lower = content.toLowerCase();
  for (const user of projectUsers) {
    const emailPrefix = user.email.split('@')[0].toLowerCase();
    const patterns = [
      `@${user.email.toLowerCase()}`,
      `@${user.name.toLowerCase()}`,
      `@${emailPrefix}`,
    ];
    if (patterns.some((p) => lower.includes(p))) {
      mentions.push(user.id);
    }
  }
  return [...new Set(mentions)];
}

router.get('/tasks/:taskId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  const comments = await prisma.comment.findMany({
    where: { taskId: param(req.params.taskId) },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ data: comments });
});

router.post(
  '/tasks/:taskId/comments',
  authenticate,
  validate(commentSchema),
  async (req: AuthRequest, res: Response) => {
    const task = await prisma.task.findUnique({
      where: { id: param(req.params.taskId) },
      include: { project: { include: { members: { include: { user: true } } } } },
    });
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND', status: 404 });

    const projectUsers = task.project.members.map((m) => m.user);
    const mentions = parseMentions(req.body.content, projectUsers);

    const comment = await prisma.comment.create({
      data: {
        taskId: param(req.params.taskId),
        userId: req.user!.id,
        content: req.body.content,
        mentions,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await logActivity({
      entityType: 'comment',
      entityId: comment.id,
      action: 'created',
      changedById: req.user!.id,
      newValue: req.body.content.slice(0, 100),
    });

    for (const userId of mentions) {
      if (userId !== req.user!.id) {
        await createNotification({
          userId,
          type: 'MENTION',
          message: `${req.user!.email} mentioned you in a comment on "${task.title}"`,
          relatedTaskId: task.id,
        });
      }
    }

    const io = req.app.get('io');
    io?.to(`task:${param(req.params.taskId)}`).emit('comment:created', comment);
    res.status(201).json({ comment });
  }
);

router.patch('/comments/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.comment.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  if (existing.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Can only edit own comments', code: 'FORBIDDEN', status: 403 });
  }

  const comment = await prisma.comment.update({
    where: { id: param(req.params.id) },
    data: { content: req.body.content },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json({ comment });
});

router.delete('/comments/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const existing = await prisma.comment.findUnique({ where: { id: param(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  if (existing.userId !== req.user!.id && req.user!.systemRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN', status: 403 });
  }
  await prisma.comment.delete({ where: { id: param(req.params.id) } });
  res.json({ message: 'Comment deleted' });
});

export default router;
