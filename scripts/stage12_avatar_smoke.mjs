import assert from 'assert';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

const repoRoot = new URL('../', import.meta.url);
const port = 3111;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifebook-avatar-'));
const uploadDir = path.join(tempDir, 'uploads');

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

let childLogs = '';
const child = spawn('node', ['server.js'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PORT: String(port),
    APP_DATA_DIR: tempDir,
    UPLOAD_DIR: uploadDir
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (chunk) => {
  childLogs += String(chunk || '');
});

child.stderr.on('data', (chunk) => {
  childLogs += String(chunk || '');
});

const baseUrl = `http://localhost:${port}`;

try {
  try {
    await waitForServer(baseUrl, 15000);
  } catch (error) {
    throw new Error(`${error.message}\n${childLogs}`);
  }

  const capabilities = await fetch(`${baseUrl}/api/avatar/capabilities`).then((res) => res.json());
  assert.equal(capabilities.localFallback, true);

  const generate = await fetch(`${baseUrl}/api/avatar/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionName: '温伴',
      prompt: '温柔、安静、像一本旧书边的陪伴者',
      style: '书页感插画，暖色，克制',
      scene: '站在书页舞台旁边',
      accent: '#c76645'
    })
  }).then((res) => res.json());

  assert.equal(generate.ok, true);
  assert.equal(generate.avatar.provider, 'local-svg');
  assert.ok(generate.avatar.url.startsWith('/uploads/'));

  const avatarFilePath = path.join(uploadDir, generate.avatar.fileName);
  const svgText = await fs.readFile(avatarFilePath, 'utf8');
  assert.ok(svgText.includes('<svg'));
  assert.ok(svgText.includes('温伴'));

  const readAvatar = await fetch(`${baseUrl}/api/avatar`).then((res) => res.json());
  assert.equal(readAvatar.avatar.id, generate.avatar.id);
  assert.equal(readAvatar.avatar.style, '书页感插画，暖色，克制');

  const stateRead = await fetch(`${baseUrl}/api/state`).then((res) => res.json());
  assert.equal(stateRead.state.companionAvatar.id, generate.avatar.id);

  console.log('stage12 avatar smoke passed');
} finally {
  child.kill('SIGTERM');
}
