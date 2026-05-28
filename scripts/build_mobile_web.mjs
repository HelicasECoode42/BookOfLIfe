import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const repoRoot = new URL('../', import.meta.url);
const sourceRoot = path.resolve(fileURLToPath(repoRoot));
const outDir = path.join(sourceRoot, 'mobile_web');

async function ensureEmptyDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(name, targetName = name) {
  await fs.copyFile(path.join(sourceRoot, name), path.join(outDir, targetName));
}

async function writeAppConfig() {
  const apiBaseUrl = resolveApiBaseUrl();
  const content = `window.__APP_CONFIG__ = Object.assign(
  {
    apiBaseUrl: ${JSON.stringify(apiBaseUrl)}
  },
  window.__APP_CONFIG__ || {}
);
`;
  await fs.writeFile(path.join(outDir, 'app-config.js'), content, 'utf8');
}

function pickLanIpAddress() {
  const interfaces = Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
  return interfaces[0] || '';
}

function resolveApiBaseUrl() {
  const configured = String(process.env.APP_API_BASE_URL || '').trim();
  if (configured) return configured;

  const port = String(process.env.PORT || '3001').trim() || '3001';
  const lanIp = pickLanIpAddress();
  if (!lanIp) return '';
  return `http://${lanIp}:${port}`;
}

async function main() {
  await ensureEmptyDir(outDir);
  await copyFile('app.html', 'index.html');
  await copyFile('style.css');
  await copyFile('script.js');
  await writeAppConfig();
  console.log('mobile web bundle ready at mobile_web/');
  console.log(`bundled api base: ${resolveApiBaseUrl() || '(empty)'}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
