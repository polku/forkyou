#!/usr/bin/env node
"use strict";

/**
 * Churn circuit-breaker automation for Paperclip issues.
 *
 * Scans all in-progress issues assigned to the current agent and, for any
 * that show churn (>=3 assignee comments in 30 min with no acceptance delta),
 * transitions them to `blocked` with structured unblock metadata.
 *
 * Usage (manual / from a Paperclip routine heartbeat):
 *   node scripts/churn-circuit-breaker.js [--issue-id <id>]
 *
 * Env vars required:
 *   PAPERCLIP_API_KEY, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID,
 *   PAPERCLIP_RUN_ID, PAPERCLIP_API_URL (overridden to localhost below).
 */

const { detectChurn, isSuppressed, buildBlockComment } = require("../src/paperclip/churn_detector");

const API_BASE = "http://127.0.0.1:3100";
const {
  PAPERCLIP_API_KEY: API_KEY,
  PAPERCLIP_AGENT_ID: AGENT_ID,
  PAPERCLIP_COMPANY_ID: COMPANY_ID,
  PAPERCLIP_RUN_ID: RUN_ID,
} = process.env;

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...(RUN_ID ? { "X-Paperclip-Run-Id": RUN_ID } : {}),
  };
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`GET ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`PATCH ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function getComments(issueId) {
  const data = await apiGet(`/api/issues/${issueId}/comments`);
  return Array.isArray(data) ? data : data.comments ?? [];
}

async function getManagerName() {
  try {
    const me = await apiGet("/api/agents/me");
    const chain = me.chainOfCommand ?? [];
    return chain[0]?.name ?? "Board/CTO";
  } catch {
    return "Board/CTO";
  }
}

async function triggerCircuitBreaker(issue, comments, managerName) {
  const { agentCommentCount, windowMs } = detectChurn(comments, {
    assigneeAgentId: issue.assigneeAgentId,
  });

  const comment = buildBlockComment({ agentCommentCount, windowMs, managerName });

  await apiPatch(`/api/issues/${issue.id}`, {
    status: "blocked",
    comment,
  });

  console.log(`[circuit-breaker] Blocked ${issue.identifier} — ${agentCommentCount} comments in 30 min.`);
}

async function scanIssue(issue, managerName) {
  const comments = await getComments(issue.id);

  // If already suppressed by a previous circuit-breaker trigger, stay silent.
  if (isSuppressed(issue, comments)) {
    console.log(`[circuit-breaker] ${issue.identifier} is already suppressed — no action.`);
    return;
  }

  const result = detectChurn(comments, { assigneeAgentId: issue.assigneeAgentId });

  if (result.isChurning) {
    await triggerCircuitBreaker(issue, comments, managerName);
  } else {
    console.log(
      `[circuit-breaker] ${issue.identifier} OK — ${result.agentCommentCount}/${result.threshold} comments, acceptanceDelta=${result.hasAcceptanceDelta}.`,
    );
  }
}

async function main() {
  if (!API_KEY || !AGENT_ID || !COMPANY_ID) {
    console.error("Missing required env vars: PAPERCLIP_API_KEY, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const singleIssueIdx = args.indexOf("--issue-id");
  const singleIssueId = singleIssueIdx !== -1 ? args[singleIssueIdx + 1] : null;

  const managerName = await getManagerName();

  if (singleIssueId) {
    const issue = await apiGet(`/api/issues/${singleIssueId}`);
    await scanIssue(issue, managerName);
    return;
  }

  // Scan all in-progress issues assigned to this agent.
  const issues = await apiGet(
    `/api/companies/${COMPANY_ID}/issues?assigneeAgentId=${AGENT_ID}&status=in_progress`,
  );

  const list = Array.isArray(issues) ? issues : issues.issues ?? [];
  console.log(`[circuit-breaker] Scanning ${list.length} in-progress issue(s)…`);

  for (const issue of list) {
    await scanIssue(issue, managerName);
  }
}

main().catch((err) => {
  console.error("[circuit-breaker] Fatal error:", err.message);
  process.exit(1);
});
