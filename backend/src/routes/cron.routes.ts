import { Router, Response } from 'express';
import { processDueDateReminders, processOverdueTasks, processDigestEmails, getSystemNotificationSettings } from '../services/notification.service';
import { purgeExpiredDeletedTasks } from '../services/audit.service';
import { processRecurringTasks } from '../services/task.service';
import { config } from '../config';

const router = Router();

/** Vercel Cron — daily at 8 AM UTC (configure in vercel.json) */
router.get('/daily', async (req, res: Response) => {
  const secret = req.headers.authorization?.replace('Bearer ', '') || req.query.secret;
  if (config.cronSecret && secret !== config.cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await processDueDateReminders();
  await processOverdueTasks();
  const day = new Date().getDay();
  const settings = await getSystemNotificationSettings();
  if (settings.digestEnabled && (settings.digestFrequency === 'DAILY' || day === 1)) {
    await processDigestEmails();
  }
  const purged = await purgeExpiredDeletedTasks();
  const rolled = await processRecurringTasks();

  res.json({ ok: true, purged, rolled });
});

export default router;
