import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());

async function read(file) {
  return fs.readFile(path.join(root, file), 'utf8');
}

const [appHtml, styleCss] = await Promise.all([
  read('app.html'),
  read('style.css')
]);

assert.match(appHtml, /温伴忆光 Demo/);
assert.match(appHtml, /data-page="chat"/);
assert.match(appHtml, /data-page="book"/);
assert.match(appHtml, /data-page="graph"/);
assert.match(appHtml, /data-page="profile"/);
assert.match(appHtml, /录一段语音/);
assert.match(appHtml, /放张照片/);
assert.match(appHtml, /候选线索/);

assert.match(styleCss, /\.chat-input/);
assert.match(styleCss, /\.tabbar-item/);
assert.match(styleCss, /\.memory-card/);
assert.match(styleCss, /\.photo-clue-card/);

console.log('stage M2 app shell smoke passed');
