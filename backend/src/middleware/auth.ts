import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../config/database';

export interface AuthUser {
  id: string;
  email: string;
  systemRole: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED', status: 401 });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED', status: 401 });
  }
}

export function requireSystemAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.systemRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN', status: 403 });
  }
  next();
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwt.accessSecret) as AuthUser;
      req.user = payload;
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
