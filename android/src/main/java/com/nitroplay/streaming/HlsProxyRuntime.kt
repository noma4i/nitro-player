package com.nitroplay.video.streaming

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.margelo.nitro.NitroModules
import com.margelo.nitro.video.ListenerSubscription
import com.nitroplay.video.BuildConfig
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicLong
import com.nitroplay.video.streaming.cache.HlsCacheBudget
import com.nitroplay.video.support.ListenerRegistry
import com.nitroplay.video.support.SingleOwnerResourceSlot

object HlsProxyRuntime {
  private const val TAG = "NitroPlayHlsPrefetch"
  // 0 = OS-assigned ephemeral port. A fixed port collides when several proxies
  // share the loopback, making the bind fail and silently fall back to direct
  // playback; the actual bound port is read back via HlsProxyServer.listeningPort().
  private const val DEFAULT_PORT = 0
  internal const val DEFAULT_PREFETCH_DURATION_SECONDS = 2.0
  private const val PREFETCH_DEDUP_MS = 60_000L
  private const val PREFETCH_MAX_ENTRIES = 500
  private const val PREFETCH_SETTLED_EVENT = "prefetchSettled"

  private val lock = Any()
  private val runtimeState = HlsRuntimeState(DEFAULT_PORT)
  private var lifecycleRegistration: LifecycleRegistration? = null
  private var cacheMaxBytes = HlsCacheBudget.DEFAULT_MAX_BYTES
  private var cacheConfigurationLocked = false
  private val serverSlot = SingleOwnerResourceSlot<HlsProxyServer> { it.stop() }
  private var serverStopGeneration = 0
  private var appContext: Context? = null
  @Volatile
  private var needsHealthCheck = true
  private var isRecovering = false
  private val recoveryExecutor = Executors.newSingleThreadExecutor()
  private val pendingRecoveryCompletions = mutableListOf<() -> Unit>()
  private var routeGenerationValue = 0
  private val prefetchDeduper = HlsPrefetchDeduper(PREFETCH_DEDUP_MS, PREFETCH_MAX_ENTRIES)
  private val prefetchSettledListeners = ListenerRegistry()
  private val prefetchExecutor = Executors.newSingleThreadExecutor()
  private val prefetchTasks = mutableMapOf<String, Future<*>>()
  private val prefetchOperationIds = mutableMapOf<String, Long>()
  private val nextPrefetchOperationId = AtomicLong()
  private val prefetchRequested = AtomicLong()
  private val prefetchStarted = AtomicLong()
  private val prefetchCompleted = AtomicLong()
  private val prefetchDeduped = AtomicLong()
  private val prefetchFailed = AtomicLong()
  private val prefetchCancelled = AtomicLong()

  /** Monotonic generation of proxied routes; changes whenever the bound port changes. */
  internal val routeGeneration: Int
    get() = synchronized(lock) { routeGenerationValue }

  /** True only when the transport passed an application-level probe and is serving. */
  internal val isTransportReady: Boolean
    get() = !needsHealthCheck && serverSlot.current?.isAlive == true

  private fun ensureRuntimeContext(): Boolean {
    val currentContext = NitroModules.applicationContext ?: return false
    val registrationChange = synchronized(lock) {
      if (lifecycleRegistration?.context === currentContext) {
        appContext = currentContext.applicationContext
        return true
      }

      val previous = lifecycleRegistration
      val next = LifecycleRegistration(
        context = currentContext,
        listener = object : LifecycleEventListener {
          override fun onHostResume() {
            handleHostResume(currentContext)
          }

          override fun onHostPause() {
            markNeedsHealthCheck()
          }

          override fun onHostDestroy() {
            handleHostDestroy(currentContext)
          }
        }
      )
      lifecycleRegistration = next
      appContext = currentContext.applicationContext
      LifecycleRegistrationChange(previous, next)
    }
    registrationChange.previous?.let { previous ->
      previous.context.removeLifecycleEventListener(previous.listener)
    }
    registrationChange.next.context.addLifecycleEventListener(registrationChange.next.listener)
    return true
  }

  private fun handleHostResume(ownerContext: ReactApplicationContext) {
    synchronized(lock) {
      if (lifecycleRegistration?.context !== ownerContext) {
        return
      }
    }
    markNeedsHealthCheck()
  }

