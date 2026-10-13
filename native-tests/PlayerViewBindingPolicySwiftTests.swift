import Foundation

@main
struct PlayerViewBindingPolicySwiftTests {
  static func verify(
    _ name: String,
    transition actual: PlayerViewAttachmentTransition<String>,
    expectedDecision decision: PlayerViewAttachmentDecision,
    expectedState state: PlayerViewAttachmentState<String>
  ) -> Bool {
    guard actual.decision.detachReportedPlayer == decision.detachReportedPlayer else {
      print(
        "FAIL \(name): decision.detachReportedPlayer expected \(decision.detachReportedPlayer), got \(actual.decision.detachReportedPlayer)"
      )
      return false
    }

    guard actual.decision.attachCurrentPlayer == decision.attachCurrentPlayer else {
      print(
        "FAIL \(name): decision.attachCurrentPlayer expected \(decision.attachCurrentPlayer), got \(actual.decision.attachCurrentPlayer)"
      )
      return false
    }

    guard actual.decision.notifyDelegateAttached == decision.notifyDelegateAttached else {
      print(
        "FAIL \(name): decision.notifyDelegateAttached expected \(decision.notifyDelegateAttached), got \(actual.decision.notifyDelegateAttached)"
      )
      return false
    }

    guard actual.decision.notifyDelegateDetached == decision.notifyDelegateDetached else {
      print(
        "FAIL \(name): decision.notifyDelegateDetached expected \(decision.notifyDelegateDetached), got \(actual.decision.notifyDelegateDetached)"
      )
      return false
    }

    guard actual.nextState.reportedPlayerId == state.reportedPlayerId else {
      print(
        "FAIL \(name): state.reportedPlayerId expected \(String(describing: state.reportedPlayerId)), got \(String(describing: actual.nextState.reportedPlayerId))"
      )
      return false
    }

    guard actual.nextState.delegateAttached == state.delegateAttached else {
      print(
        "FAIL \(name): state.delegateAttached expected \(state.delegateAttached), got \(actual.nextState.delegateAttached)"
      )
      return false
    }

    print("PASS \(name)")
    return true
  }

  static func verify(_ name: String, actual: Bool, expected: Bool) -> Bool {
    guard actual == expected else {
      print("FAIL \(name): expected \(expected), got \(actual)")
      return false
    }

    print("PASS \(name)")
    return true
  }

  static func main() {
    var passed = true

    passed = verify(
      "initial attach",
      transition: PlayerViewBindingPolicy.attachmentTransition(
        state: PlayerViewAttachmentState(reportedPlayerId: nil, delegateAttached: false),
        currentPlayerId: "a",
        viewAttached: true
      ),
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: false,
        attachCurrentPlayer: true,
        notifyDelegateAttached: true,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true)
    ) && passed

