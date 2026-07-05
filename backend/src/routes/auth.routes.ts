import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as authService from '../services/auth.service';
import { logUserAction } from '../services/audit.service';
import { prisma } from '../config/database';

function clientMeta(req: AuthRequest) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent') || undefined,
  };
}

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later', code: 'RATE_LIMITED', status: 429 },
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  department: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', authLimiter, validate(registerSchema), async (req: AuthRequest, res: Response) => {
  try {
    const user = await authService.registerUser(req.body);
    res.status(201).json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ error: message, code: 'BAD_REQUEST', status: 400 });
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req: AuthRequest, res: Response) => {
  const meta = clientMeta(req);
  const result = await authService.loginUser(req.body.email, req.body.password);
  if (!result) {
    await logUserAction({
      action: 'login_failed',
      details: { email: req.body.email },
      ...meta,
    });
    return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHORIZED', status: 401 });
  }
  await logUserAction({
    userId: result.user.id,
    action: 'login',
    entityType: 'user',
    entityId: result.user.id,
    details: { email: result.user.email },
    ...meta,
  });
  res.json(result);
});

router.post('/refresh', async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required', code: 'BAD_REQUEST', status: 400 });
  }
  const accessToken = await authService.refreshAccessToken(refreshToken);
  if (!accessToken) {
    return res.status(401).json({ error: 'Invalid refresh token', code: 'UNAUTHORIZED', status: 401 });
  }
  res.json({ accessToken });
});

router.post('/accept-invite', async (req, res: Response) => {
  const { token, password, name } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'token and password required', code: 'BAD_REQUEST', status: 400 });
  }
  try {
    const { acceptInvite } = await import('../services/member.service');
    const user = await acceptInvite(token, password, name);
    res.status(201).json({ user, message: 'Account created. You can sign in now.' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invite acceptance failed', code: 'BAD_REQUEST', status: 400 });
  }
});

router.post('/logout', async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (stored) {
      await logUserAction({
        userId: stored.userId,
        action: 'logout',
        entityType: 'user',
        entityId: stored.userId,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent') || undefined,
      });
    }
    await authService.revokeRefreshToken(refreshToken);
  }
  res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      personalEmail: true,
      department: true,
      systemRole: true,
      status: true,
      jobTitle: true,
      avatarUrl: true,
      reportsToId: true,
      reportsTo: { select: { id: true, name: true, email: true, jobTitle: true } },
      _count: { select: { directReports: true } },
      notificationPrefs: true,
    },
  });
  const { getEffectivePermissions } = await import('../services/permission.service');
  const permissions = user ? await getEffectivePermissions(user.id, user.systemRole) : [];
  const shaped = user
    ? {
        ...user,
        directReportsCount: user._count.directReports,
        _count: undefined,
      }
    : null;
  res.json({ user: shaped, permissions });
});

export default router;
