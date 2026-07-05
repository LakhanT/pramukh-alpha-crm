import { cpSync, existsSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'backend', 'dist');
const dest = path.join(root, 'api', 'backend-dist');

if (!existsSync(src)) {
  console.error(`backend/dist not found at ${src}`);
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log('Copied backend/dist → api/backend-dist');

const prismaSrc = path.join(root, 'backend', 'node_modules', '.prisma');
const prismaDest = path.join(root, 'node_modules', '.prisma');
if (existsSync(prismaSrc)) {
  if (existsSync(prismaDest)) rmSync(prismaDest, { recursive: true, force: true });
  cpSync(prismaSrc, prismaDest, { recursive: true });
  console.log('Copied Prisma engine → root node_modules/.prisma');
}
