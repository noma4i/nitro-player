#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const requiredDomains = ['player', 'source', 'view', 'streaming', 'preview', 'bridge', 'support'];
const failures = [];

const fail = message => failures.push(message);

const assertDir = relative => {
  if (!fs.existsSync(path.join(root, relative))) {
    fail(`Missing directory: ${relative}`);
  }
};

const walk = (relative, visitor) => {
  const fullPath = path.join(root, relative);
  if (!fs.existsSync(fullPath)) {
    return;
  }
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    visitor(childRelative, entry);
    if (entry.isDirectory()) {
      walk(childRelative, visitor);
    }
  }
};

for (const platform of ['src', 'ios']) {
  for (const domain of requiredDomains) {
    assertDir(`${platform}/${domain}`);
  }
}

const androidBase = 'android/src/main/java/com/nitroplay';
for (const domain of requiredDomains) {
  assertDir(`${androidBase}/${domain}`);
}

const trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

for (const file of trackedFiles) {
  if (file.endsWith('/.DS_Store') || file === '.DS_Store') {
    fail(`Tracked macOS metadata file: ${file}`);
  }
}

for (const sourceRoot of ['src', 'ios', 'android/src/main/java', 'android/src/test', 'tests', 'docs']) {
  walk(sourceRoot, (file, entry) => {
    if (entry.name === '.DS_Store') {
      fail(`macOS metadata file in source tree: ${file}`);
    }
  });
}

const swiftSourcesDir = path.join(root, 'tests/ios/Sources');
if (fs.existsSync(swiftSourcesDir)) {
  const entries = fs.readdirSync(swiftSourcesDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(swiftSourcesDir, entry.name);
    if (!entry.isSymbolicLink()) {
      fail(`SwiftPM test source must be a symlink: ${path.relative(root, fullPath)}`);
      continue;
    }
    const target = fs.realpathSync(fullPath);
    if (!target.startsWith(path.join(root, 'ios'))) {
      fail(`SwiftPM symlink points outside ios/: ${path.relative(root, fullPath)}`);
    }
  }
} else {
  fail('Missing tests/ios/Sources');
}

if (failures.length > 0) {
  console.error('[audit:architecture] failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[audit:architecture] passed');
