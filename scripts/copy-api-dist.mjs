import { cpSync, existsSync, rmSync } from 'fs';
import path from 'path';

const src = path.join('backend', 'dist');
const dest = path.join('api', 'backend-dist');

if (!existsSync(src)) {
  console.error('backend/dist not found — run backend build first');
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log('Copied backend/dist → api/backend-dist');