  private fun handleHostDestroy(ownerContext: ReactApplicationContext) {
    val registration = synchronized(lock) {
      val currentRegistration = lifecycleRegistration
      if (currentRegistration?.context !== ownerContext) {
        return
      }
      lifecycleRegistration = null
      appContext = null
      runtimeState.suspendForHostLifecycle()
      currentRegistration
    }
    registration.context.removeLifecycleEventListener(registration.listener)
    stopServer()
  }

  internal fun resolvePlaybackRoute(url: String, headers: Map<String, String>?): PlaybackRouteResolution {
    ensureStarted()
    if (!ensureServerRunning()) {
      return PlaybackRouteResolution(url = url, isProxying = false)
    }
    val activeServer = serverSlot.current
      ?: return PlaybackRouteResolution(url = url, isProxying = false)
    if (!activeServer.isAlive || needsHealthCheck) {
      return PlaybackRouteResolution(url = url, isProxying = false)
    }
    val encodedUrl = URLEncoder.encode(url, "UTF-8")
    val encodedHeaders = HlsHeaderCodec.encode(headers)
    val streamKey = HlsIdentity.requestKey(url, headers)
    val query = StringBuilder("url=").append(encodedUrl)
    if (encodedHeaders != null) {
      query.append("&headers=").append(URLEncoder.encode(encodedHeaders, "UTF-8"))
    }
    query.append("&streamKey=").append(URLEncoder.encode(streamKey, "UTF-8"))
    return PlaybackRouteResolution(
      url = "http://127.0.0.1:${activeServer.listeningPort()}/hls/manifest.m3u8?$query",
      isProxying = true,
      routeGeneration = routeGeneration
    )
  }

  private fun prefetchLeadingSegments(
    url: String,
    headers: Map<String, String>?,
    durationSeconds: Double,
    onComplete: () -> Unit,
    onError: (Throwable) -> Unit
  ) {
    if (!HlsManifestUrl.matches(url)) {
      onComplete()
      return
    }
    ensureStarted()

    val dedupKey = HlsIdentity.requestKey(url, headers)
    val shouldPrefetch = prefetchDeduper.shouldPrefetch(dedupKey, durationSeconds)

    if (!shouldPrefetch) {
      prefetchDeduped.incrementAndGet()
      onComplete()
      return
    }

    val activeServer = serverSlot.current
    if (activeServer == null) {
      prefetchDeduper.forget(dedupKey)
      onError(IllegalStateException("HLS proxy server is unavailable"))
      return
    }

    prefetchStarted.incrementAndGet()
    activeServer.prefetch(
      url,
      headers,
      durationSeconds,
      {
        prefetchCompleted.incrementAndGet()
        onComplete()
      },
      { error ->
        prefetchDeduper.forget(dedupKey)
        onError(error)
      }
    )
  }

  internal fun requestLeadingSegmentPrefetchAsync(
    url: String,
    headers: Map<String, String>?,
    durationSeconds: Double
  ) {
    prefetchRequested.incrementAndGet()
    val requestKey = HlsIdentity.requestKey(url, headers)
    var rejectedError: RejectedExecutionException? = null
    synchronized(prefetchTasks) {
      if (prefetchOperationIds.containsKey(requestKey)) {
        prefetchDeduped.incrementAndGet()
        return
      }
      val operationId = nextPrefetchOperationId.incrementAndGet()
      prefetchOperationIds[requestKey] = operationId
      try {
        val future = prefetchExecutor.submit {
          try {
            prefetchLeadingSegments(
              url,
              headers,
              durationSeconds,
              onComplete = { settlePrefetch(requestKey, operationId, url) },
              onError = { error ->
                recordPrefetchFailure(error)
                settlePrefetch(requestKey, operationId, url)
              }
            )
          } catch (error: Throwable) {
            recordPrefetchFailure(error)
            settlePrefetch(requestKey, operationId, url)
          }
        }
        if (prefetchOperationIds[requestKey] == operationId) {
          prefetchTasks[requestKey] = future
        } else {
          future.cancel(false)
        }
      } catch (error: RejectedExecutionException) {
        prefetchOperationIds.remove(requestKey)
        rejectedError = error
      }
    }
    rejectedError?.let { error ->
      recordPrefetchFailure(error)
      emitPrefetchSettled(url)
    }
  }

