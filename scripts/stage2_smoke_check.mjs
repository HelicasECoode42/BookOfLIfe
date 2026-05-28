import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = new URL('../', import.meta.url);
const rootPath = path.resolve(fileURLToPath(repoRoot));
const scriptText = fs.readFileSync(path.join(rootPath, 'script.js'), 'utf8');

assert.match(scriptText, /const APP_STATE =/);
assert.match(scriptText, /function renderMessages/);
assert.match(scriptText, /function renderMemoryPages/);
assert.match(scriptText, /function renderGraphMetrics/);
assert.match(scriptText, /function sendMessage/);
assert.match(scriptText, /function bindEvents/);
assert.match(scriptText, /function init/);

console.log('stage2 smoke passed');
