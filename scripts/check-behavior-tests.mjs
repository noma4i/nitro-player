import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = [
  'src/__tests__',
  'android/src/test',
  'tests/ios/Tests'
];

const bannedPatterns = [
  /\breadRepositoryFile\b/,
  /\bfunctionBody\b/,
  /\bsource\.contains\b/,
  /\bbody\.contains\b/,
  /Pattern from/,
  /mirrors the exact decision logic/,
  /\bAuditPhase\d+/
];

const testFilePattern = /\.(kt|swift|tsx?|jsx?)$/;
const violations = [];

const walk = path => {
  for (const entry of readdirSync(path)) {
    const nextPath = join(path, entry);
    const stat = statSync(nextPath);
    if (stat.isDirectory()) {
      walk(nextPath);
      continue;
    }
    if (!testFilePattern.test(nextPath)) {
      continue;
    }

    const source = readFileSync(nextPath, 'utf8');
    source.split(/\r?\n/).forEach((line, index) => {
      for (const pattern of bannedPatterns) {
        if (pattern.test(line)) {
          violations.push(`${nextPath}:${index + 1}: ${line.trim()}`);
        }
      }
    });
  }
};

roots.forEach(walk);

if (violations.length > 0) {
  console.error('Behavior test audit failed. Tests must exercise production behavior, not source text or copied implementation branches.');
  console.error(violations.join('\n'));
  process.exit(1);
}
