import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { param } from '../utils/params';

const router = Router();

router.use(authenticate);

router.get('/projects/:projectId/tags', async (req: AuthRequest, res: Response) => {
  const tags = await prisma.tag.findMany({ where: { projectId: param(req.params.projectId) } });
  res.json({ data: tags });
});

router.post('/projects/:projectId/tags', async (req: AuthRequest, res: Response) => {
  const tag = await prisma.tag.create({
    data: {
      projectId: param(req.params.projectId),
      name: req.body.name,
      color: req.body.color ?? '#6366f1',
    },
  });
  res.status(201).json({ tag });
});

router.delete('/tags/:id', async (req: AuthRequest, res: Response) => {
  await prisma.tag.delete({ where: { id: param(req.params.id) } });
  res.json({ message: 'Tag deleted' });
});

export default router;