  internal fun cancelPrefetch(url: String, headers: Map<String, String>?) {
    val requestKey = HlsIdentity.requestKey(url, headers)
    val cancellation = synchronized(prefetchTasks) {
      val hadOperation = prefetchOperationIds.remove(requestKey) != null
      val outerCancelled = prefetchTasks.remove(requestKey)?.cancel(false) == true
      Pair(hadOperation, outerCancelled)
    }
    val innerCancelled = serverSlot.current?.cancelPrefetch(requestKey) == true
    prefetchDeduper.forget(requestKey)
    if (cancellation.first || cancellation.second || innerCancelled) {
      prefetchCancelled.incrementAndGet()
      emitPrefetchSettled(url)
    }
  }

  internal fun addOnPrefetchSettledListener(listener: (String) -> Unit): ListenerSubscription {
    return prefetchSettledListeners.add(PREFETCH_SETTLED_EVENT, listener)
  }

  internal fun emitPrefetchSettled(url: String) {
    prefetchSettledListeners.emit<(String) -> Unit>(PREFETCH_SETTLED_EVENT) { listener -> listener(url) }
  }

  private fun settlePrefetch(requestKey: String, operationId: Long, url: String) {
    val shouldEmit = synchronized(prefetchTasks) {
      if (prefetchOperationIds[requestKey] != operationId) {
        false
      } else {
        prefetchOperationIds.remove(requestKey)
        prefetchTasks.remove(requestKey)
        true
      }
    }
    if (shouldEmit) {
      emitPrefetchSettled(url)
    }
  }

  internal fun recordPrefetchRequest() {
    prefetchRequested.incrementAndGet()
  }

  internal fun prefetchDebugSnapshot(): Map<String, Long> = mapOf(
    "requested" to prefetchRequested.get(),
    "started" to prefetchStarted.get(),
    "completed" to prefetchCompleted.get(),
    "deduped" to prefetchDeduped.get(),
    "failed" to prefetchFailed.get(),
    "cancelled" to prefetchCancelled.get()
  )

  private fun recordPrefetchFailure(error: Throwable) {
    prefetchFailed.incrementAndGet()
    if (BuildConfig.DEBUG) {
      Log.w(TAG, "HLS prefetch failed", error)
    }
  }

  internal fun purgeCachedSource(url: String, headers: Map<String, String>?) {
    if (!HlsManifestUrl.matches(url)) {
      return
    }
    val streamKey = HlsIdentity.requestKey(url, headers)
    prefetchDeduper.forget(streamKey)
    serverSlot.current?.cacheStore?.clearStream(streamKey)
  }

  internal fun cacheStats(): Triple<Long, Int, Long> {
    ensureStarted()
    val cacheStore = serverSlot.current?.cacheStore
    return Triple(
      cacheStore?.totalBytes() ?: 0L,
      cacheStore?.fileCount() ?: 0,
      synchronized(lock) { cacheMaxBytes }
    )
  }

  internal fun configureCache(maxBytes: Long) {
    require(HlsCacheBudget.isValid(maxBytes)) { "Nitro playback cache maxBytes is below the minimum" }
    synchronized(lock) {
      check(!cacheConfigurationLocked) {
        "Configure the Nitro playback cache before the first cache operation, prefetch, or playback"
      }
      cacheMaxBytes = maxBytes
    }
  }

  internal fun clearCache() {
    ensureStarted()
    prefetchDeduper.clear()
    serverSlot.current?.cacheStore?.clearAll()
  }

  /**
   * Marks the transport as requiring an application-level probe before it is trusted again.
   * Called by the single lifecycle owner when the process may have been suspended.
   */
  internal fun markNeedsHealthCheck() {
    needsHealthCheck = true
  }

  /**
   * Probes the transport off the main thread and restarts it when the probe fails.
   * A completion arriving while a pass is running joins that pass instead of firing early.
   */
  internal fun recoverTransport(onComplete: () -> Unit) {
    val shouldRun = synchronized(lock) {
      pendingRecoveryCompletions.add(onComplete)
      if (isRecovering) {
        false
      } else {
        isRecovering = true
        true
      }
    }
    if (!shouldRun) {
      return
    }
    try {
      recoveryExecutor.execute {
        try {
          performRecovery()
        } finally {
          synchronized(lock) { isRecovering = false }
          flushRecoveryCompletions()
        }
      }
    } catch (_: RejectedExecutionException) {
      synchronized(lock) { isRecovering = false }
      flushRecoveryCompletions()
    }
  }

