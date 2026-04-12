import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = new URL('../', import.meta.url);
const rootPath = path.resolve(fileURLToPath(repoRoot));
const appHtml = fs.readFileSync(path.join(rootPath, 'app.html'), 'utf8');

assert.match(appHtml, /function buildPhotoRecallPackage/);
assert.match(appHtml, /function matchPhotosForRecall/);
assert.match(appHtml, /function buildVoiceDraftHint/);
assert.match(appHtml, /function getVoiceCaptureMode/);
assert.match(appHtml, /function setApiBaseUrl/);
assert.match(appHtml, /function probeApiBaseUrl/);
assert.match(appHtml, /function requestProfileInsights/);
assert.match(appHtml, /function requestLifeSummaryCompose/);
assert.match(appHtml, /function renderProfileSections/);
assert.match(appHtml, /function renderSummaryGraph/);
assert.match(appHtml, /function renderPhotoStoryList/);
assert.match(appHtml, /function logPipelineStep/);
assert.match(appHtml, /logPipelineStep\("reply-plan"/);
assert.match(appHtml, /candidateDecision/);

console.log('stage13 integration smoke passed');
