#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_KEY="${KRAKEN_API_KEY:-test-api-key}"

AUTH_HEADER=( -H "Authorization: Bearer ${API_KEY}" )
JSON_HEADER=( -H "Content-Type: application/json" )

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

wait_for_health() {
  echo "[INFO] Waiting for API health at ${BASE_URL}/health"
  for _ in $(seq 1 90); do
    if curl -fsS "${BASE_URL}/health" >/tmp/kraken-health.json 2>/dev/null; then
      cat /tmp/kraken-health.json
      return 0
    fi
    sleep 2
  done
  fail "API did not become healthy in time"
}

expect_json_field() {
  local json="$1"
  local expr="$2"
  echo "$json" | python3 - "$expr" <<'PY'
import json, sys
expr = sys.argv[1]
data = json.load(sys.stdin)
value = eval(expr, {"__builtins__": {}}, {"data": data})
if not value:
    raise SystemExit(1)
PY
}

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "${BASE_URL}${path}" "${AUTH_HEADER[@]}" "${JSON_HEADER[@]}" --data "$body"
  else
    curl -fsS -X "$method" "${BASE_URL}${path}" "${AUTH_HEADER[@]}"
  fi
}

wait_for_schedule_runs() {
  local schedule_id="$1"
  local min_runs="$2"
  echo "[INFO] Waiting for schedule ${schedule_id} to reach ${min_runs} runs"
  for _ in $(seq 1 45); do
    local response
    response=$(request GET "/v1/schedules/${schedule_id}")
    local runs
    runs=$(echo "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("run_count", 0))')
    if [[ "$runs" -ge "$min_runs" ]]; then
      echo "$response"
      return 0
    fi
    sleep 2
  done
  fail "Schedule ${schedule_id} did not reach ${min_runs} runs"
}

wait_for_session_message() {
  local session_id="$1"
  local needle="$2"
  echo "[INFO] Waiting for session ${session_id} message containing: ${needle}"
  for _ in $(seq 1 45); do
    local response
    response=$(request GET "/v1/sessions/${session_id}/messages?limit=50&offset=0")
    if echo "$response" | python3 - "$needle" <<'PY'
import json, sys
needle = sys.argv[1]
data = json.load(sys.stdin)
msgs = data.get("messages", [])
for msg in msgs:
    if needle in (msg.get("content") or ""):
        raise SystemExit(0)
raise SystemExit(1)
PY
    then
      echo "$response"
      return 0
    fi
    sleep 2
  done
  fail "Did not find session message containing '${needle}'"
}

wait_for_memory_entity() {
  local name="$1"
  echo "[INFO] Waiting for graph entity ${name}"
  for _ in $(seq 1 45); do
    local encoded
    encoded=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$name")
    local response
    response=$(request GET "/v1/memory/entities?search=${encoded}&limit=20")
    if echo "$response" | python3 - "$name" <<'PY'
import json, sys
name = sys.argv[1].lower()
data = json.load(sys.stdin)
for entity in data.get("entities", []):
    if (entity.get("name") or "").lower() == name:
        raise SystemExit(0)
raise SystemExit(1)
PY
    then
      echo "$response"
      return 0
    fi
    sleep 2
  done
  fail "Entity '${name}' was not found after waiting"
}

wait_for_memory_query_hit() {
  local query="$1"
  local needle="$2"
  echo "[INFO] Waiting for memory query hit for '${query}'"
  for _ in $(seq 1 45); do
    local payload
    payload=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1], "mode": "auto", "limit": 10}))' "$query")
    local response
    response=$(request POST "/v1/memory/query" "$payload")
    if echo "$response" | python3 - "$needle" <<'PY'
import json, sys
needle = sys.argv[1].lower()
data = json.load(sys.stdin)
def walk(x):
    if isinstance(x, dict):
        for v in x.values():
            yield from walk(v)
    elif isinstance(x, list):
        for v in x:
            yield from walk(v)
    elif isinstance(x, str):
        yield x
for text in walk(data):
    if needle in text.lower():
        raise SystemExit(0)
raise SystemExit(1)
PY
    then
      echo "$response"
      return 0
    fi
    sleep 2
  done
  fail "Memory query '${query}' did not return text containing '${needle}'"
}

