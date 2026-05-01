"use strict";

const WINDOW_MS = 30 * 60 * 1000;
const THRESHOLD = 3;

// Marker embedded in circuit-breaker block comments for later suppression checks.
const CIRCUIT_BREAKER_MARKER = "[circuit-breaker]";

/**
 * Inspect a comment list and decide whether the assignee is churning.
 *
 * Acceptance delta is defined as any comment within the window authored by
 * someone other than the assignee agent (board member, user, or a different
 * agent). That captures the "new board/user decision or review input" intent
 * without requiring fragile keyword parsing.
 *
 * @param {object[]} comments       Array of Paperclip comment objects.
 * @param {object}   opts
 * @param {string}   opts.assigneeAgentId   Required — agent id of the issue assignee.
 * @param {number}   [opts.windowMs]        Detection window in ms (default 30 min).
 * @param {number}   [opts.threshold]       Min assignee comments to trigger (default 3).
 * @param {number}   [opts.nowMs]           Override for "now" (useful in tests).
 * @returns {{ isChurning, agentCommentCount, hasAcceptanceDelta, threshold, windowMs }}
 */
function detectChurn(comments, { assigneeAgentId, windowMs = WINDOW_MS, threshold = THRESHOLD, nowMs } = {}) {
  if (!assigneeAgentId) throw new Error("assigneeAgentId is required");

  const now = nowMs !== undefined ? nowMs : Date.now();
  const cutoff = now - windowMs;

  const recentAssigneeComments = comments.filter(
    (c) =>
      c.authorAgentId === assigneeAgentId &&
      new Date(c.createdAt).getTime() >= cutoff,
  );

  // Any non-assignee activity in the window counts as acceptance delta.
  const hasAcceptanceDelta = comments.some(
    (c) =>
      new Date(c.createdAt).getTime() >= cutoff &&
      (c.authorUserId != null ||
        (c.authorAgentId != null && c.authorAgentId !== assigneeAgentId)),
  );

  return {
    isChurning: recentAssigneeComments.length >= threshold && !hasAcceptanceDelta,
    agentCommentCount: recentAssigneeComments.length,
    hasAcceptanceDelta,
    threshold,
    windowMs,
  };
}

/**
 * Return true if the issue was blocked by the circuit-breaker and no new
 * board/user input has arrived since the triggering comment.
 *
 * Used by agent heartbeats to suppress follow-up comments before posting.
 *
 * @param {object}   issue    Paperclip issue object (needs .status, .assigneeAgentId).
 * @param {object[]} comments Full comment list for the issue (ascending order expected).
 * @returns {boolean}
 */
function isSuppressed(issue, comments) {
  if (issue.status !== "blocked") return false;

  // Find the most recent circuit-breaker block comment.
  const cbComment = [...comments]
    .reverse()
    .find((c) => (c.body || "").includes(CIRCUIT_BREAKER_MARKER));

  if (!cbComment) return false;

  const cbTime = new Date(cbComment.createdAt).getTime();

  // Suppression lifts as soon as any non-assignee comment appears after the block.
  const hasNewInput = comments.some(
    (c) =>
      new Date(c.createdAt).getTime() > cbTime &&
      (c.authorUserId != null ||
        (c.authorAgentId != null && c.authorAgentId !== issue.assigneeAgentId)),
  );

  return !hasNewInput;
}

/**
 * Build the structured comment body for a circuit-breaker block event.
 *
 * @param {object} opts
 * @param {number} opts.agentCommentCount  Number of recent assignee comments.
 * @param {number} opts.windowMs           Detection window in ms.
 * @param {string} [opts.managerName]      Display name of unblock owner (default "Board/CTO").
 * @returns {string}
 */
function buildBlockComment({ agentCommentCount, windowMs, managerName = "Board/CTO" }) {
  const windowMin = Math.round(windowMs / 60_000);
  return [
    `${CIRCUIT_BREAKER_MARKER} Churn circuit-breaker triggered.`,
    "",
    `**Detection:** ${agentCommentCount} assignee comments in ${windowMin} min with no board/user acceptance delta.`,
    "",
    `**Unblock owner:** ${managerName}`,
    "**Unblock action:** Provide a new decision, acceptance evidence, or explicit direction on this issue.",
    "**Wake condition:** New non-assignee comment posted on this issue.",
    "",
    "Assignee comments are suppressed until the unblock condition is met.",
  ].join("\n");
}

module.exports = { detectChurn, isSuppressed, buildBlockComment, CIRCUIT_BREAKER_MARKER };
