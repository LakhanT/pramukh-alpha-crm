import { hasPermission } from '../services/permission.service';

// Mock prisma
jest.mock('../config/database', () => ({
  prisma: {
    projectMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '../config/database';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('RBAC permission checks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows ADMIN to bypass all checks', async () => {
    const result = await hasPermission('user-1', 'ADMIN', 'project-1', 'task', 'delete');
    expect(result).toBe(true);
    expect(mockPrisma.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it('denies access when user is not a project member', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ visibility: 'PRIVATE' });

    const result = await hasPermission('user-1', 'MEMBER', 'project-1', 'task', 'create');
    expect(result).toBe(false);
  });

  it('grants permission when role has matching permission', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: {
        permissions: [
          { permission: { resource: 'task', action: 'create', scope: 'project' } },
        ],
      },
    });

    const result = await hasPermission('user-1', 'MEMBER', 'project-1', 'task', 'create');
    expect(result).toBe(true);
  });

  it('denies permission when role lacks matching permission', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: {
        permissions: [
          { permission: { resource: 'task', action: 'read', scope: 'project' } },
        ],
      },
    });

    const result = await hasPermission('user-1', 'MEMBER', 'project-1', 'task', 'delete');
    expect(result).toBe(false);
  });

  it('allows read on PUBLIC projects for non-members', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({ visibility: 'PUBLIC' });

    const result = await hasPermission('user-1', 'MEMBER', 'project-1', 'task', 'read');
    expect(result).toBe(true);
  });
});

describe('Notification type preferences', () => {
  function shouldSendEmail(
    type: string,
    prefs: { dueDateReminder: boolean; overdueAlert: boolean; statusChange: boolean; mentions: boolean; reassignment: boolean; emailEnabled: boolean }
  ) {
    if (!prefs.emailEnabled) return false;
    switch (type) {
      case 'DUE_DATE_APPROACHING': return prefs.dueDateReminder;
      case 'OVERDUE':
      case 'ESCALATION': return prefs.overdueAlert;
      case 'STATUS_CHANGE': return prefs.statusChange;
      case 'MENTION': return prefs.mentions;
      case 'REASSIGNMENT': return prefs.reassignment;
      default: return true;
    }
  }

  it('respects email disabled preference', () => {
    expect(shouldSendEmail('MENTION', { emailEnabled: false, dueDateReminder: true, overdueAlert: true, statusChange: true, mentions: true, reassignment: true })).toBe(false);
  });

  it('respects mention preference', () => {
    expect(shouldSendEmail('MENTION', { emailEnabled: true, dueDateReminder: true, overdueAlert: true, statusChange: true, mentions: false, reassignment: true })).toBe(false);
  });

  it('sends escalation when overdue alert enabled', () => {
    expect(shouldSendEmail('ESCALATION', { emailEnabled: true, dueDateReminder: true, overdueAlert: true, statusChange: true, mentions: true, reassignment: true })).toBe(true);
  });
});