  private fun flushRecoveryCompletions() {
    val completions = synchronized(lock) {
      val pending = pendingRecoveryCompletions.toList()
      pendingRecoveryCompletions.clear()
      pending
    }
    completions.forEach { it() }
  }

  private fun performRecovery() {
    if (!ensureRuntimeContext()) {
      return
    }
    if (!runtimeState.didAutoStart()) {
      return
    }
    val server = serverSlot.current
    if (server != null && server.isAlive && server.respondsToProbe()) {
      needsHealthCheck = false
      return
    }
    val desiredPort = runtimeState.portForPlaybackRecoveryRestart() ?: DEFAULT_PORT
    val restarted = ensureServerRunning(forceRestart = true, desiredPort = desiredPort)
    needsHealthCheck = !restarted
  }

  private fun ensureStarted() {
    synchronized(lock) {
      cacheConfigurationLocked = true
    }
    if (!ensureRuntimeContext()) {
      return
    }
    runtimeState.portForImplicitStart()?.let {
      if (ensureServerRunning(forceRestart = false, desiredPort = it)) {
        runtimeState.markAutoStarted()
      }
    }
  }

  private fun ensureServerRunning(forceRestart: Boolean = false, desiredPort: Int = DEFAULT_PORT): Boolean {
    val startPlan = synchronized(lock) {
      val context = appContext ?: return false
      val isAlive = serverSlot.current?.isAlive == true
      if (!forceRestart && isAlive) {
        return true
      }
      serverSlot.take()?.let { PreviousServer(it, context, serverStopGeneration) }
        ?: PreviousServer(null, context, serverStopGeneration)
    }
    startPlan.server?.let { serverSlot.releaseResource(it) }
    val context = startPlan.context
    val startGeneration = startPlan.startGeneration
    val candidatePorts = if (desiredPort > 0) intArrayOf(desiredPort, 0) else intArrayOf(desiredPort)
    var nextServer: HlsProxyServer? = null
    for (candidatePort in candidatePorts) {
      val cacheMaxBytes = synchronized(lock) { this.cacheMaxBytes }
      val candidateServer = HlsProxyServer(candidatePort, context, cacheMaxBytes, prefetchDeduper::forget)
      val started = try {
        candidateServer.start(NanoHttpdConfig.TIMEOUT_MS, false)
        candidateServer.isAlive
      } catch (_: Exception) {
        false
      }
      if (started) {
        nextServer = candidateServer
        break
      }
      candidateServer.stop()
    }
    val startedServer = nextServer ?: return false

    val replacedServer = synchronized(lock) {
      if (serverStopGeneration != startGeneration) {
        null
      } else {
        serverSlot.swap(startedServer)
      }
    }
    val stored = serverSlot.current === startedServer
    replacedServer?.let { serverSlot.releaseResource(it) }
    if (!stored) {
      startedServer.stop()
    } else {
      if (runtimeState.recordBoundPort(startedServer.listeningPort())) {
        synchronized(lock) { routeGenerationValue += 1 }
      }
    }
    val ready = stored && startedServer.isAlive
    if (ready) {
      needsHealthCheck = false
    }
    return ready
  }

  private fun stopServer(invalidatePendingStart: Boolean = true) {
    val previous = synchronized(lock) {
      if (invalidatePendingStart) {
        serverStopGeneration += 1
      }
      serverSlot.take()
    }
    previous?.let { serverSlot.releaseResource(it) }
  }

  private data class PreviousServer(
    val server: HlsProxyServer?,
    val context: Context,
    val startGeneration: Int
  )

  private data class LifecycleRegistration(
    val context: ReactApplicationContext,
    val listener: LifecycleEventListener
  )

  private data class LifecycleRegistrationChange(
    val previous: LifecycleRegistration?,
    val next: LifecycleRegistration
  )
}

internal data class PlaybackRouteResolution(
  val url: String,
  val isProxying: Boolean,
  /** Transport generation this route was resolved against; null when the route bypasses the proxy. */
  val routeGeneration: Int? = null
)
