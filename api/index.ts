import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import path from 'path';

let handler: ReturnType<typeof serverless> | null = null;

function loadApp() {
  process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads';

  const Module = require('module') as typeof import('module') & {
    Module: { _initPaths: () => void };
  };
  const rootNm = path.join(process.cwd(), 'node_modules');
  const backendNm = path.join(process.cwd(), 'backend', 'node_modules');
  process.env.NODE_PATH = [rootNm, backendNm].join(path.delimiter);
  Module.Module._initPaths();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(process.cwd(), 'api', 'backend-dist', 'app.js'));
}

export default async function vercelHandler(req: VercelRequest, res: VercelResponse) {
  if (!handler) {
    const { createApp } = loadApp();
    handler = serverless(createApp());
  }
  return handler(req, res);
}
