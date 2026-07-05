import { createServer } from 'http';
import cron from 'node-cron';
import { config } from './config';
import { createApp } from './app';
import { initSocket } from './sockets';
import { setSocketServer, getSystemNotificationSettings, processDueDateReminders, processOverdueTasks, processDigestEmails } from './services/notification.service';
import { purgeExpiredDeletedTasks } from './services/audit.service';
import { processRecurringTasks } from './services/task.service';

const app = createApp();
const httpServer = createServer(app);
const io = initSocket(httpServer);
setSocketServer(io);
app.set('io', io);

if (process.env.VERCEL !== '1') {
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Daily jobs…');
    await processDueDateReminders();
    await processOverdueTasks();
    const day = new Date().getDay();
    const settings = await getSystemNotificationSettings();
    if (settings.digestEnabled && (settings.digestFrequency === 'DAILY' || day === 1)) {
      await processDigestEmails();
    }
    await purgeExpiredDeletedTasks();
    await processRecurringTasks();
  });

  httpServer.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`API: http://localhost:${config.port}/api/v1`);
  });
}

export default app;
