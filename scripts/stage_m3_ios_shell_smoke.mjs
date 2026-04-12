import assert from 'assert';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const repoRoot = new URL('../', import.meta.url);
const rootPath = path.resolve(fileURLToPath(repoRoot));

async function read(filePath) {
  return fs.readFile(filePath, 'utf8');
}

const capacitorConfig = await read(path.join(rootPath, 'capacitor.config.ts'));
assert.match(capacitorConfig, /webDir:\s*'mobile_web'/);
assert.match(capacitorConfig, /appId:\s*'com\.helicase\.wenbanyiguang'/);

const mobileIndex = await read(path.join(rootPath, 'mobile_web', 'index.html'));
assert.match(mobileIndex, /温伴忆光 Demo/);
assert.match(mobileIndex, /voiceStatusPill/);
assert.match(mobileIndex, /voiceStopBtn/);
assert.match(mobileIndex, /memory-filter/);
assert.match(mobileIndex, /candidateDecision/);

const plist = await read(path.join(rootPath, 'ios', 'App', 'App', 'Info.plist'));
assert.match(plist, /NSCameraUsageDescription/);
assert.match(plist, /NSMicrophoneUsageDescription/);
assert.match(plist, /NSPhotoLibraryUsageDescription/);
assert.match(plist, /NSSpeechRecognitionUsageDescription/);
assert.match(plist, /ITSAppUsesNonExemptEncryption/);

const packageSwift = await read(path.join(rootPath, 'ios', 'App', 'CapApp-SPM', 'Package.swift'));
assert.match(packageSwift, /SpeechRecognitionPlugin/);

const speechPluginSwift = await read(
  path.join(rootPath, 'ios', 'App', 'CapApp-SPM', 'Sources', 'SpeechRecognitionPlugin', 'SpeechRecognitionPlugin.swift')
);
assert.match(speechPluginSwift, /@objc\(SpeechRecognition\)/);
assert.match(speechPluginSwift, /CAPBridgedPlugin/);

console.log('stage M3 ios shell smoke passed');
