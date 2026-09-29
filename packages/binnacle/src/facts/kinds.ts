/**
 * The kinds table: every kind of event dsh knows, and how binnacle treats it.
 *
 * The census of `dsh:packages/core/session/src/known-event-types.ts#KNOWN_SESSION_EVENT_TYPES`,
 * restated so a pin that adds a kind fails a test naming it rather than
 * slipping unannounced onto the screen. What is quiet is what dsh web's Chat
 * shows no row for (`dsh:packages/client/ui-chat/src/client/contract/chat-visibility.ts#isVisibleChatNode`):
 * the session's machinery, whose home is a screen of its own. What is unread
 * has a row there that no binnacle feature draws yet, so it is left to the
 * fallback on purpose, until a feature draws it. A kind Chat shows no row
 * for can still be read, when a feature draws what a person must see of it:
 * `approval/asked` and `approval/decided` are dsh's audit pair
 * (`dsh:packages/interaction/user-approval/src/index.ts#ApprovalService`),
 * and the transcript draws what an approval asked and what was decided of
 * it, paired as a call and its result are.
 */

/**
 * How binnacle treats one kind of event dsh knows.
 *
 * - `read`: binnacle's adapter reads it into a fact the transcript draws.
 * - `quiet`: the transcript draws it as nothing; an author's view registered
 *   for the kind draws it again.
 * - `unread`: no adapter reads it, so the fallback draws it until a feature does.
 */
export type Treatment = 'read' | 'quiet' | 'unread'

/**
 * Every kind of event dsh knows, and how binnacle treats it. A kind named
 * `read` is read by the adapter for it in `adapt.ts`; a kind named `quiet`
 * becomes a quiet fact there; a kind named `unread` becomes an `unknown` one.
 */
export const kinds: Readonly<Record<string, Treatment>> = {
  'agent-preset/selected': 'quiet',
  'agent/inbox/spliced': 'quiet',
  'approval/asked': 'read',
  'approval/decided': 'read',
  'approval/policy': 'quiet',
  'assistant/attempt': 'quiet',
  'assistant/message': 'read',
  'command/done': 'unread',
  'command/run': 'unread',
  'compaction/end': 'unread',
  'compaction/prune': 'quiet',
  'compaction/start': 'unread',
  'compaction/summary': 'unread',
  'deliverables/presented': 'unread',
  'developer/message': 'read',
  'feedback/message-delete': 'quiet',
  'feedback/message-put': 'quiet',
  'feedback/record': 'quiet',
  'goal/change': 'quiet',
  'hook/invoked': 'quiet',
  'hook/result': 'quiet',
  'image/offload': 'quiet',
  'llm/retry': 'unread',
  'llm/retry-started': 'unread',
  'model/selection': 'quiet',
  'permission/preset': 'quiet',
  'plan/mode': 'quiet',
  'request/context': 'quiet',
  'request/header': 'quiet',
  'sandbox/mode': 'quiet',
  'schedule/change': 'quiet',
  'session-log-deepseek/delivery-accepted': 'quiet',
  'session/end-seed': 'quiet',
  'session/title': 'quiet',
  'session/title-llm-request': 'quiet',
  'step/end': 'read',
  'step/start': 'read',
  'subagent/catalog': 'quiet',
  'subagent/descriptor': 'quiet',
  'subagent/model-selection-policy': 'quiet',
  'system/message': 'quiet',
  'team/member': 'quiet',
  'team/message/delivered': 'quiet',
  'team/message/queued': 'quiet',
  'team/task': 'quiet',
  'todo/write': 'quiet',
  'tool-workflow/agent-end': 'unread',
  'tool-workflow/agent-start': 'unread',
  'tool-workflow/run-end': 'unread',
  'tool-workflow/run-start': 'unread',
  'tool/call': 'read',
  'tool/ptc-dispatch': 'unread',
  'tool/ptc-dispatch-start': 'unread',
  'tool/result': 'read',
  'turn/end': 'read',
  'turn/start': 'read',
  'user/message': 'read',
  'web/deepseek-search-llm-request': 'quiet',
  'workspace/changes': 'unread',
}
