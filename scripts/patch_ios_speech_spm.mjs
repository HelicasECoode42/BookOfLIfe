import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const repoRoot = new URL('../', import.meta.url);
const rootPath = path.resolve(fileURLToPath(repoRoot));
const packageSwiftPath = path.join(rootPath, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
const cameraDependencyNeedle = `.product(name: "CapacitorCamera", package: "CapacitorCamera")`;
const targetsRegex = /targets:\s*\[\s*\.target\(\s*name:\s*"CapApp-SPM"[\s\S]*?\n\s*\]\s*\n\)/m;

const targetsReplacement = `        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                "SpeechRecognitionPlugin"
            ]
        ),
        .target(
            name: "SpeechRecognitionPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ]
        )
    ]
)`;

function patchPackageSwift(source) {
  if (source.includes(`name: "SpeechRecognitionPlugin"`)) {
    return source;
  }

  if (!source.includes(cameraDependencyNeedle)) {
    throw new Error('Failed to patch CapApp-SPM target dependencies for speech plugin.');
  }

  const withTarget = source.replace(targetsRegex, `targets: [\n${targetsReplacement}`);
  if (withTarget === source) {
    throw new Error('Failed to append SpeechRecognitionPlugin target to Package.swift.');
  }

  return withTarget;
}

async function main() {
  const current = await fs.readFile(packageSwiftPath, 'utf8');
  const patched = patchPackageSwift(current);

  if (patched !== current) {
    await fs.writeFile(packageSwiftPath, patched, 'utf8');
    console.log('Patched CapApp-SPM Package.swift with SpeechRecognitionPlugin target.');
    return;
  }

  console.log('CapApp-SPM Package.swift already contains SpeechRecognitionPlugin target.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
