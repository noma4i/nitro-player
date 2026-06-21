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

const assertPattern = (relative, pattern, message) => {
  if (!exists(relative)) {
    fail(`${message}: ${relative}`);
    return;
  }
  const source = read(relative);
  if (!pattern.test(source)) {
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
      name: 'hls indirect stop under lock',
      pattern: /synchronized\s*\(\s*lock\s*\)\s*\{[^\}]*\bstopServer\s*\(/m,
      bad: 'synchronized(lock) { stopServer(invalidatePendingStart = false) }',
      good: 'val previous = synchronized(lock) { serverSlot.take() }; previous?.stop()'
    },
    {
      name: 'raw production thread',
      pattern: /\bThread\s*\{/m,
      bad: 'Thread { promise.resolve(work()) }.start()',
      good: 'previewExecutor.execute { promise.resolve(work()) }'
    },
    {
      name: 'ktv bounded ping wait',
      pattern: /\[self\.pingCondition\s+wait\]\s*;/m,
      bad: '[self.pingCondition wait];',
      good: '[self.pingCondition waitUntilDate:[NSDate dateWithTimeIntervalSinceNow:3]];'
    },
    {
      name: 'ios clear cache runtime queue',
      pattern: /func\s+clearCache\s*\(\)\s*\{\s*controller\.clearCache\(\)\s*\}/m,
      bad: 'func clearCache() { controller.clearCache() }',
      good: 'func clearCache() { runtimeQueue.sync { controller.clearCache() } }'
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
  ['ios/streaming/cache/HlsCacheBudget.swift', 'android/src/main/java/com/nitroplay/streaming/cache/HlsCacheBudget.kt'],
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
  assertNoPattern(relative, /\bThread\s*\{/m, 'Forbidden raw production Thread; use a bounded executor');
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
  'android/src/main/java/com/nitroplay/streaming/HlsProxyRuntime.kt',
  /synchronized\s*\(\s*lock\s*\)\s*\{[^\}]*\bstopServer\s*\(/m,
  'HLS server stop helper inside synchronized lock'
);
assertNoPattern(
  'ios/streaming/HlsProxyRuntime.swift',
  /stateQueue\.sync\s*\{[^}]*controller\.(start|stop)\s*\(/m,
  'HLS controller start/stop inside stateQueue sync'
);
assertNoPattern(
  'ios/streaming/HlsProxyRuntime.swift',
  /func\s+clearCache\s*\(\)\s*\{\s*controller\.clearCache\(\)\s*\}/m,
  'HLS clearCache must be serialized through runtimeQueue'
);
assertNoPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/Classes/KTVHCHTTPServer/KTVHCHTTPServer.m',
  /\[self\.pingCondition\s+wait\]\s*;/m,
  'Vendored KTV foreground ping wait must be bounded'
);
assertNoPattern(
  'ios/player/HybridNitroPlayer.swift',
  /playbackStateSignature|joined\s*\(\s*separator:/m,
  'Forbidden string playback-state signature in iOS hot path'
);
assertNoPattern(
  'ios/player/PlaybackStateEmissionGate.swift',
  /\blastSignature\b|shouldEmit\s*\(\s*signature:/m,
  'Forbidden string playback-state emission gate'
);

assertNoPattern(
  'NitroPlay.podspec',
  /dependency\s+["']GCDWebServer["']/m,
  'Forbidden external GCDWebServer dependency after vendored KTV backend'
);
assertNoPattern(
  'src/streaming/streamCache.ts',
  /5_368_709_120|5368709120/m,
  'Forbidden stale 5 GiB stream cache default'
);
assertNoPattern(
  'android/src/main/java/com/nitroplay/streaming/cache/HlsCacheStore.kt',
  /5L\s*\*\s*1024L\s*\*\s*1024L\s*\*\s*1024L/m,
  'Forbidden stale 5 GiB Android stream cache default'
);
assertNoPattern(
  'ios/streaming/cache/HlsCacheStore.swift',
  /5_368_709_120|5\s*\*\s*1_024\s*\*\s*1_024\s*\*\s*1_024/m,
  'Forbidden stale 5 GiB iOS stream cache default'
);
assertNoPattern(
  'example/ios/Podfile',
  /pod\s+["']GCDWebServer["']/m,
  'Forbidden example app GCDWebServer pod after vendored KTV backend'
);
assertPattern(
  'ios/vendor/ktvhttpcache/README.md',
  /PR #200[\s\S]*PR #169[\s\S]*PR #187[\s\S]*PR #184[\s\S]*PR #188[\s\S]*PR #148[\s\S]*PR #93[\s\S]*Issue #94/m,
  'Missing vendored KTV provenance/fix list'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/Classes/KTVHCDownload/KTVHCDownload.m',
  /statusCode\s*>=\s*400/m,
  'Vendored KTV must reject HTTP 400 responses'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/Classes/KTVHCDownload/KTVHCDownload.m',
  /additionalHeadersByURL/m,
  'Vendored KTV must support per-URL headers'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/CocoaHTTPServer/WebSocket.m',
  /caseInsensitiveCompare:@"WebSocket"\]\s*!=\s*NSOrderedSame/m,
  'Vendored KTV must include WebSocket upgrade fix'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/Classes/KTVHCCommon/KTVHCRange.h',
  /KTVHCNotFound\s*=\s*LLONG_MAX/m,
  'Vendored KTV must use LLONG_MAX'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/CocoaHTTPServer/Mime/MultipartFormDataParser.m',
  /numberOfBytesToLeavePendingWithData:\(NSData\*\)\s*data\s+length:\(NSUInteger\)\s*length/m,
  'Vendored KTV must keep NSUInteger multipart length'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/Classes/KTVHCHTTPServer/KTVHCHTTPServer.m',
  /if\s*\(\s*error\s*!=\s*NULL\s*\)\s*\{/m,
  'Vendored KTV must guard nullable NSError output'
);
assertPattern(
  'ios/vendor/ktvhttpcache/KTVHTTPCache/Classes/KTVHCHTTPServer/KTVHCHTTPResponse.m',
  /removeObjectForKey:@"Content-Encoding"/m,
  'Vendored KTV must strip Content-Encoding from proxied response headers'
);
assertNoPattern(
  'android/src/main/java/com/nitroplay/player/HybridNitroPlayer.kt',
  /copy\s*\(\s*nativeTimestampMs\s*=/m,
  'Forbidden full PlaybackState copy in Android emission hot path'
);

if (failures.length > 0) {
  console.error('[audit:native-architecture] failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[audit:native-architecture] passed');
