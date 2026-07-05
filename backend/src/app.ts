import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';

import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import commentRoutes from './routes/comment.routes';
import attachmentRoutes from './routes/attachment.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import reportRoutes from './routes/report.routes';
import tagRoutes from './routes/tag.routes';
import userRoutes from './routes/user.routes';
import cronRoutes from './routes/cron.routes';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
  }));
  app.use(express.json());

  const uploadDir = path.resolve(config.upload.dir);
  app.use('/uploads', express.static(uploadDir));

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/projects', projectRoutes);
  api.use('/', taskRoutes);
  api.use('/', commentRoutes);
  api.use('/', attachmentRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/admin', adminRoutes);
  api.use('/reports', reportRoutes);
  api.use('/users', userRoutes);
  api.use('/', tagRoutes);
  api.use('/cron', cronRoutes);

  app.use('/api/v1', api);
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error', code: 'INTERNAL_ERROR', status: 500 });
  });

  return app;
}
