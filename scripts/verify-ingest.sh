#!/usr/bin/env bash
# End-to-end verification of the ingest API (session → threads → agents → events).
# Run after `npm run serve` (or `npm run dev:live`) — defaults to PORT=5284.
#
# Usage:  bash scripts/verify-ingest.sh [BASE_URL]
#         BASE_URL defaults to http://localhost:5284

set -euo pipefail
BASE="${1:-http://localhost:5284}"

echo "→ Health check: $BASE/api/health"
curl -sf "$BASE/api/health" | jq .
echo

SID="verify-$(date +%s)"

echo "→ Create session $SID (slash-command mission)"
curl -sf -X POST "$BASE/api/sessions" \
  -H 'content-type: application/json' \
  -d "{
    \"sessionId\":\"$SID\",
    \"missionKind\":\"linear\",
    \"missionTitle\":\"/verify-ingest\",
    \"channelId\":\"C0VERIFY\",
    \"metadata\":{\"slashCommand\":\"/verify-ingest\"}
  }" | jq .
echo

# ---------------- Thread #1 ----------------
echo "→ Create thread req-1 under session"
curl -sf -X POST "$BASE/api/sessions/$SID/threads" \
  -H 'content-type: application/json' \
  -d '{"threadId":"req-1","requestPreview":"investigate flaky test in auth/login_spec.ts"}' | jq .
echo

echo "→ Register orchestrator on req-1"
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/agents" \
  -H 'content-type: application/json' \
  -d '{
    "agentId":"orch-1",
    "role":"orchestrator",
    "agentType":"pi-harness/main-loop",
    "model":"anthropic/claude-opus-4-7",
    "systemPrompt":"You orchestrate sub-tasks for the verify run.",
    "tools":["Read","Bash","Edit","Grep"],
    "skills":["debug","review"]
  }' | jq .
echo

echo "→ Register subagent on req-1"
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/agents" \
  -H 'content-type: application/json' \
  -d '{
    "agentId":"explorer-1",
    "role":"subagent",
    "agentType":"Explore",
    "model":"anthropic/claude-haiku-4-5-20251001",
    "parentAgentId":"orch-1",
    "systemPrompt":"Search the repo for relevant files.",
    "tools":["Read","Glob","Grep"]
  }' | jq .
echo

echo "→ Tool / skill events on req-1"
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/agents/orch-1/tool-calls" \
  -H 'content-type: application/json' \
  -d '{"tool":"Read","input":"/etc/hosts","status":"ok","durationMs":12}' | jq .
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/agents/explorer-1/tool-calls" \
  -H 'content-type: application/json' \
  -d '{"tool":"Grep","input":"pattern=TODO","status":"ok","durationMs":86}' | jq .
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/agents/orch-1/skill-invocations" \
  -H 'content-type: application/json' \
  -d '{"skill":"review","args":"PR #1234","status":"ok","durationMs":1400}' | jq .
echo

echo "→ Complete subagent + thread req-1"
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/agents/explorer-1/complete" \
  -H 'content-type: application/json' \
  -d '{"exitCode":0,"tokens":{"totalTokens":4200,"cost":0.04}}' | jq .
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-1/complete" \
  -H 'content-type: application/json' \
  -d '{"tokens":{"totalTokens":18900,"cost":0.31}}' | jq .
echo

# ---------------- Thread #2 ----------------
echo "→ Create thread req-2 (second user request in same session)"
curl -sf -X POST "$BASE/api/sessions/$SID/threads" \
  -H 'content-type: application/json' \
  -d '{"threadId":"req-2","requestPreview":"now fix the bug you found"}' | jq .

echo "→ Register orchestrator on req-2"
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-2/agents" \
  -H 'content-type: application/json' \
  -d '{
    "agentId":"orch-2",
    "role":"orchestrator",
    "agentType":"pi-harness/main-loop",
    "model":"anthropic/claude-opus-4-7",
    "tools":["Read","Edit","Bash"]
  }' | jq .

echo "→ Tool call on req-2"
curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-2/agents/orch-2/tool-calls" \
  -H 'content-type: application/json' \
  -d '{"tool":"Edit","input":"auth/login_spec.ts","status":"ok","durationMs":34}' | jq .

curl -sf -X POST "$BASE/api/sessions/$SID/threads/req-2/complete" \
  -H 'content-type: application/json' \
  -d '{"tokens":{"totalTokens":7200,"cost":0.11}}' | jq .

echo "→ Complete session"
curl -sf -X POST "$BASE/api/sessions/$SID/complete" \
  -H 'content-type: application/json' \
  -d '{"tokens":{"totalTokens":26100,"cost":0.42}}' | jq .
echo

echo "→ GET /api/data — expect 1 mission with 2 threads"
curl -sf "$BASE/api/data" | jq '{
  source,
  missions: [.missions[] | {id, kind, title, threadCount, threadKeys}],
  threads: [.threads[] | {
    channelId,
    threadTs,
    missionId,
    requestPreview,
    agentType,
    systemPromptPreview: (.systemPrompt // "" | .[0:60]),
    toolsAvailable: .availableTools,
    skillsAvailable: .availableSkills,
    toolEvents: (.toolEvents // [] | length),
    skillEvents: (.skillEvents // [] | length),
    subagents: [.subagents[] | {
      agent,
      model,
      exitCode,
      toolsAvailable: .availableTools,
      toolEvents: (.toolEvents // [] | length)
    }]
  }]
}'
echo

echo "✅ Verification complete."
echo "   Session ID: $SID"
echo "   Cleanup:   curl -X DELETE $BASE/api/sessions/$SID"
