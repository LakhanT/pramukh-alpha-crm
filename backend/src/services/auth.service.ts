import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { config } from '../config';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(user: { id: string; email: string; systemRole: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, systemRole: user.systemRole },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry as jwt.SignOptions['expiresIn'] }
  );
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });

  return token;
}

export async function refreshAccessToken(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    return null;
  }

  return generateAccessToken({
    id: stored.user.id,
    email: stored.user.email,
    systemRole: stored.user.systemRole,
  });
}

export async function revokeRefreshToken(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  department?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error('Email already registered');

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      department: data.department,
      notificationPrefs: { create: {} },
    },
    select: { id: true, name: true, email: true, personalEmail: true, systemRole: true, department: true },
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const accessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    systemRole: user.systemRole,
  });
  const refreshToken = await generateRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      personalEmail: user.personalEmail,
      systemRole: user.systemRole,
      department: user.department,
    },
  };
}
