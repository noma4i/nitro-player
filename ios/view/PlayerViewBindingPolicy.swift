import Foundation

struct PlayerViewAttachmentDecision {
  let detachReportedPlayer: Bool
  let attachCurrentPlayer: Bool
  let notifyDelegateAttached: Bool
  let notifyDelegateDetached: Bool
}

struct PlayerViewAttachmentState<ID: Equatable> {
  let reportedPlayerId: ID?
  let delegateAttached: Bool
}

struct PlayerViewAttachmentTransition<ID: Equatable> {
  let decision: PlayerViewAttachmentDecision
  let nextState: PlayerViewAttachmentState<ID>
}

enum PlayerViewBindingPolicy {
  static func attachmentTransition<ID: Equatable>(
    state: PlayerViewAttachmentState<ID>,
    currentPlayerId: ID?,
    viewAttached: Bool
  ) -> PlayerViewAttachmentTransition<ID> {
    let nextAttached = currentPlayerId != nil && viewAttached
    let reportedPlayerPresent = state.reportedPlayerId != nil
    let reportedPlayerMatchesCurrent = state.reportedPlayerId == currentPlayerId

    let decision = PlayerViewAttachmentDecision(
      detachReportedPlayer: reportedPlayerPresent && (!nextAttached || !reportedPlayerMatchesCurrent),
      attachCurrentPlayer: nextAttached && (!reportedPlayerPresent || !reportedPlayerMatchesCurrent),
      notifyDelegateAttached: !state.delegateAttached && nextAttached,
      notifyDelegateDetached: state.delegateAttached && !nextAttached
    )

    let nextState = PlayerViewAttachmentState<ID>(
      reportedPlayerId: nextAttached ? currentPlayerId : nil,
      delegateAttached: nextAttached
    )

    return PlayerViewAttachmentTransition(
      decision: decision,
      nextState: nextState
    )
  }

  static func shouldCommitConfiguration<ID: Equatable>(
    scheduledGeneration: UInt,
    currentGeneration: UInt,
    scheduledPlayerId: ID,
    pendingPlayerId: ID?,
    isReadyForAttachment: Bool
  ) -> Bool {
    guard scheduledGeneration == currentGeneration else {
      return false
    }

    guard scheduledPlayerId == pendingPlayerId else {
      return false
    }

    return isReadyForAttachment
  }

  static func shouldExecuteDeferredTeardown(
    tokenIsCurrent: Bool,
    hasSuperview: Bool,
    samePlayerIdentity: Bool,
    sameControllerIdentity: Bool
  ) -> Bool {
    return tokenIsCurrent && !hasSuperview && samePlayerIdentity && sameControllerIdentity
  }

  static func shouldRunCoalescedAttachmentRefresh(tokenIsCurrent: Bool) -> Bool {
    return tokenIsCurrent
  }

  static func shouldCancelPendingTeardownOnReattach(isAttachedAfterTransition: Bool) -> Bool {
    return isAttachedAfterTransition
  }
}
