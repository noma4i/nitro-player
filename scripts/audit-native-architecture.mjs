#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const failures = [];
const fail = message => failures.push(message);

const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const walk = relative => {
  const fullPath = path.join(root, relative);
  if (!fs.existsSync(fullPath)) return [];
  const entries = [];
  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walk(child));
    } else {
      entries.push(child);
    }
  }
  return entries;
};

const withoutComments = source => source
  .split('\n')
  .map(line => line.replace(/\/\/.*$/, ''))
  .join('\n');

const approvedMainThreadSyncFiles = new Set([
  'ios/support/MainThreadResourceExecutor.swift'
]);

const assertNoPattern = (relative, pattern, message) => {
  if (!exists(relative)) return;
  const source = withoutComments(read(relative));
  if (pattern.test(source)) {
    fail(`${message}: ${relative}`);
  }
};

if (process.argv.includes('--self-test')) {
  const samples = [
    {
      name: 'selector observer',
      pattern: /NotificationCenter\.default\.addObserver\([\s\S]*?selector\s*:/m,
      bad: 'NotificationCenter.default.addObserver(self, selector: #selector(foo), name: x, object: nil)',
      good: 'center.addObserver(forName: x, object: nil, queue: .main) { [weak self] _ in self?.foo() }'
    },
    {
      name: 'inline app policy',
      pattern: /\b(playInBackground|playWhenInactive)\b/,
      bad: 'if (!player.playInBackground && !player.playWhenInactive && player.isPlaying) { player.pause() }',
      good: 'if (PlayerAppStatePolicy.shouldAutoPauseWhenEnteringBackground(player.appStateSnapshot())) { player.pause() }'
    },
    {
      name: 'hls lock start',
      pattern: /synchronized\s*\(\s*lock\s*\)\s*\{[\s\S]*?\bserver\??\.(start|stop)\s*\(/m,
      bad: 'synchronized(lock) { server?.start(1000, false) }',
      good: 'val current = synchronized(lock) { server }; current?.stop()'
    },
    {
      name: 'main sync allowlist',
      pattern: /DispatchQueue\.main\.sync\b/,
      bad: 'DispatchQueue.main.sync { player.play() }',
      good: 'DispatchQueue.main.async { player.play() }'
    }
  ];
  for (const sample of samples) {
    if (!sample.pattern.test(sample.bad) || sample.pattern.test(sample.good)) {
      console.error(`[audit:native-architecture] self-test failed: ${sample.name}`);
      process.exit(1);
    }
  }
  console.log('[audit:native-architecture] self-test passed');
  process.exit(0);
}

const requiredMirrors = [
  ['ios/player/PlayerAppStatePolicy.swift', 'android/src/main/java/com/nitroplay/player/PlayerAppStatePolicy.kt'],
  ['ios/player/PlayerRetentionCoordinator.swift', 'android/src/main/java/com/nitroplay/player/PlayerRetentionCoordinator.kt'],
  ['ios/preview/PreviewRequestCoordinator.swift', 'android/src/main/java/com/nitroplay/preview/PreviewRequestCoordinator.kt'],
  ['ios/streaming/HlsPrefetchDeduper.swift', 'android/src/main/java/com/nitroplay/streaming/HlsPrefetchDeduper.kt'],
  ['ios/streaming/HlsRuntimeState.swift', 'android/src/main/java/com/nitroplay/streaming/HlsRuntimeState.kt'],
  ['tests/ios/Tests/Behavior/Core/PlayerAppStatePolicyTests.swift', 'android/src/test/java/com/nitroplay/behavior/core/PlayerAppStatePolicyTest.kt'],
  ['tests/ios/Tests/Behavior/Core/PlayerRetentionCoordinatorTests.swift', 'android/src/test/java/com/nitroplay/behavior/core/PlayerRetentionCoordinatorTest.kt'],
  ['tests/ios/Tests/Behavior/Hls/PreviewRequestCoordinatorTests.swift', 'android/src/test/java/com/nitroplay/behavior/hls/PreviewRequestCoordinatorTest.kt'],
  ['tests/ios/Tests/Behavior/Hls/HlsPrefetchDeduperTests.swift', 'android/src/test/java/com/nitroplay/behavior/hls/HlsPrefetchDeduperTest.kt'],
  ['tests/ios/Tests/Behavior/Hls/HlsRuntimeStateTests.swift', 'android/src/test/java/com/nitroplay/behavior/hls/HlsRuntimeStateTest.kt']
];

for (const pair of requiredMirrors) {
  for (const relative of pair) {
    if (!exists(relative)) {
      fail(`Missing mirrored native seam/test: ${relative}`);
    }
  }
}

for (const relative of walk('ios')) {
  if (!relative.endsWith('.swift')) continue;
  if (!approvedMainThreadSyncFiles.has(relative)) {
    assertNoPattern(relative, /DispatchQueue\.main\.sync\b/, 'Forbidden iOS main-thread sync');
  }
  assertNoPattern(relative, /NotificationCenter\.default\.addObserver\([\s\S]*?selector\s*:/m, 'Forbidden selector-based NotificationCenter observer');
}

for (const relative of walk('android/src/main/java')) {
  if (!relative.endsWith('.kt')) continue;
  assertNoPattern(relative, /Executors\.newCachedThreadPool\s*\(/, 'Forbidden unbounded production executor');
}

for (const relative of [
  'ios/player/NitroPlayerManager.swift',
  'android/src/main/java/com/nitroplay/player/NitroPlayerManager.kt'
]) {
  if (!exists(relative)) continue;
  const source = withoutComments(read(relative));
  if (/\b(playInBackground|playWhenInactive)\b/.test(source)) {
    fail(`Inline app-state policy in manager: ${relative}`);
  }
}

assertNoPattern(
  'android/src/main/java/com/nitroplay/streaming/HlsProxyRuntime.kt',
  /synchronized\s*\(\s*lock\s*\)\s*\{[\s\S]*?\bserver\??\.(start|stop)\s*\(/m,
  'HLS server start/stop inside synchronized lock'
);
assertNoPattern(
  'ios/streaming/HlsProxyRuntime.swift',
  /stateQueue\.sync\s*\{[^}]*controller\.(start|stop)\s*\(/m,
  'HLS controller start/stop inside stateQueue sync'
);

if (failures.length > 0) {
  console.error('[audit:native-architecture] failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[audit:native-architecture] passed');
