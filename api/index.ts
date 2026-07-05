import path from 'path';

process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads';

const Module = require('module') as typeof import('module') & {
  Module: { _initPaths: () => void };
};
const rootNm = path.join(process.cwd(), 'node_modules');
const backendNm = path.join(process.cwd(), 'backend', 'node_modules');
process.env.NODE_PATH = [rootNm, backendNm].join(path.delimiter);
Module.Module._initPaths();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require(path.join(process.cwd(), 'api', 'backend-dist', 'app.js'));

export default createApp();
