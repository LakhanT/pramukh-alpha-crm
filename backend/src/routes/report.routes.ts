import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as taskService from '../services/task.service';

const router = Router();

router.use(authenticate);

router.get('/completion', async (req: AuthRequest, res: Response) => {
  const report = await taskService.getCompletionReport(req.query.projectId as string);
  res.json({ data: report });
});

router.get('/overdue', async (req: AuthRequest, res: Response) => {
  const report = await taskService.getOverdueReport(req.query.projectId as string);
  res.json({ data: report });
});

router.get('/export', async (req: AuthRequest, res: Response) => {
  const format = (req.query.format as string) || 'csv';
  const type = (req.query.type as string) || 'overdue';
  const projectId = req.query.projectId as string | undefined;

  if (type === 'completion') {
    const data = await taskService.getCompletionReport(projectId);
    if (format === 'csv') {
      const header = 'User ID,Name,Done,Total,Completion Rate\n';
      const rows = data.map((r) => `${r.userId},"${r.name}",${r.done},${r.total},${r.completionRate}%`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=completion-report.csv');
      return res.send(header + rows);
    }
    if (format === 'html' || format === 'pdf') {
      const html = `<!DOCTYPE html><html><head><title>Pramukh Alpha - Completion Report</title>
        <style>body{font-family:Arial,sans-serif;padding:40px}h1{color:#2563eb}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#f1f5f9}</style></head>
        <body><h1>Pramukh Alpha — Completion Report</h1><p>Generated ${new Date().toLocaleString()}</p>
        <table><tr><th>Name</th><th>Done</th><th>Total</th><th>Rate</th></tr>
        ${data.map((r) => `<tr><td>${r.name}</td><td>${r.done}</td><td>${r.total}</td><td>${r.completionRate}%</td></tr>`).join('')}
        </table><script>window.print()</script></body></html>`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', 'inline; filename=completion-report.html');
      return res.send(html);
    }
  }

  const overdue = await taskService.getOverdueReport(projectId);

  if (format === 'csv') {
    const header = 'ID,Title,Project,Due Date,Status,Assignees\n';
    const rows = overdue
      .map(
        (t) =>
          `${t.id},"${t.title}","${t.project.name}",${t.dueDate?.toISOString()},${t.status},"${t.assignees.map((a) => a.user.name).join('; ')}"`
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=overdue-tasks.csv');
    return res.send(header + rows);
  }

  if (format === 'html' || format === 'pdf') {
    const html = `<!DOCTYPE html><html><head><title>Pramukh Alpha - Overdue Report</title>
      <style>body{font-family:Arial,sans-serif;padding:40px}h1{color:#dc2626}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#f1f5f9}</style></head>
      <body><h1>Pramukh Alpha — Overdue Tasks</h1><p>Generated ${new Date().toLocaleString()}</p>
      <table><tr><th>Title</th><th>Project</th><th>Due</th><th>Status</th><th>Assignees</th></tr>
      ${overdue.map((t) => `<tr><td>${t.title}</td><td>${t.project.name}</td><td>${t.dueDate?.toLocaleDateString()}</td><td>${t.status}</td><td>${t.assignees.map((a) => a.user.name).join(', ')}</td></tr>`).join('')}
      </table><p><em>Use browser Print → Save as PDF</em></p><script>window.print()</script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'inline; filename=overdue-report.html');
    return res.send(html);
  }

  res.json({ data: overdue });
});

router.get('/workload', async (req: AuthRequest, res: Response) => {
  const workload = await taskService.getWorkload(req.query.projectId as string);
  res.json({ data: workload });
});

export default router;
