import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('server did not start in time');
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const repoRoot = new URL('../', import.meta.url);
const port = Number(process.env.STAGE22_PORT || 3130);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifebook-stage22-http-'));

const child = spawn('node', ['server.js'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_DATA_DIR: tempDir
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let childOutput = '';
child.stdout.on('data', (chunk) => { childOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { childOutput += chunk.toString(); });

const baseUrl = `http://127.0.0.1:${port}`;
let passed = 0;
let failed = 0;

try {
  await waitForServer(baseUrl);
  console.log(`  server started on ${baseUrl}`);

  // Bootstrap seed state with 老张 facts
  const seed = {
    confirmedFacts: [
      {
        id: 'fact-laozhang',
        canonicalLabel: '老张是纺织厂同事',
        subject: '老张',
        predicate: '是',
        object: '纺织厂同事',
        relatedPeople: ['老张'],
        timeLabels: ['纺织厂那几年'],
        timelineDate: '1990',
        sourceText: '老张和用户在纺织厂一起工作过十二年。',
        status: 'user_confirmed'
      },
      {
        id: 'fact-laozhang-retire',
        canonicalLabel: '老张2022年退休',
        subject: '老张',
        predicate: '退休',
        object: '2022年',
        relatedPeople: ['老张'],
        timeLabels: ['2022年'],
        timelineDate: '2022-03',
        sourceText: '老张2022年3月退休了。',
        status: 'user_confirmed'
      }
    ],
    memoryCandidates: [
      {
        id: 'candidate-laozhang',
        summary: '老张最近退休了',
        sourceText: '今天听说老张退休了。',
        people: ['老张'],
        timeLabels: ['今天'],
        status: 'pending_user_confirmation',
        candidateType: 'event_memory'
      }
    ],
    memories: [],
    dailyLogs: [],
    photos: [],
    lifeSummaries: []
  };

  const bootstrap = await jsonFetch(`${baseUrl}/api/state/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: seed })
  });
  assert.equal(bootstrap.response.ok, true, `bootstrap failed: ${JSON.stringify(bootstrap.payload)}`);

  // Test 1: GET /api/timeline?person=老张 returns ok=true
  const t1 = await jsonFetch(`${baseUrl}/api/timeline?person=老张&limit=20`);
  assert.equal(t1.response.ok, true, `GET /api/timeline should return 200`);
  assert.equal(t1.payload.ok, true, `GET /api/timeline ok should be true`);
  assert.ok(t1.payload.timeline, 'response should have timeline');
  assert.ok(Array.isArray(t1.payload.timeline.items), 'timeline.items should be array');
  assert.ok(t1.payload.timeline.items.length > 0, 'timeline should have items for 老张');
  passed += 1;
  console.log('  ✓ GET /api/timeline?person=老张 returns ok=true with items');

  // Test 2: GET /api/timeline?person=张师傅 hits 老张 via alias
  const t2 = await jsonFetch(`${baseUrl}/api/timeline?person=张师傅&limit=20`);
  assert.equal(t2.payload.ok, true, 'alias search should return ok');
  const laozhangItems = t2.payload.timeline.items.filter((item) =>
    (item.people || []).includes('老张')
  );
  assert.ok(laozhangItems.length > 0, 'queryTimeline("张师傅") should hit items with people=老张');
  passed += 1;
  console.log('  ✓ GET /api/timeline?person=张师傅 hits 老张 via alias');

  // Test 3: timeline items have id/answerPolicy/status
  t1.payload.timeline.items.forEach((item) => {
    assert.ok(item.id !== undefined && item.id !== null, `item should have id: ${JSON.stringify(item)}`);
    assert.ok(item.answerPolicy !== undefined, `item should have answerPolicy`);
    assert.ok(item.status !== undefined, `item should have status`);
  });
  passed += 1;
  console.log('  ✓ timeline items have id/answerPolicy/status');

  // Test 4: GET /api/state returns memory data
  const t4 = await jsonFetch(`${baseUrl}/api/state`);
  assert.equal(t4.response.ok, true, '/api/state should return 200');
  const state = t4.payload.state || t4.payload;
  assert.ok(Array.isArray(state.confirmedFacts), 'state should have confirmedFacts');
  assert.ok(state.confirmedFacts.length >= 2, 'should have seeded facts');
  passed += 1;
  console.log('  ✓ GET /api/state returns memory data');

  // Test 5: unknown person returns empty items
  const t5 = await jsonFetch(`${baseUrl}/api/timeline?person=王五&limit=10`);
  assert.equal(t5.payload.ok, true, 'unknown person should still return ok');
  assert.equal(t5.payload.timeline.items.length, 0, 'unknown person should have 0 items');
  passed += 1;
  console.log('  ✓ GET /api/timeline?person=王五 returns empty items');

  // Test 6: start/end query params filter dated items
  const t6 = await jsonFetch(`${baseUrl}/api/timeline?person=老张&start=2022-01&end=2022-12&limit=20`);
  assert.equal(t6.payload.ok, true, 'timeRange query should return ok');
  assert.ok(t6.payload.timeline.items.length > 0, 'timeRange query should return 2022 items');
  assert.ok(t6.payload.timeline.items.every((item) => String(item.timelineDate || '').startsWith('2022')),
    `timeRange should only return 2022 dated items: ${JSON.stringify(t6.payload.timeline.items)}`);
  passed += 1;
  console.log('  ✓ GET /api/timeline start/end filters dated items');

  console.log(`\n  stage22 timeline endpoint smoke PASSED (${passed}/${passed + failed})`);
} catch (error) {
  failed += 1;
  console.error(childOutput);
  console.error(`\n  FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}
