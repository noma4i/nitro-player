import XCTest

final class SourceCommandOrderingTests: XCTestCase {
  private struct SourceCommand {
    let generation: Int
    let source: String?
    let shouldAutoPlay: Bool
  }

  private final class Model {
    private var generation = 0
    var wantsToPlay: Bool
    private(set) var didPlay = false
    private(set) var committedSource: String?

    init(wantsToPlay: Bool) {
      self.wantsToPlay = wantsToPlay
    }

    func beginReplace(_ source: String) -> SourceCommand {
      generation += 1
      let command = SourceCommand(
        generation: generation,
        source: source,
        shouldAutoPlay: wantsToPlay
      )
      wantsToPlay = false
      return command
    }

    func beginClear() -> SourceCommand {
      generation += 1
      wantsToPlay = false
      return SourceCommand(
        generation: generation,
        source: nil,
        shouldAutoPlay: false
      )
    }

    func commit(_ command: SourceCommand, advanceDuringPrepare: Bool = false) {
      guard command.generation == generation else { return }

      if command.source == nil {
        committedSource = nil
        return
      }

      if advanceDuringPrepare {
        generation += 1
      }
      guard command.generation == generation else { return }

      committedSource = command.source
      if command.shouldAutoPlay {
        wantsToPlay = true
        didPlay = true
      }
    }
  }

  func testSwapWhilePlayingResumesNewSource() {
    let model = Model(wantsToPlay: true)
    model.commit(model.beginReplace("source-a"))

    XCTAssertEqual(model.committedSource, "source-a")
    XCTAssertTrue(model.didPlay)
    XCTAssertTrue(model.wantsToPlay)
  }

  func testNewerReplaceInvalidatesOlderCommit() {
    let model = Model(wantsToPlay: true)
    let older = model.beginReplace("source-a")
    let newer = model.beginReplace("source-b")

    model.commit(older)
    XCTAssertNil(model.committedSource)

    model.commit(newer)
    XCTAssertEqual(model.committedSource, "source-b")
  }

  func testClearInvalidatesOlderReplaceCommit() {
    let model = Model(wantsToPlay: true)
    let older = model.beginReplace("source-a")
    let clear = model.beginClear()

    model.commit(older)
    XCTAssertNil(model.committedSource)

    model.commit(clear)
    XCTAssertNil(model.committedSource)
    XCTAssertFalse(model.didPlay)
  }

  func testGenerationAdvanceDuringPrepareDropsCommit() {
    let model = Model(wantsToPlay: true)

    model.commit(model.beginReplace("source-a"), advanceDuringPrepare: true)

    XCTAssertNil(model.committedSource)
    XCTAssertFalse(model.didPlay)
  }
}