main() {
  wait_for_health

  echo "[INFO] Checking unauthenticated models endpoint"
  models=$(curl -fsS "${BASE_URL}/v1/models")
  expect_json_field "$models" 'isinstance(data.get("data"), list) and len(data["data"]) >= 1' || fail "models endpoint did not return models"

  echo "[INFO] Creating session"
  session=$(request POST "/v1/sessions" '{"session_key":"ci-e2e-session","name":"CI E2E Session","metadata":{"source":"ci"}}')
  session_id=$(echo "$session" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

  echo "[INFO] Reading session by id and key"
  request GET "/v1/sessions/${session_id}" >/dev/null
  request GET "/v1/sessions/by-key/ci-e2e-session" >/dev/null

  echo "[INFO] Updating session personality"
  request PUT "/v1/sessions/${session_id}/personality" '{"personality":"Be concise for CI verification."}' >/dev/null

  echo "[INFO] Writing identity documents"
  request PUT "/v1/identity/soul" '{"content":"You are Kraken in CI deployment verification mode."}' >/dev/null
  request PUT "/v1/identity/agents-md" '{"content":"CI deployment smoke test context."}' >/dev/null
  request GET "/v1/identity/soul" >/dev/null
  request GET "/v1/identity/user-model" >/dev/null
  request GET "/v1/identity/agents-md" >/dev/null

  echo "[INFO] Creating identity link"
  request POST "/v1/identity/links" '{"canonical_user_id":"ci-user","provider":"github","provider_user_id":"ci-bot","display_name":"CI Bot"}' >/dev/null
  request GET "/v1/identity/links?canonical_user_id=ci-user" >/dev/null

  echo "[INFO] Creating skill"
  skill=$(request POST "/v1/skills" '{"name":"ci-smoke-skill","content":"Use this skill to verify CI deployments.","tags":["ci","smoke"]}')
  skill_id=$(echo "$skill" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  request GET "/v1/skills?search=ci-smoke-skill" >/dev/null
  request GET "/v1/skills/${skill_id}" >/dev/null
  request PATCH "/v1/skills/${skill_id}" '{"content":"Updated CI smoke verification skill.","tags":["ci","verification"]}' >/dev/null

  echo "[INFO] Creating tool"
  tool=$(request POST "/v1/tools" '{"name":"ci-smoke-tool","description":"CI smoke tool","instructions":"Use for deployment verification","tags":["ci","smoke"]}')
  tool_id=$(echo "$tool" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  request GET "/v1/tools?search=ci-smoke-tool" >/dev/null
  request GET "/v1/tools/${tool_id}" >/dev/null
  request PATCH "/v1/tools/${tool_id}" '{"description":"Updated CI smoke tool","instructions":"Updated instructions","tags":["ci","verification"]}' >/dev/null

  echo "[INFO] Creating and listing secret"
  secret=$(request POST "/v1/secrets" '{"name":"CI_TEST_SECRET","value":"super-secret","description":"CI smoke secret","allowed_tools":["get_secret"]}')
  secret_id=$(echo "$secret" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  request GET "/v1/secrets" >/dev/null
  request PATCH "/v1/secrets/${secret_id}" '{"description":"Updated CI smoke secret","allowed_tools":["get_secret"]}' >/dev/null

  echo "[INFO] Creating graph memory entity and relationship"
  entity_a=$(request POST "/v1/memory/entities" '{"name":"CI Project","type":"project","properties":{"status":"active"}}')
  entity_a_id=$(echo "$entity_a" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  entity_b=$(request POST "/v1/memory/entities" '{"name":"CI User","type":"person","properties":{"role":"tester"}}')
  entity_b_id=$(echo "$entity_b" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  relationship_payload=$(python3 -c 'import json,sys; print(json.dumps({"source": sys.argv[1], "target": sys.argv[2], "type": "works_on", "properties": {"source": "ci"}}))' "$entity_b_id" "$entity_a_id")
  request POST "/v1/memory/relationships" "$relationship_payload" >/dev/null
  request GET "/v1/memory/graph?center=${entity_a_id}&depth=2" >/dev/null
  request GET "/v1/memory/communities?level=0" >/dev/null
  wait_for_memory_entity "CI Project"

  echo "[INFO] Exercising chat and OpenAI-compatible chat without provider key"
  chat_payload=$(python3 -c 'import json,sys; print(json.dumps({"message": "Remember that the CI deployment project is called CI Project.", "session_id": sys.argv[1]}))' "$session_id")
  request POST "/v1/chat" "$chat_payload" >/dev/null

  completion_payload='{"model":"kraken-omni-2.7n","messages":[{"role":"user","content":"Remember that the OpenAI-compatible CI deployment project is called CI Project Completion."}],"session_key":"ci-openai-session"}'
  request POST "/v1/chat/completions" "$completion_payload" >/dev/null

  echo "[INFO] Waiting for async memory extraction/query visibility"
  wait_for_memory_query_hit "CI Project" "ci project"

  echo "[INFO] Compacting session and reading messages"
  curl -fsS -X POST "${BASE_URL}/v1/sessions/${session_id}/compact" "${AUTH_HEADER[@]}" -o /dev/null || true
  request GET "/v1/sessions/${session_id}/messages?limit=50&offset=0" >/dev/null

  echo "[INFO] Creating recurring schedule and verifying worker execution"
  schedule_payload=$(python3 -c 'import json,sys; print(json.dumps({"name":"ci-schedule","description":"CI schedule test","cron_expression":"*/1 * * * *","task_prompt":"Reply with exactly scheduled run ok.","origin_session_id":sys.argv[1],"max_runs":1}))' "$session_id")
  schedule=$(request POST "/v1/schedules" "$schedule_payload")
  schedule_id=$(echo "$schedule" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  request GET "/v1/schedules" >/dev/null
  wait_for_schedule_runs "$schedule_id" 1 >/dev/null
  wait_for_session_message "$session_id" "scheduled run ok."

  echo "[INFO] Checking sandbox/workspace endpoints against a non-existent sandbox session"
  [[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/v1/sandboxes/ci-missing")" == "404" ]] || fail "missing sandbox should return 404"
  [[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/v1/sandboxes/ci-missing/ports")" == "200" ]] || fail "sandbox ports listing should return 200 with empty list"
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/v1/sandboxes/ci-missing/processes")
  [[ "$code" == "404" || "$code" == "500" ]] || fail "sandbox processes endpoint should fail clearly for missing sandbox"
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/v1/sessions/ci-missing/workspace")
  [[ "$code" == "404" || "$code" == "500" ]] || fail "workspace listing should fail clearly for missing sandbox"

  echo "[INFO] Cleaning up created resources"
  request DELETE "/v1/schedules/${schedule_id}" >/dev/null || true
  request DELETE "/v1/tools/${tool_id}" >/dev/null
  request DELETE "/v1/skills/${skill_id}" >/dev/null
  request DELETE "/v1/secrets/${secret_id}" >/dev/null
  request DELETE "/v1/memory/entities/${entity_a_id}" >/dev/null
  request DELETE "/v1/memory/entities/${entity_b_id}" >/dev/null
  request DELETE "/v1/sessions/${session_id}" >/dev/null

  echo "[PASS] Full deployment smoke test completed"
}

main "$@"
