@testable import NitroPlayFeedCore
import XCTest

final class FeedRingWindowPlannerTests: XCTestCase {
  func testComputesThreeSlotWindowWithNativeModulo() {
    let planner = FeedRingWindowPlanner()

    XCTAssertTrue(
      planner.replaceCatalog(
        FeedRingCatalogState(
          revision: 1,
          entries: [
            entry(-1, "previous"),
            entry(0, "current"),
            entry(1, "next")
          ]
        )
      )
    )
    XCTAssertTrue(
      planner.commitViewport(
        FeedRingViewportState(
          revision: 1,
          centerIndex: 0,
          playbackAllowed: true,
          muted: false
        )
      )
    )

    let slots = planner.plannedSlots()

    XCTAssertEqual(slots.map(\.slotId), [2, 0, 1])
    XCTAssertEqual(slots.map(\.assignedIndex), [-1, 0, 1])
    XCTAssertEqual(slots.map(\.shouldPlay), [false, true, false])
    XCTAssertEqual(slots.map { $0.entry?.momentId }, ["previous", "current", "next"])
  }

  func testRejectsStaleCatalogAndViewportRevisionsIndependently() {
    let planner = FeedRingWindowPlanner()

    XCTAssertTrue(planner.replaceCatalog(FeedRingCatalogState(revision: 4, entries: [entry(10, "a")])))
    XCTAssertFalse(planner.replaceCatalog(FeedRingCatalogState(revision: 4, entries: [entry(10, "stale")])))
    XCTAssertTrue(planner.commitViewport(FeedRingViewportState(revision: 7, centerIndex: 10, playbackAllowed: true, muted: false)))
    XCTAssertFalse(planner.commitViewport(FeedRingViewportState(revision: 7, centerIndex: 11, playbackAllowed: true, muted: true)))

    let snapshot = planner.snapshot()

    XCTAssertEqual(snapshot.catalogRevision, 4)
    XCTAssertEqual(snapshot.viewportRevision, 7)
    XCTAssertEqual(snapshot.centerIndex, 10)
    XCTAssertFalse(snapshot.muted)
    XCTAssertEqual(planner.plannedSlots()[1].entry?.momentId, "a")
  }

  func testRejectsOlderViewportAfterNewerCommit() {
    let planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision: 1, entries: [entry(20, "twenty"), entry(30, "thirty")]))

    XCTAssertTrue(planner.commitViewport(FeedRingViewportState(revision: 3, centerIndex: 30, playbackAllowed: true, muted: false)))
    XCTAssertFalse(planner.commitViewport(FeedRingViewportState(revision: 2, centerIndex: 20, playbackAllowed: false, muted: true)))

    let snapshot = planner.snapshot()
    XCTAssertEqual(snapshot.viewportRevision, 3)
    XCTAssertEqual(snapshot.centerIndex, 30)
    XCTAssertTrue(snapshot.playbackAllowed)
    XCTAssertFalse(snapshot.muted)
    XCTAssertEqual(planner.plannedSlots()[1].entry?.momentId, "thirty")
  }

  func testUpdatesExistingViewportWhenCatalogChanges() {
    let planner = FeedRingWindowPlanner()

    planner.commitViewport(FeedRingViewportState(revision: 1, centerIndex: 5, playbackAllowed: true, muted: false))
    planner.replaceCatalog(FeedRingCatalogState(revision: 1, entries: [entry(5, "first")]))
    XCTAssertEqual(planner.plannedSlots()[1].entry?.momentId, "first")

    planner.replaceCatalog(FeedRingCatalogState(revision: 2, entries: [entry(5, "second")]))

    XCTAssertEqual(planner.plannedSlots()[1].entry?.momentId, "second")
  }

  func testCatalogReplacementUsesLastEntryForDuplicateIndex() {
    let planner = FeedRingWindowPlanner()

    planner.commitViewport(FeedRingViewportState(revision: 1, centerIndex: 8, playbackAllowed: true, muted: false))
    planner.replaceCatalog(FeedRingCatalogState(revision: 1, entries: [entry(8, "first"), entry(8, "second")]))

    XCTAssertEqual(planner.plannedSlots()[1].entry?.momentId, "second")
    XCTAssertEqual(planner.snapshot().catalogSize, 1)
  }

  func testReturnsEmptyWindowUntilViewportExists() {
    let planner = FeedRingWindowPlanner()

    planner.replaceCatalog(FeedRingCatalogState(revision: 1, entries: [entry(1, "one")]))

    XCTAssertTrue(planner.plannedSlots().isEmpty)
    XCTAssertNil(planner.snapshot().centerIndex)
  }

  func testPlaybackAllowedControlsOnlyCenterSlotIntent() {
    let planner = FeedRingWindowPlanner()
    planner.replaceCatalog(FeedRingCatalogState(revision: 1, entries: [entry(1, "one"), entry(2, "two"), entry(3, "three")]))

    planner.commitViewport(FeedRingViewportState(revision: 1, centerIndex: 2, playbackAllowed: false, muted: true))
    XCTAssertEqual(planner.plannedSlots().map(\.shouldPlay), [false, false, false])
    XCTAssertTrue(planner.snapshot().muted)

    planner.commitViewport(FeedRingViewportState(revision: 2, centerIndex: 2, playbackAllowed: true, muted: true))
    XCTAssertEqual(planner.plannedSlots().map(\.shouldPlay), [false, true, false])
  }

  private func entry(_ index: Int, _ momentId: String) -> FeedRingCatalogEntry {
    FeedRingCatalogEntry(
      index: index,
      momentId: momentId,
      sourceKey: "source-\(momentId)",
      hasSource: true
    )
  }
}
