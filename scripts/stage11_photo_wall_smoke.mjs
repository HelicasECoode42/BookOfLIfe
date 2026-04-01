import assert from 'assert';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

const repoRoot = new URL('../', import.meta.url);
const port = 3111;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifebook-photo-'));
const uploadDir = path.join(tempDir, 'uploads');
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p6z2bQAAAAASUVORK5CYII=';

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

  const upload = await fetch(`${baseUrl}/api/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: 'birthday.png',
      mimeType: 'image/png',
      dataUrl: tinyPng,
      personId: 'laoxu',
      personName: '朋友A',
      memoryId: 'mem-123',
      memoryTitle: '一起过生日',
      caption: '刚从生日聚会回来'
    })
  }).then((res) => res.json());

  assert.equal(upload.ok, true);
  assert.equal(upload.photo.personName, '朋友A');
  assert.ok(upload.photo.url.startsWith('/uploads/'));

  const uploadedFiles = await fs.readdir(uploadDir);
  assert.equal(uploadedFiles.length, 1);

  const listAfterUpload = await fetch(`${baseUrl}/api/photos`).then((res) => res.json());
  assert.equal(Array.isArray(listAfterUpload.photos), true);
  assert.equal(listAfterUpload.photos[0].id, upload.photo.id);

  const update = await fetch(`${baseUrl}/api/photos/${upload.photo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personId: 'qingjiang',
      personName: '朋友B',
      caption: '更新了挂接人物'
    })
  }).then((res) => res.json());

  assert.equal(update.ok, true);
  assert.equal(update.photo.personName, '朋友B');
  assert.equal(update.photo.caption, '更新了挂接人物');

  const stateRead = await fetch(`${baseUrl}/api/state`).then((res) => res.json());
  assert.equal(Array.isArray(stateRead.state.photos), true);
  assert.equal(stateRead.state.photos[0].id, upload.photo.id);

  const deleted = await fetch(`${baseUrl}/api/photos/${upload.photo.id}`, {
    method: 'DELETE'
  }).then((res) => res.json());

  assert.equal(deleted.ok, true);

  const finalList = await fetch(`${baseUrl}/api/photos`).then((res) => res.json());
  assert.equal(finalList.photos.length, 0);

  console.log('stage11 photo wall smoke passed');
} finally {
  child.kill('SIGTERM');
}
