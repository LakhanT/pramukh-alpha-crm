import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Users, GitBranch } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  systemRole: string;
  jobTitle?: string | null;
  reportsToId?: string | null;
  reportsTo?: { id: string; name: string; email: string; jobTitle?: string | null } | null;
  directReportsCount: number;
  activeTasks: number;
  projects: { id: string; name: string; role: string }[];
}

interface Department {
  name: string;
  members: TeamMember[];
}

interface ReportNode {
  member: TeamMember;
  children: ReportNode[];
}

function buildReportTree(members: TeamMember[]): ReportNode[] {
  const nodeMap = new Map<string, ReportNode>();
  for (const m of members) nodeMap.set(m.id, { member: m, children: [] });

  const roots: ReportNode[] = [];
  for (const m of members) {
    const node = nodeMap.get(m.id)!;
    if (m.reportsToId && nodeMap.has(m.reportsToId)) {
      nodeMap.get(m.reportsToId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function ReportTreeNode({ node, depth = 0 }: { node: ReportNode; depth?: number }) {
  return (
    <div className="report-tree-node" style={{ marginLeft: depth * 20 }}>
      <Link to={`/members/${node.member.id}/performance`} className="report-tree-card report-tree-card--link">
        <strong>{node.member.name}</strong>
        {node.member.jobTitle && <span className="report-tree-title">{node.member.jobTitle}</span>}
        {node.member.directReportsCount > 0 && (
          <span className="report-tree-badge">{node.member.directReportsCount} direct report{node.member.directReportsCount !== 1 ? 's' : ''}</span>
        )}
      </Link>
      {node.children.map((child) => (
        <ReportTreeNode key={child.member.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [canSeeAll, setCanSeeAll] = useState(false);

  useEffect(() => {
    api.getTeamTree().then((res) => {
      setDepartments(res.data as Department[]);
      setExpanded(new Set((res.data as Department[]).map((d) => d.name)));
    });
    if (user?.systemRole === 'ADMIN' || (user?.directReportsCount ?? 0) > 0) {
      setCanSeeAll(true);
      return;
    }
    api.getProjects().then(async (res) => {
      for (const p of res.data) {
        const m = await api.getProjectMembers(p.id);
        const me = m.data.find((x) => x.user.id === user?.id);
        if (me && ['Admin', 'Manager', 'Team Lead'].includes(me.role.name)) {
          setCanSeeAll(true);
          break;
        }
      }
    });
  }, [user]);

  const allMembers = useMemo(
    () => departments.flatMap((d) => d.members),
    [departments]
  );

  const reportTree = useMemo(() => buildReportTree(allMembers), [allMembers]);

  const mySubtree = useMemo(() => {
    if (!user) return [];
    const findNode = (nodes: ReportNode[]): ReportNode | null => {
      for (const n of nodes) {
        if (n.member.id === user.id) return n;
        const found = findNode(n.children);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(reportTree);
    return node ? [node] : [];
  }, [reportTree, user]);

  const toggle = (name: string) => {
    const next = new Set(expanded);
    next.has(name) ? next.delete(name) : next.add(name);
    setExpanded(next);
  };

  const visibleDepts = departments.filter(
    (d) => canSeeAll || d.name === (user?.department || 'Unassigned')
  );

  const treeToShow = canSeeAll ? reportTree : mySubtree;

  return (
    <Layout>
      <div className="page-header">
        <h1>Team structure</h1>
        <p className="subtitle">Department org tree and reporting lines — who each member reports to.</p>
      </div>

      {user?.reportsTo && (
        <div className="help-box">
          You report to <strong>{user.reportsTo.name}</strong>
          {user.reportsTo.jobTitle ? ` (${user.reportsTo.jobTitle})` : ''}.
        </div>
      )}

      {!canSeeAll && (
        <div className="help-box">Showing your department and your reporting subtree. Managers and admins see the full organization.</div>
      )}

      {treeToShow.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={18} /> Reporting structure
          </div>
          <div className="card-desc">Junior members roll up to their manager. Arrows show the reporting hierarchy.</div>
          <div className="report-tree">
            {treeToShow.map((node) => (
              <ReportTreeNode key={node.member.id} node={node} />
            ))}
          </div>
        </div>
      )}

      <div className="team-tree">
        {visibleDepts.map((dept) => (
          <div key={dept.name} className="card team-dept">
            <button type="button" className="team-dept-header" onClick={() => toggle(dept.name)}>
              <Users size={18} />
              <strong>{dept.name}</strong>
              <span className="team-dept-count">{dept.members.length} members</span>
              <span style={{ marginLeft: 'auto' }}>{expanded.has(dept.name) ? '▼' : '▶'}</span>
            </button>
            {expanded.has(dept.name) && (
              <div className="team-members">
                  {dept.members.map((m) => (
                    <Link key={m.id} to={`/members/${m.id}/performance`} className="team-member-row team-member-row--reports team-member-row--link">
                      <div>
                        <strong>{m.name}</strong>
                      {m.jobTitle && <span className="report-tree-title" style={{ marginLeft: 8 }}>{m.jobTitle}</span>}
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.email}</div>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Reports to: </span>
                        <strong>{m.reportsTo?.name || '—'}</strong>
                      </div>
                      {m.directReportsCount > 0 && (
                        <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                          {m.directReportsCount} direct report{m.directReportsCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <span className="badge">{m.systemRole}</span>
                      <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{m.activeTasks} active tasks</span>
                    </div>
                    <div className="team-projects">
                      {m.projects.map((p) => (
                        <span key={p.id} className="team-project-chip">{p.name} · {p.role}</span>
                      ))}
                      {m.projects.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No projects</span>}
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
