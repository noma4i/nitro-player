@testable import NitroPlayFeedCore
import XCTest

final class FeedRingCommandPlannerTests: XCTestCase {
  func testPlansReplaceReuseAndClearInWindowOrder() {
    let planner = FeedRingCommandPlanner()
    let commands = planner.plan(
      plannedSlots: [
        planned(slotId: 2, assignedIndex: -1, momentId: "previous", sourceKey: "source-previous", shouldPlay: false),
        planned(slotId: 0, assignedIndex: 0, momentId: "current", sourceKey: "source-current", shouldPlay: true),
        planned(slotId: 1, assignedIndex: 1, momentId: "next", sourceKey: nil, shouldPlay: false)
      ],
      slots: [
        slot(0, assignedIndex: 0, sourceKey: "source-current"),
        slot(1, assignedIndex: 4, sourceKey: "source-old"),
        slot(2, assignedIndex: -1, sourceKey: "source-stale")
      ]
    )

    XCTAssertEqual(commands.map(\.action), [.replace, .reuse, .clear])
    XCTAssertEqual(commands.map(\.slotId), [2, 0, 1])
    XCTAssertEqual(commands.map(\.assignedIndex), [-1, 0, 1])
    XCTAssertEqual(commands.map(\.sourceKey), ["source-previous", "source-current", nil])
    XCTAssertEqual(commands.map(\.shouldPlay), [false, true, false])
    XCTAssertEqual(commands[2].reason, "empty-source")
    XCTAssertTrue(commands[2].hadSource)
  }

  func testClearsMissingCenterAndOutsideSlotsAfterWindowCommands() {
    let planner = FeedRingCommandPlanner()

    let missingCenterCommands = planner.plan(
      plannedSlots: [],
      slots: [
        slot(0, assignedIndex: 0, sourceKey: "source-current"),
        slot(1, assignedIndex: nil, sourceKey: nil)
      ]
    )
    XCTAssertEqual(missingCenterCommands.map(\.reason), ["missing-center", "missing-center"])
    XCTAssertEqual(missingCenterCommands.map(\.hadSource), [true, false])

    let outsideCommands = planner.plan(
      plannedSlots: [
        planned(slotId: 0, assignedIndex: 10, momentId: "ten", sourceKey: "source-ten", shouldPlay: true)
      ],
      slots: [
        slot(0, assignedIndex: nil, sourceKey: nil),
        slot(1, assignedIndex: 4, sourceKey: "source-old")
      ]
    )

    XCTAssertEqual(outsideCommands.map(\.action), [.replace, .clear])
    XCTAssertEqual(outsideCommands.map(\.reason), [nil, "outside-window"])
    XCTAssertTrue(outsideCommands[1].hadSource)
  }

  func testRejectedReplaceWithClearedSourceKeyPlansReplaceAgain() {
    let planner = FeedRingCommandPlanner()
    let commands = planner.plan(
      plannedSlots: [
        planned(slotId: 0, assignedIndex: 0, momentId: "current", sourceKey: "source-current", shouldPlay: true)
      ],
      slots: [
        slot(0, assignedIndex: 0, sourceKey: nil)
      ]
    )

    XCTAssertEqual(commands.single?.action, .replace)
    XCTAssertEqual(commands.single?.sourceKey, "source-current")
  }

  func testHadSourceProbeUsesOnlyPriorSourceKey() {
    let planner = FeedRingCommandPlanner()
    let commands = planner.plan(
      plannedSlots: [
        planned(slotId: 0, assignedIndex: 0, momentId: "current", sourceKey: nil, shouldPlay: false)
      ],
      slots: [
        slot(0, assignedIndex: 0, sourceKey: nil)
      ]
    )

    XCTAssertEqual(commands.single?.action, .clear)
    XCTAssertFalse(commands.single?.hadSource ?? true)
  }

  private func planned(
    slotId: Int,
    assignedIndex: Int,
    momentId: String,
    sourceKey: String?,
    shouldPlay: Bool
  ) -> FeedRingPlannedSlot {
    FeedRingPlannedSlot(
      slotId: slotId,
      assignedIndex: assignedIndex,
      entry: FeedRingCatalogEntry(
        index: assignedIndex,
        momentId: momentId,
        sourceKey: sourceKey,
        hasSource: sourceKey != nil
      ),
      shouldPlay: shouldPlay
    )
  }

  private func slot(_ slotId: Int, assignedIndex: Int?, sourceKey: String?) -> FeedRingCommandSlotState {
    FeedRingCommandSlotState(slotId: slotId, assignedIndex: assignedIndex, momentId: nil, sourceKey: sourceKey)
  }
}

private extension Array {
  var single: Element? {
    count == 1 ? self[0] : nil
  }
}
