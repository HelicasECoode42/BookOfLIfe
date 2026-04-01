import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

const scriptPath = new URL('../script.js', import.meta.url);
const code = fs.readFileSync(scriptPath, 'utf8');

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const noop = () => {};
const nodes = new Map();
const fakeElement = (id = '') => ({
  id,
  value: '',
  innerHTML: '',
  textContent: '',
  hidden: false,
  style: {},
  dataset: {},
  className: '',
  src: '',
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop,
  removeEventListener: noop,
  setAttribute: noop,
  getAttribute: () => '',
  removeAttribute: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
  closest: () => null,
  appendChild: (child) => {
    if (child?.id) nodes.set(child.id, child);
  },
  insertAdjacentHTML: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, width: 0, height: 0 }),
  scrollHeight: 0
});

const body = fakeElement('body');

const context = {
  console,
  localStorage,
  Intl,
  Date,
  Math,
  JSON,
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
  clearTimeout: noop,
  alert: noop,
  fetch: async () => {
    throw new Error('fetch disabled in smoke test');
  },
  document: {
    addEventListener: noop,
    body,
    createElement: (tag) => fakeElement(tag),
    getElementById: (id) => nodes.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  window: {
    addEventListener: noop,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    innerHeight: 800,
    L2Dwidget: { init: noop }
  },
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined,
  Element: function Element() {}
};

vm.createContext(context);
vm.runInContext(code, context);

assert.ok(typeof context.ensureEnhancementHub === 'function', 'ensureEnhancementHub should exist');
assert.ok(typeof context.runEnhancementTask === 'function', 'runEnhancementTask should exist');
assert.ok(typeof context.getEnhancementTasks === 'function', 'getEnhancementTasks should exist');

context.ensureEnhancementHub();

await context.runEnhancementTask({
  label: '照片墙上传',
  detail: '正在把照片收进回忆侧栏',
  successDetail: '照片已经保存并挂到照片墙'
}, async () => 'ok');

const tasks = context.getEnhancementTasks();
assert.equal(tasks.length >= 1, true);
assert.equal(tasks[0].label, '照片墙上传');
assert.equal(tasks[0].status, 'success');

console.log('stage13 integration smoke passed');
