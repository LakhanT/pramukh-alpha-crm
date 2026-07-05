import { prisma } from '../config/database';

/**
 * Check if user has permission for resource+action in a project context.
 * System ADMIN bypasses all checks.
 */
export async function hasPermission(
  userId: string,
  systemRole: string,
  projectId: string | null,
  resource: string,
  action: string,
  scope: string = 'project'
): Promise<boolean> {
  if (systemRole === 'ADMIN') return true;

  if (scope === 'global') {
    // Global permissions require system admin or explicit global role permission
    const membership = await prisma.projectMember.findFirst({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!membership) return false;

    return membership.role.permissions.some(
      (rp) =>
        rp.permission.resource === resource &&
        rp.permission.action === action &&
        rp.permission.scope === 'global'
    );
  }

  if (!projectId) return false;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!membership) {
    // Check if project is PUBLIC and action is read
    if (action === 'read') {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      return project?.visibility === 'PUBLIC';
    }
    return false;
  }

  return membership.role.permissions.some(
    (rp) =>
      rp.permission.resource === resource &&
      rp.permission.action === action &&
      (rp.permission.scope === 'project' || rp.permission.scope === scope)
  );
}

export async function getUserProjectRole(userId: string, projectId: string) {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { role: true },
  });
  return membership?.role ?? null;
}

export async function canAccessProject(userId: string, systemRole: string, projectId: string): Promise<boolean> {
  if (systemRole === 'ADMIN') return true;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (member) return true;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  return project?.visibility === 'PUBLIC';
}

/** Effective permission keys for role-driven UI: "resource:action:scope" */
export async function getEffectivePermissions(userId: string, systemRole: string): Promise<string[]> {
  if (systemRole === 'ADMIN') {
    const all = await prisma.permission.findMany();
    return all.map((p) => `${p.resource}:${p.action}:${p.scope}`);
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  const keys = new Set<string>();
  for (const m of memberships) {
    for (const rp of m.role.permissions) {
      const p = rp.permission;
      keys.add(`${p.resource}:${p.action}:${p.scope}`);
    }
  }
  return Array.from(keys);
}
