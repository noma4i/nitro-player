package com.margelo.nitro.video

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackSeekPlannerTest {
  @Test
  fun seekByClampsAgainstFiniteDuration() {
    val targetMs = PlaybackSeekPlanner.positionMsForTarget(
      PlaybackSeekPlanner.targetForSeekBy(currentTime = 25.0, offset = 10.0, duration = 30.0),
      duration = 30.0
    )

    assertEquals(30_000L, targetMs)
  }

  @Test
  fun seekToTreatsNaNDurationAsUnbounded() {
    val targetMs = PlaybackSeekPlanner.positionMsForTarget(
      PlaybackSeekPlanner.targetForSeekTo(targetTime = 120.0, duration = Double.NaN),
      duration = Double.NaN
    )

    assertEquals(120_000L, targetMs)
  }

  @Test
  fun seekToClampsNegativeTargetToZero() {
    val targetMs = PlaybackSeekPlanner.positionMsForTarget(
      PlaybackSeekPlanner.targetForSeekTo(targetTime = -5.0, duration = 30.0),
      duration = 30.0
    )

    assertEquals(0L, targetMs)
  }

  @Test
  fun seekByAppliesOneClampedSeekFromSingleReadSeam() {
    val events = mutableListOf<String>()

    PlaybackSeekPlanner.applySeekBy(
      offset = 20.0,
      readCurrentTime = {
        events.add("current")
        90.0
      },
      readDuration = {
        events.add("duration")
        100.0
      },
      seekToPositionMs = {
        events.add("seek:$it")
      }
    )

    assertEquals(listOf("current", "duration", "seek:100000"), events)
  }

  @Test
  fun seekToAppliesOneClampedSeekFromSingleReadSeam() {
    val events = mutableListOf<String>()

    PlaybackSeekPlanner.applySeekTo(
      targetTime = 120.0,
      readDuration = {
        events.add("duration")
        100.0
      },
      seekToPositionMs = {
        events.add("seek:$it")
      }
    )

    assertEquals(listOf("duration", "seek:100000"), events)
  }
}
