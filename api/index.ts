import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';

let handler: ReturnType<typeof serverless> | null = null;

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  if (!handler) {
    process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads';
    const { createApp } = await import('../backend/dist/app');
    handler = serverless(createApp());
  }
  return handler(req, res);
}