    passed = verify(
      "same player refresh",
      transition: PlayerViewBindingPolicy.attachmentTransition(
        state: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true),
        currentPlayerId: "a",
        viewAttached: true
      ),
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: false,
        attachCurrentPlayer: false,
        notifyDelegateAttached: false,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true)
    ) && passed

    passed = verify(
      "attached player swap",
      transition: PlayerViewBindingPolicy.attachmentTransition(
        state: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true),
        currentPlayerId: "b",
        viewAttached: true
      ),
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: true,
        attachCurrentPlayer: true,
        notifyDelegateAttached: false,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "b", delegateAttached: true)
    ) && passed

    passed = verify(
      "clearing player while mounted",
      transition: PlayerViewBindingPolicy.attachmentTransition(
        state: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true),
        currentPlayerId: nil,
        viewAttached: true
      ),
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: true,
        attachCurrentPlayer: false,
        notifyDelegateAttached: false,
        notifyDelegateDetached: true
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: nil, delegateAttached: false)
    ) && passed

    passed = verify(
      "view detach with current player",
      transition: PlayerViewBindingPolicy.attachmentTransition(
        state: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true),
        currentPlayerId: "a",
        viewAttached: false
      ),
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: true,
        attachCurrentPlayer: false,
        notifyDelegateAttached: false,
        notifyDelegateDetached: true
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: nil, delegateAttached: false)
    ) && passed

    passed = verify(
      "view reattach",
      transition: PlayerViewBindingPolicy.attachmentTransition(
        state: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: false),
        currentPlayerId: "a",
        viewAttached: true
      ),
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: false,
        attachCurrentPlayer: false,
        notifyDelegateAttached: true,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "a", delegateAttached: true)
    ) && passed

    var state = PlayerViewAttachmentState<String>(reportedPlayerId: nil, delegateAttached: false)

    var transition = PlayerViewBindingPolicy.attachmentTransition(
      state: state,
      currentPlayerId: "A",
      viewAttached: true
    )
    passed = verify(
      "stateful sequence: attach A",
      transition: transition,
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: false,
        attachCurrentPlayer: true,
        notifyDelegateAttached: true,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "A", delegateAttached: true)
    ) && passed
    state = transition.nextState

    transition = PlayerViewBindingPolicy.attachmentTransition(
      state: state,
      currentPlayerId: "A",
      viewAttached: true
    )
    passed = verify(
      "stateful sequence: same-player refresh A",
      transition: transition,
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: false,
        attachCurrentPlayer: false,
        notifyDelegateAttached: false,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "A", delegateAttached: true)
    ) && passed
    state = transition.nextState

    transition = PlayerViewBindingPolicy.attachmentTransition(
      state: state,
      currentPlayerId: "B",
      viewAttached: true
    )
    passed = verify(
      "stateful sequence: swap A -> B",
      transition: transition,
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: true,
        attachCurrentPlayer: true,
        notifyDelegateAttached: false,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "B", delegateAttached: true)
    ) && passed
    state = transition.nextState

    transition = PlayerViewBindingPolicy.attachmentTransition(
      state: state,
      currentPlayerId: "B",
      viewAttached: true
    )
    passed = verify(
      "stateful sequence: same-player refresh B",
      transition: transition,
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: false,
        attachCurrentPlayer: false,
        notifyDelegateAttached: false,
        notifyDelegateDetached: false
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: "B", delegateAttached: true)
    ) && passed
    state = transition.nextState

    transition = PlayerViewBindingPolicy.attachmentTransition(
      state: state,
      currentPlayerId: nil as String?,
      viewAttached: true
    )
    passed = verify(
      "stateful sequence: clear current player",
      transition: transition,
      expectedDecision: PlayerViewAttachmentDecision(
        detachReportedPlayer: true,
        attachCurrentPlayer: false,
        notifyDelegateAttached: false,
        notifyDelegateDetached: true
      ),
      expectedState: PlayerViewAttachmentState(reportedPlayerId: nil, delegateAttached: false)
    ) && passed
    state = transition.nextState

    if state.reportedPlayerId != nil || state.delegateAttached {
      print("FAIL stateful sequence: clear current player did not yield detached state")
      passed = false
    } else {
      print("PASS stateful sequence: clear current player yields detached state")
    }

    passed = verify(
      "exact configuration token commits",
      actual: PlayerViewBindingPolicy.shouldCommitConfiguration(
        scheduledGeneration: 7,
        currentGeneration: 7,
        scheduledPlayerId: "current",
        pendingPlayerId: "current",
        isReadyForAttachment: true
      ),
      expected: true
    ) && passed

    passed = verify(
      "stale generation rejects",
      actual: PlayerViewBindingPolicy.shouldCommitConfiguration(
        scheduledGeneration: 3,
        currentGeneration: 4,
        scheduledPlayerId: "pending",
        pendingPlayerId: "pending",
        isReadyForAttachment: true
      ),
      expected: false
    ) && passed

    passed = verify(
      "pending player identity mismatch rejects",
      actual: PlayerViewBindingPolicy.shouldCommitConfiguration(
        scheduledGeneration: 1,
        currentGeneration: 1,
        scheduledPlayerId: "scheduled",
        pendingPlayerId: "other",
        isReadyForAttachment: true
      ),
      expected: false
    ) && passed

    passed = verify(
      "detached/not-ready view rejects",
      actual: PlayerViewBindingPolicy.shouldCommitConfiguration(
        scheduledGeneration: 2,
        currentGeneration: 2,
        scheduledPlayerId: "pending",
        pendingPlayerId: "pending",
        isReadyForAttachment: false
      ),
      expected: false
    ) && passed

    passed = verify(
      "deferred teardown executes after real unmount",
      actual: PlayerViewBindingPolicy.shouldExecuteDeferredTeardown(
        tokenIsCurrent: true,
        hasSuperview: false,
        samePlayerIdentity: true,
        sameControllerIdentity: true
      ),
      expected: true
    ) && passed

    passed = verify(
      "deferred teardown skips cancelled reattach",
      actual: PlayerViewBindingPolicy.shouldExecuteDeferredTeardown(
        tokenIsCurrent: false,
        hasSuperview: false,
        samePlayerIdentity: true,
        sameControllerIdentity: true
      ),
      expected: false
    ) && passed

    passed = verify(
      "deferred teardown skips attached view",
      actual: PlayerViewBindingPolicy.shouldExecuteDeferredTeardown(
        tokenIsCurrent: true,
        hasSuperview: true,
        samePlayerIdentity: true,
        sameControllerIdentity: true
      ),
      expected: false
    ) && passed

    passed = verify(
      "deferred teardown skips player replacement",
      actual: PlayerViewBindingPolicy.shouldExecuteDeferredTeardown(
        tokenIsCurrent: true,
        hasSuperview: false,
        samePlayerIdentity: false,
        sameControllerIdentity: true
      ),
      expected: false
    ) && passed

    passed = verify(
      "deferred teardown skips controller replacement",
      actual: PlayerViewBindingPolicy.shouldExecuteDeferredTeardown(
        tokenIsCurrent: true,
        hasSuperview: false,
        samePlayerIdentity: true,
        sameControllerIdentity: false
      ),
      expected: false
    ) && passed

    passed = verify(
      "coalesced attachment refresh runs for current token",
      actual: PlayerViewBindingPolicy.shouldRunCoalescedAttachmentRefresh(tokenIsCurrent: true),
      expected: true
    ) && passed

    passed = verify(
      "coalesced attachment refresh skips superseded token",
      actual: PlayerViewBindingPolicy.shouldRunCoalescedAttachmentRefresh(tokenIsCurrent: false),
      expected: false
    ) && passed

    passed = verify(
      "genuine reattach cancels pending teardown",
      actual: PlayerViewBindingPolicy.shouldCancelPendingTeardownOnReattach(isAttachedAfterTransition: true),
      expected: true
    ) && passed

    passed = verify(
      "remove transition keeps pending teardown",
      actual: PlayerViewBindingPolicy.shouldCancelPendingTeardownOnReattach(isAttachedAfterTransition: false),
      expected: false
    ) && passed

    if !passed {
      exit(1)
    }
  }
}
