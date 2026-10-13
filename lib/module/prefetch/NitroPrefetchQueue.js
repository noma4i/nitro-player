"use strict";

import { addNitroPrefetchSettledListener, cancelNitroPlaybackPrefetch, prefetchNitroPlaybackSource } from "../runtime/nativePlaybackRuntime.js";
import { prepareSource } from "../source/prepareSource.js";
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_DURATION_SECONDS = 2;
const COMPLETED_CACHE_LIMIT = 256;
const SETTLED_EVENT_FALLBACK_MS = 35_000;
export const createNitroPrefetchQueue = options => {
  const maxConcurrent = Math.max(1, Math.floor(options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT));
  const ttlMs = Math.max(0, options?.ttlMs ?? DEFAULT_TTL_MS);
  const pending = new Map();
  const inFlight = new Map();
  const fallbackTimers = new Map();
  const completed = new Map();
  let disposed = false;
  const counters = {
    queued: 0,
    dispatched: 0,
    deduped: 0,
    dropped: 0,
    completed: 0,
    failed: 0
  };
  const readSnapshot = () => ({
    queued: pending.size,
    inFlight: inFlight.size,
    completed: completed.size,
    counters: {
      ...counters
    }
  });
  const publishSnapshot = () => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) {
      return;
    }
    const runtime = globalThis;
    if (runtime.__NITRO_PLAY_RUNTIME_DIAGNOSTICS__) {
      runtime.__NITRO_PLAY_RUNTIME_DIAGNOSTICS__.prefetchQueue = readSnapshot();
    }
  };
  const pruneCompleted = now => {
    for (const [requestKey, expiresAt] of completed) {
      if (expiresAt <= now) {
        completed.delete(requestKey);
      }
    }
  };
  const rememberCompleted = requestKey => {
    completed.delete(requestKey);
    completed.set(requestKey, Date.now() + ttlMs);
    while (completed.size > COMPLETED_CACHE_LIMIT) {
      const oldestKey = completed.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      completed.delete(oldestKey);
    }
  };
  const clearFallbackTimer = requestKey => {
    const timer = fallbackTimers.get(requestKey);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    fallbackTimers.delete(requestKey);
  };
  const settleEntry = requestKey => {
    if (!inFlight.delete(requestKey)) {
      return false;
    }
    clearFallbackTimer(requestKey);
    rememberCompleted(requestKey);
    counters.completed += 1;
    return true;
  };
  const handlePrefetchSettled = uri => {
    const entry = [...inFlight.values()].find(candidate => candidate.uri === uri);
    if (!entry || !settleEntry(entry.requestKey)) {
      return;
    }
    dispatchPending();
    publishSnapshot();
  };
  function dispatchPending() {
    while (inFlight.size < maxConcurrent && pending.size > 0) {
      const next = [...pending.values()].sort((left, right) => left.priority - right.priority)[0];
      if (!next) {
        break;
      }
      pending.delete(next.requestKey);
      inFlight.set(next.requestKey, next);
      counters.dispatched += 1;
      const fallbackTimer = setTimeout(() => {
        fallbackTimers.delete(next.requestKey);
        if (!settleEntry(next.requestKey)) {
          return;
        }
        dispatchPending();
        publishSnapshot();
      }, SETTLED_EVENT_FALLBACK_MS);
      fallbackTimers.set(next.requestKey, fallbackTimer);
      try {
        prefetchNitroPlaybackSource(next.source, {
          durationSeconds: next.durationSeconds
        });
      } catch {
        inFlight.delete(next.requestKey);
        clearFallbackTimer(next.requestKey);
        counters.failed += 1;
        continue;
      }
    }
    publishSnapshot();
  }
  const setWindow = requests => {
    if (disposed) {
      return;
    }
    const desired = new Map();
    for (const request of requests) {
      try {
        const prepared = prepareSource(request.source);
        if (!/^https?:\/\//i.test(prepared.uri)) {
          continue;
        }
        const durationSeconds = request.durationSeconds ?? DEFAULT_DURATION_SECONDS;
        const resolved = {
          key: request.key,
          source: prepared,
          requestKey: prepared.identity.requestKey,
          uri: prepared.uri,
          headers: prepared.headers,
          durationSeconds,
          priority: request.priority
        };
        const existing = desired.get(resolved.requestKey);
        if (!existing || resolved.durationSeconds > existing.durationSeconds || resolved.priority < existing.priority) {
          desired.set(resolved.requestKey, resolved);
        } else {
          counters.deduped += 1;
        }
      } catch {
        counters.failed += 1;
      }
    }
    for (const [requestKey] of pending) {
      if (!desired.has(requestKey)) {
        pending.delete(requestKey);
        counters.dropped += 1;
      }
    }
    for (const [requestKey, entry] of inFlight) {
      if (desired.has(requestKey)) {
        continue;
      }
      inFlight.delete(requestKey);
      clearFallbackTimer(requestKey);
      cancelNitroPlaybackPrefetch(entry.source);
      counters.dropped += 1;
    }
    const now = Date.now();
    pruneCompleted(now);
    for (const [requestKey, request] of desired) {
      if (completed.has(requestKey) || inFlight.has(requestKey)) {
        counters.deduped += 1;
        continue;
      }
      const queued = pending.get(requestKey);
      if (queued && queued.durationSeconds >= request.durationSeconds) {
        pending.set(requestKey, {
          ...queued,
          key: request.key,
          priority: request.priority
        });
        counters.deduped += 1;
        continue;
      }
      if (!queued) {
        counters.queued += 1;
      }
      pending.set(requestKey, request);
    }
    dispatchPending();
  };
  const clear = () => {
    counters.dropped += pending.size;
    pending.clear();
    for (const [requestKey, entry] of inFlight) {
      inFlight.delete(requestKey);
      clearFallbackTimer(requestKey);
      cancelNitroPlaybackPrefetch(entry.source);
      counters.dropped += 1;
    }
    for (const timer of fallbackTimers.values()) {
      clearTimeout(timer);
    }
    fallbackTimers.clear();
    completed.clear();
    publishSnapshot();
  };
  const settledSubscription = addNitroPrefetchSettledListener(handlePrefetchSettled);
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    settledSubscription.remove();
    clear();
  };
  const queue = {
    setWindow,
    clear,
    dispose,
    readSnapshot
  };
  publishSnapshot();
  return queue;
};
//# sourceMappingURL=NitroPrefetchQueue.js.map