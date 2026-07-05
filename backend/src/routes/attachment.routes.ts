import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { config } from '../config';
import { logActivity } from '../services/audit.service';
import { param } from '../utils/params';

const router = Router();

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: config.upload.dir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxSize },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use photos, PDF, Word, Excel, or text files.'));
    }
  },
});

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get('/tasks/:taskId/attachments', authenticate, async (req: AuthRequest, res: Response) => {
  const attachments = await prisma.attachment.findMany({
    where: { taskId: param(req.params.taskId) },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: attachments });
});

router.post(
  '/tasks/:taskId/attachments',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded', code: 'BAD_REQUEST', status: 400 });
      }

      const attachment = await prisma.attachment.create({
        data: {
          taskId: param(req.params.taskId),
          proofType: 'FILE',
          fileName: req.file.originalname,
          fileUrl: `/uploads/${req.file.filename}`,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          uploadedById: req.user!.id,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });

      await logActivity({
        entityType: 'attachment',
        entityId: attachment.id,
        action: 'created',
        changedById: req.user!.id,
        newValue: req.file.originalname,
      });

      res.status(201).json({ attachment });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : 'Upload failed',
        code: 'BAD_REQUEST',
        status: 400,
      });
    }
  }
);

router.post('/tasks/:taskId/attachments/link', authenticate, async (req: AuthRequest, res: Response) => {
  const { url, title } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required', code: 'BAD_REQUEST', status: 400 });
  }
  if (!isValidUrl(url.trim())) {
    return res.status(400).json({ error: 'Enter a valid http or https link', code: 'BAD_REQUEST', status: 400 });
  }

  let displayName = (title || '').trim();
  if (!displayName) {
    try {
      displayName = new URL(url.trim()).hostname;
    } catch {
      displayName = 'Proof link';
    }
  }

  const attachment = await prisma.attachment.create({
    data: {
      taskId: param(req.params.taskId),
      proofType: 'LINK',
      fileName: displayName,
      fileUrl: url.trim(),
      mimeType: 'text/uri-list',
      uploadedById: req.user!.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  await logActivity({
    entityType: 'attachment',
    entityId: attachment.id,
    action: 'created',
    changedById: req.user!.id,
    newValue: displayName,
  });

  res.status(201).json({ attachment });
});

router.post('/tasks/:taskId/attachments/text', authenticate, async (req: AuthRequest, res: Response) => {
  const { content, title } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required', code: 'BAD_REQUEST', status: 400 });
  }

  const attachment = await prisma.attachment.create({
    data: {
      taskId: param(req.params.taskId),
      proofType: 'TEXT',
      fileName: (title || 'Text note').trim(),
      textContent: content.trim(),
      mimeType: 'text/plain',
      uploadedById: req.user!.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  await logActivity({
    entityType: 'attachment',
    entityId: attachment.id,
    action: 'created',
    changedById: req.user!.id,
    newValue: attachment.fileName,
  });

  res.status(201).json({ attachment });
});

router.delete('/attachments/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: param(req.params.id) } });
  if (!attachment) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });

  await prisma.attachment.delete({ where: { id: param(req.params.id) } });
  res.json({ message: 'Attachment deleted' });
});

export default router;
