package com.nitroplay.video

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PlayerThreadingRegressionTest {

  @Test
  fun threadingSyncWait_remainsBoundedAndCancelsOnTimeout() {
    val source = readRepositoryFile("android/src/main/java/com/nitroplay/video/core/utils/Threading.kt")

    assertTrue(source.contains("MAIN_THREAD_SYNC_TIMEOUT_MS = 5_000L"))
    assertTrue(source.contains("futureTask.get(MAIN_THREAD_SYNC_TIMEOUT_MS, TimeUnit.MILLISECONDS)"))
    assertTrue(source.contains("futureTask.cancel(true)"))
    assertTrue(source.contains("main thread blocked"))
  }

  @Test
  fun constructorBufferedPreload_staysFireAndForgetOnMainThread() {
    val source = readRepositoryFile("android/src/main/java/com/nitroplay/video/hybrids/videoplayer/HybridNitroPlayer.kt")
    val body = functionBody(source, "constructor(source: HybridNitroPlayerSource)")

    assertTrue(body.contains("runOnMainThread {"))
    assertFalse(body.contains("runOnMainThreadSync"))
    assertTrue(body.contains("lifecycle.initializePlayer()"))
    assertTrue(body.contains("player.prepare()"))
  }

  @Test
  fun promiseAwaitedPlayerMutations_useBoundedMainThreadSyncOnlyInsidePromiseAsync() {
    val source = readRepositoryFile("android/src/main/java/com/nitroplay/video/hybrids/videoplayer/HybridNitroPlayer.kt")
    val replaceBody = functionBody(source, "override fun replaceSourceAsync")
    val preloadBody = functionBody(source, "override fun preload")

    assertTrue(replaceBody.contains("Promise.async"))
    assertTrue(replaceBody.contains("runOnMainThreadSync"))
    assertTrue(preloadBody.contains("Promise.async"))
    assertTrue(preloadBody.contains("runOnMainThreadSync"))
  }

  @Test
  fun startupRecoveryRunnable_doesNotSynchronouslyWaitOnMainThread() {
    val source = readRepositoryFile("android/src/main/java/com/nitroplay/video/hybrids/videoplayer/HybridNitroPlayer.kt")
    val body = functionBody(source, "internal fun attemptStartupRecoveryIfNeeded")

    assertTrue(body.contains("startupRecoveryHandler.postDelayed"))
    assertFalse(body.contains("runOnMainThreadSync"))
  }

  private fun readRepositoryFile(path: String): String {
    val userDir = System.getProperty("user.dir") ?: error("user.dir is not set")
    val root = generateSequence(File(userDir)) { current ->
      current.parentFile
    }
      .firstOrNull { File(it, path).isFile }
      ?: error("Could not locate repository root for $path from $userDir")
    return File(root, path).readText()
  }

  private fun functionBody(source: String, signature: String): String {
    val signatureIndex = source.indexOf(signature)
    check(signatureIndex >= 0) { "Missing signature: $signature" }
    val openingBrace = source.indexOf('{', signatureIndex)
    check(openingBrace >= 0) { "Missing opening brace for: $signature" }

    var depth = 0
    for (index in openingBrace until source.length) {
      when (source[index]) {
        '{' -> depth += 1
        '}' -> {
          depth -= 1
          if (depth == 0) {
            return source.substring(openingBrace, index + 1)
          }
        }
      }
    }

    error("Missing closing brace for: $signature")
  }
}
