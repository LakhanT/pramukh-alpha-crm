import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { resource: 'task', action: 'create', scope: 'project' },
  { resource: 'task', action: 'read', scope: 'project' },
  { resource: 'task', action: 'update', scope: 'project' },
  { resource: 'task', action: 'delete', scope: 'project' },
  { resource: 'task', action: 'assign', scope: 'project' },
  { resource: 'project', action: 'read', scope: 'project' },
  { resource: 'project', action: 'update', scope: 'project' },
  { resource: 'project', action: 'delete', scope: 'project' },
  { resource: 'project', action: 'manage_members', scope: 'project' },
  { resource: 'comment', action: 'create', scope: 'project' },
  { resource: 'comment', action: 'read', scope: 'project' },
  { resource: 'comment', action: 'update', scope: 'project' },
  { resource: 'comment', action: 'delete', scope: 'project' },
  { resource: 'attachment', action: 'create', scope: 'project' },
  { resource: 'attachment', action: 'read', scope: 'project' },
  { resource: 'attachment', action: 'delete', scope: 'project' },
  { resource: 'user', action: 'read', scope: 'global' },
  { resource: 'user', action: 'read_performance', scope: 'global' },
  { resource: 'user', action: 'update', scope: 'global' },
  { resource: 'role', action: 'create', scope: 'global' },
  { resource: 'role', action: 'read', scope: 'global' },
  { resource: 'role', action: 'update', scope: 'global' },
  { resource: 'role', action: 'delete', scope: 'global' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: PERMISSIONS.map((p) => `${p.resource}:${p.action}:${p.scope}`),
  Manager: [
    'task:create:project', 'task:read:project', 'task:update:project', 'task:delete:project', 'task:assign:project',
    'project:read:project', 'project:update:project', 'project:delete:project', 'project:manage_members:project',
    'comment:create:project', 'comment:read:project', 'comment:update:project', 'comment:delete:project',
    'attachment:create:project', 'attachment:read:project', 'attachment:delete:project',
    'user:read:global',
  ],
  'Team Lead': [
    'task:create:project', 'task:read:project', 'task:update:project', 'task:delete:project', 'task:assign:project',
    'project:read:project',
    'comment:create:project', 'comment:read:project', 'comment:update:project', 'comment:delete:project',
    'attachment:create:project', 'attachment:read:project', 'attachment:delete:project',
  ],
  Member: [
    'task:create:project', 'task:read:project', 'task:update:project',
    'project:read:project',
    'comment:create:project', 'comment:read:project', 'comment:update:project',
    'attachment:create:project', 'attachment:read:project',
  ],
  Viewer: [
    'task:read:project', 'project:read:project', 'comment:read:project', 'attachment:read:project',
  ],
};

const DEMO_EMAILS = [
  'admin@taskmanager.com',
  'alice@taskmanager.com',
  'bob@taskmanager.com',
  'carol@taskmanager.com',
  'dave@taskmanager.com',
];

const ADMIN_USERS = [
  { name: 'Lakhan Togadiya', email: 'lakhan@pramukhalpha.com', personalEmail: null as string | null, department: 'Administration' },
  { name: 'Bharat Gothi', email: 'bharat@pramukhalpha.com', personalEmail: null as string | null, department: 'Administration' },
];

const DEFAULT_PASSWORD = 'Admin@123';

const LEGACY_TASKFLOW_EMAILS = [
  'lakhan@taskflow.com',
  'bharat@taskflow.com',
  'admin@taskflow.com',
];

async function removeLegacyUsers() {
  const fallbackOwner = await prisma.user.findFirst({
    where: { email: 'lakhan@pramukhalpha.com' },
  });

  const legacyUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: [...DEMO_EMAILS, ...LEGACY_TASKFLOW_EMAILS] } },
        { email: { endsWith: '@taskflow.com' } },
      ],
    },
    select: { id: true, email: true },
  });

  for (const user of legacyUsers) {
    if (fallbackOwner && user.id !== fallbackOwner.id) {
      await prisma.project.updateMany({
        where: { ownerId: user.id },
        data: { ownerId: fallbackOwner.id },
      });
      await prisma.assignmentHistory.updateMany({
        where: { assignedToId: user.id },
        data: { assignedToId: fallbackOwner.id },
      });
      await prisma.assignmentHistory.updateMany({
        where: { assignedById: user.id },
        data: { assignedById: fallbackOwner.id },
      });
      await prisma.activityLog.updateMany({
        where: { changedById: user.id },
        data: { changedById: fallbackOwner.id },
      });
      await prisma.attachment.updateMany({
        where: { uploadedById: user.id },
        data: { uploadedById: fallbackOwner.id },
      });
    }

    await prisma.user.delete({ where: { id: user.id } }).catch((err) => {
      console.warn(`Could not remove legacy user ${user.email}:`, err);
    });
  }
}

async function removeOldDemoData() {
  // Remove legacy demo project and its data
  const demoProject = await prisma.project.findUnique({
    where: { id: '00000000-0000-0000-0000-000000000001' },
  });
  if (demoProject) {
    await prisma.project.delete({ where: { id: demoProject.id } });
  }

  await removeLegacyUsers();
}

async function main() {
  console.log('Seeding database...');

  await removeOldDemoData();

  const permissionRecords: Record<string, string> = {};
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { resource_action_scope: { resource: p.resource, action: p.action, scope: p.scope } },
      create: p,
      update: {},
    });
    permissionRecords[`${p.resource}:${p.action}:${p.scope}`] = perm.id;
  }

  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, description: `${roleName} role`, isSystem: true },
      update: {},
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of ROLE_PERMISSIONS[roleName]) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permissionRecords[permKey] },
      });
    }
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  for (const u of ADMIN_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        name: u.name,
        email: u.email,
        personalEmail: u.personalEmail,
        department: u.department,
        systemRole: 'ADMIN',
        passwordHash,
        notificationPrefs: { create: {} },
      },
      update: {
        name: u.name,
        personalEmail: u.personalEmail,
        department: u.department,
        systemRole: 'ADMIN',
        passwordHash,
      },
    });
  }

  console.log('Seed complete!');
  console.log(`\nAdmin accounts (password: ${DEFAULT_PASSWORD}):`);
  for (const u of ADMIN_USERS) {
    console.log(`  ${u.email}  — ${u.name} (System Admin)`);
  }

  await prisma.systemNotificationSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
