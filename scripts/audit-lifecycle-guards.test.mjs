#!/usr/bin/env node
//
// Standalone self-test for audit-lifecycle-guards.mjs (zero deps).
// Run: node ./scripts/audit-lifecycle-guards.test.mjs
//
// Asserts:
//   - bad fixtures  -> flagged
//   - good fixtures -> clean
//   - an inline unguarded callback -> flagged   (positive-detection sanity)
//   - an inline guarded callback   -> clean     (negative-detection sanity)

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFileRuleA } from './audit-lifecycle-guards.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '__fixtures__', 'lifecycle');

let failures = 0;
const check = (name, condition) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
};

const flaggedCount = (file, lang) => {
  const path = join(fixtureDir, file);
  if (!existsSync(path)) {
    console.error(`missing fixture: ${path}`);
    failures++;
    return -1;
  }
  return analyzeFileRuleA(path, readFileSync(path, 'utf8'), lang).length;
};

// Fixtures
check('bad.swift.txt is flagged', flaggedCount('bad.swift.txt', 'swift') > 0);
check('good.swift.txt is clean', flaggedCount('good.swift.txt', 'swift') === 0);
check('bad.kt.txt is flagged', flaggedCount('bad.kt.txt', 'kotlin') > 0);
check('good.kt.txt is clean', flaggedCount('good.kt.txt', 'kotlin') === 0);

// Inline positive-detection sanity: a detached task that derefs the stored
// player with no isReleased / generation guard must be flagged.
const inlineBad = `
class P {
  func play() {
    Task.detached { [weak self] in
      guard let self else { return }
      self.player.play()
    }
  }
}
`;
check('inline unguarded detached task is flagged', analyzeFileRuleA('inline', inlineBad, 'swift').length > 0);

// Inline negative-detection sanity: same block guarded by isReleased is clean.
const inlineGood = `
class P {
  func play() {
    Task.detached { [weak self] in
      guard let self, !self.isReleased else { return }
      self.player.play()
    }
  }
}
`;
check('inline guarded detached task is clean', analyzeFileRuleA('inline', inlineGood, 'swift').length === 0);

if (failures > 0) {
  console.error(`\nlifecycle-guard tests FAILED (${failures}).`);
  process.exit(1);
}
console.log('\nlifecycle-guard tests passed.');
