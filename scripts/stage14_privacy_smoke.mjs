import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const repoRoot = new URL('../', import.meta.url);
const port = 3111;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifebook-privacy-'));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('server did not start in time');
}

const child = spawn('node', ['server.js'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(port),
    APP_DATA_DIR: tempDir
  },
  stdio: 'ignore'
});

const baseUrl = `http://localhost:${port}`;

try {
  await waitForServer(baseUrl, 15000);
  const privacy = await fetch(`${baseUrl}/api/privacy/summary`).then((res) => res.json());
  assert.equal(privacy.productStage, 'prototype_single_user');
  assert.equal(privacy.storage.storesChat, true);
  assert.equal(Array.isArray(privacy.nextStepsForApp), true);

  const gitignoreText = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.ok(gitignoreText.includes('data/'));
  assert.ok(gitignoreText.includes('uploads/'));

  console.log('stage14 privacy smoke passed');
} finally {
  child.kill('SIGTERM');
}
