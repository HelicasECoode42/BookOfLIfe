import assert from 'assert';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

const repoRoot = new URL('../', import.meta.url);
const port = 3111;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lifebook-backend-'));

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
  await waitForServer(baseUrl);

  const health = await fetch(`${baseUrl}/api/health`).then((res) => res.json());
  assert.equal(health.ok, true);
  assert.equal(health.dataDir, tempDir);

  const bootstrapPayload = {
    state: {
      profile: { name: '测试用户' },
      memories: [{ id: 'mem-1', title: '测试记忆' }],
      revisionLogs: [{ revisionId: 'rev-1', revisionType: 'time_revision' }]
    }
  };

  const bootstrap = await fetch(`${baseUrl}/api/state/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bootstrapPayload)
  }).then((res) => res.json());
  assert.equal(bootstrap.ok, true);
  assert.equal(bootstrap.state.profile.name, '测试用户');

  const putResult = await fetch(`${baseUrl}/api/state/activeEventContext`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: { id: 'event-1', summary: '今天，朋友A，过生日' } })
  }).then((res) => res.json());
  assert.equal(putResult.ok, true);
  assert.equal(putResult.value.id, 'event-1');

  const traceResult = await fetch(`${baseUrl}/api/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: 'trace-1',
      createdAt: '2026/04/01 10:00:00',
      userText: '今天和朋友过生日',
      assistantReply: '听起来很开心。',
      replyPlan: { responseMode: 'continue_event' }
    })
  }).then((res) => res.json());
  assert.equal(traceResult.ok, true);
  assert.equal(traceResult.trace.traceId, 'trace-1');

  const stateRead = await fetch(`${baseUrl}/api/state`).then((res) => res.json());
  assert.equal(stateRead.state.activeEventContext.id, 'event-1');
  assert.equal(Array.isArray(stateRead.traces), true);
  assert.equal(stateRead.traces[0].traceId, 'trace-1');

  console.log('stage9 backend smoke passed');
} finally {
  child.kill('SIGTERM');
}
