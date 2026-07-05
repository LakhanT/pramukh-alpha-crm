import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { getTeamTree } from '../services/task.service';
import {
  canViewMemberPerformance,
  getMemberPerformance,
  performanceToCsv,
  PerformanceFilters,
} from '../services/performance.service';
import { param } from '../utils/params';

const router = Router();

router.get('/team-tree', authenticate, async (_req: AuthRequest, res: Response) => {
  const tree = await getTeamTree();
  res.json({ data: tree });
});

router.get('/assignable', authenticate, async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, email: true, department: true, jobTitle: true },
    orderBy: { name: 'asc' },
  });
  res.json({ data: users });
});

router.get('/:id/performance', authenticate, async (req: AuthRequest, res: Response) => {
  const memberId = param(req.params.id);
  const allowed = await canViewMemberPerformance(req.user!.id, memberId, req.user!.systemRole);
  if (!allowed) {
    return res.status(403).json({ error: 'You cannot view this member\'s performance', code: 'FORBIDDEN', status: 403 });
  }

  const filters: PerformanceFilters = {
    range: (req.query.range as PerformanceFilters['range']) || 'all',
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    projectId: req.query.projectId as string | undefined,
    status: req.query.status as string | undefined,
  };

  const data = await getMemberPerformance(memberId, filters);
  if (!data) return res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND', status: 404 });
  res.json({ data });
});

router.get('/:id/performance/export', authenticate, async (req: AuthRequest, res: Response) => {
  const memberId = param(req.params.id);
  const allowed = await canViewMemberPerformance(req.user!.id, memberId, req.user!.systemRole);
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN', status: 403 });
  }

  const filters: PerformanceFilters = {
    range: (req.query.range as PerformanceFilters['range']) || 'all',
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    projectId: req.query.projectId as string | undefined,
    status: req.query.status as string | undefined,
  };

  const data = await getMemberPerformance(memberId, filters);
  if (!data) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });

  const format = (req.query.format as string) || 'csv';
  if (format === 'csv') {
    const csv = performanceToCsv(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${data.member.name.replace(/\s+/g, '-')}-performance.csv"`);
    return res.send(csv);
  }

  res.status(400).json({ error: 'Only CSV export is supported', code: 'BAD_REQUEST', status: 400 });
});

export default router;
