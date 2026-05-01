"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  detectChurn,
  isSuppressed,
  buildBlockComment,
  CIRCUIT_BREAKER_MARKER,
} = require("../../src/paperclip/churn_detector");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGENT_A = "agent-aaa";
const AGENT_B = "agent-bbb";
const USER_ID = "user-zzz";
const NOW = new Date("2026-05-02T12:00:00Z").getTime();

function comment({ agentId = AGENT_A, userId = null, minutesAgo = 0, body = "" } = {}) {
  return {
    authorAgentId: agentId,
    authorUserId: userId,
    createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    body,
  };
}

// ---------------------------------------------------------------------------
// detectChurn — trigger path
// ---------------------------------------------------------------------------

test("detectChurn: flags churn when assignee has >=3 comments in window and no acceptance delta", () => {
  const comments = [
    comment({ minutesAgo: 25 }),
    comment({ minutesAgo: 20 }),
    comment({ minutesAgo: 10 }),
  ];

  const result = detectChurn(comments, { assigneeAgentId: AGENT_A, nowMs: NOW });

  assert.equal(result.isChurning, true);
  assert.equal(result.agentCommentCount, 3);
  assert.equal(result.hasAcceptanceDelta, false);
});

test("detectChurn: does NOT flag when assignee has exactly threshold-1 comments", () => {
  const comments = [comment({ minutesAgo: 20 }), comment({ minutesAgo: 10 })];

  const result = detectChurn(comments, { assigneeAgentId: AGENT_A, nowMs: NOW });

  assert.equal(result.isChurning, false);
  assert.equal(result.agentCommentCount, 2);
});

test("detectChurn: does NOT flag when there is a board/user comment in the window", () => {
  const comments = [
    comment({ minutesAgo: 25 }),
    comment({ minutesAgo: 20 }),
    comment({ minutesAgo: 15 }),
    // User replies → acceptance delta
    comment({ agentId: null, userId: USER_ID, minutesAgo: 10 }),
  ];

  const result = detectChurn(comments, { assigneeAgentId: AGENT_A, nowMs: NOW });

  assert.equal(result.isChurning, false);
  assert.equal(result.hasAcceptanceDelta, true);
});

test("detectChurn: does NOT flag when a different agent comments in window", () => {
  const comments = [
    comment({ agentId: AGENT_A, minutesAgo: 25 }),
    comment({ agentId: AGENT_A, minutesAgo: 20 }),
    comment({ agentId: AGENT_A, minutesAgo: 15 }),
    comment({ agentId: AGENT_B, minutesAgo: 5 }),
  ];

  const result = detectChurn(comments, { assigneeAgentId: AGENT_A, nowMs: NOW });

  assert.equal(result.isChurning, false);
  assert.equal(result.hasAcceptanceDelta, true);
});

test("detectChurn: ignores assignee comments outside the window", () => {
  const comments = [
    comment({ minutesAgo: 90 }), // outside 30-min window
    comment({ minutesAgo: 85 }),
    comment({ minutesAgo: 80 }),
    comment({ minutesAgo: 10 }), // only one inside window
  ];

  const result = detectChurn(comments, { assigneeAgentId: AGENT_A, nowMs: NOW });

  assert.equal(result.isChurning, false);
  assert.equal(result.agentCommentCount, 1);
});

test("detectChurn: respects custom threshold", () => {
  const comments = [comment({ minutesAgo: 10 }), comment({ minutesAgo: 5 })];

  const result = detectChurn(comments, { assigneeAgentId: AGENT_A, threshold: 2, nowMs: NOW });

  assert.equal(result.isChurning, true);
  assert.equal(result.threshold, 2);
});

test("detectChurn: throws when assigneeAgentId is missing", () => {
  assert.throws(() => detectChurn([], {}), /assigneeAgentId is required/);
});

// ---------------------------------------------------------------------------
// isSuppressed — suppression path
// ---------------------------------------------------------------------------

const blockedIssue = { status: "blocked", assigneeAgentId: AGENT_A };
const activeIssue = { status: "in_progress", assigneeAgentId: AGENT_A };

test("isSuppressed: returns true when issue is blocked by circuit-breaker and no new input", () => {
  const cbComment = comment({
    minutesAgo: 5,
    body: `${CIRCUIT_BREAKER_MARKER} Churn circuit-breaker triggered.\n\n**Unblock owner:** CTO`,
  });

  const comments = [comment({ minutesAgo: 20 }), comment({ minutesAgo: 15 }), cbComment];

  assert.equal(isSuppressed(blockedIssue, comments), true);
});

test("isSuppressed: returns false when a user comment arrives after the circuit-breaker block", () => {
  const cbComment = comment({
    minutesAgo: 10,
    body: `${CIRCUIT_BREAKER_MARKER} triggered.`,
  });
  const userInput = comment({ agentId: null, userId: USER_ID, minutesAgo: 3 });

  const comments = [cbComment, userInput];

  assert.equal(isSuppressed(blockedIssue, comments), false);
});

test("isSuppressed: returns false when a different agent comments after block", () => {
  const cbComment = comment({
    minutesAgo: 10,
    body: `${CIRCUIT_BREAKER_MARKER} triggered.`,
  });
  const boardAgent = comment({ agentId: AGENT_B, minutesAgo: 2 });

  const comments = [cbComment, boardAgent];

  assert.equal(isSuppressed(blockedIssue, comments), false);
});

test("isSuppressed: returns false when issue is not blocked", () => {
  const cbComment = comment({
    minutesAgo: 10,
    body: `${CIRCUIT_BREAKER_MARKER} triggered.`,
  });

  assert.equal(isSuppressed(activeIssue, [cbComment]), false);
});

test("isSuppressed: returns false when no circuit-breaker comment exists", () => {
  const comments = [comment({ minutesAgo: 10, body: "Normal comment" })];
  assert.equal(isSuppressed(blockedIssue, comments), false);
});

// ---------------------------------------------------------------------------
// buildBlockComment
// ---------------------------------------------------------------------------

test("buildBlockComment: contains the circuit-breaker marker", () => {
  const body = buildBlockComment({ agentCommentCount: 4, windowMs: 30 * 60_000 });
  assert.ok(body.includes(CIRCUIT_BREAKER_MARKER));
});

test("buildBlockComment: includes agent comment count and window", () => {
  const body = buildBlockComment({ agentCommentCount: 5, windowMs: 30 * 60_000 });
  assert.ok(body.includes("5 assignee comments in 30 min"));
});

test("buildBlockComment: includes unblock owner", () => {
  const body = buildBlockComment({
    agentCommentCount: 3,
    windowMs: 30 * 60_000,
    managerName: "CTO",
  });
  assert.ok(body.includes("CTO"));
});

test("buildBlockComment: defaults manager to Board/CTO when not provided", () => {
  const body = buildBlockComment({ agentCommentCount: 3, windowMs: 30 * 60_000 });
  assert.ok(body.includes("Board/CTO"));
});
