import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { hasPermission } from '../services/permission.service';
import { param } from '../utils/params';

/**
 * Factory middleware: checks project-scoped permission.
 * Resolves projectId from params (projectId or id) or body.projectId.
 */
export function requirePermission(resource: string, action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED', status: 401 });
    }

    const projectId =
      param(req.params.projectId as string | string[]) ||
      req.body?.projectId ||
      (await resolveProjectIdFromTask(param(req.params.id as string | string[]) || param(req.params.taskId as string | string[])));

    if (!projectId) {
      return res.status(400).json({ error: 'Project context required', code: 'BAD_REQUEST', status: 400 });
    }

    const allowed = await hasPermission(req.user.id, req.user.systemRole, projectId, resource, action);
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN', status: 403 });
    }

    (req as AuthRequest & { projectId?: string }).projectId = projectId;
    next();
  };
}

export function requireGlobalPermission(resource: string, action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED', status: 401 });
    }

    if (req.user.systemRole === 'ADMIN') return next();

    const allowed = await hasPermission(req.user.id, req.user.systemRole, null, resource, action, 'global');
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN', status: 403 });
    }
    next();
  };
}

async function resolveProjectIdFromTask(taskId?: string): Promise<string | null> {
  if (!taskId) return null;
  const { prisma } = await import('../config/database');
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  return task?.projectId ?? null;
}
