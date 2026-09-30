#!/usr/bin/env bash

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-durabull-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$}"
COMPOSE_FILE="${COMPOSE_FILE:-tooling/docker/docker-compose.self-hosted.yaml}"
# An empty host port asks Docker to allocate an available localhost port.
APP_PORT="${DURABULL_APP_PORT:-127.0.0.1:}"
IMAGE_TAG="${DURABULL_IMAGE:-ghcr.io/durabullhq/durabull:latest}"

export DURABULL_IMAGE="$IMAGE_TAG"
export DURABULL_APP_PORT="$APP_PORT"
export APP_BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3000}"
export VITE_PUBLIC_APP_URL="${VITE_PUBLIC_APP_URL:-$APP_BASE_URL}"
export DURABULL_AUTHLESS="${DURABULL_AUTHLESS:-true}"
export MCP_AUTHLESS_BEARER_TOKEN="${MCP_AUTHLESS_BEARER_TOKEN:-durabull-authless-mcp-smoke}"
export DURABULL_ENV_CONNECTIONS="${DURABULL_ENV_CONNECTIONS:-true}"
export DURABULL_REDIS_URL_MAIN="${DURABULL_REDIS_URL_MAIN:-redis://redis:6379}"
export DURABULL_REDIS_URL_MAIN_ENVIRONMENT="${DURABULL_REDIS_URL_MAIN_ENVIRONMENT:-development}"
export DURABULL_REDIS_URL_DEFAULT="${DURABULL_REDIS_URL_DEFAULT:-MAIN}"
export DURABULL_REDIS_URL_ENCRYPTION_KEY="${DURABULL_REDIS_URL_ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-durabull-docker-smoke-test-secret-do-not-use-in-production}"

compose() {
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "$@"
}

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    compose logs --no-color || true
  fi
  compose down -v --remove-orphans || true
  return $exit_code
}

trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local max_attempts="${2:-60}"

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    if curl --silent --show-error --fail "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for $url" >&2
  return 1
}

assert_json_contains() {
  local url="$1"
  local expected="$2"
  local body

  body="$(curl --silent --show-error --fail "$url")"
  echo "$body"

  if [[ "$body" != *"$expected"* ]]; then
    echo "Expected response from $url to contain: $expected" >&2
    return 1
  fi
}

echo "Starting smoke stack with image: $DURABULL_IMAGE"
compose up -d

published_address="$(compose port durabull 3000)"
published_address="${published_address%%$'\n'*}"
smoke_base_url="http://127.0.0.1:${published_address##*:}"
echo "Probing smoke stack at: $smoke_base_url"

wait_for_url "${smoke_base_url}/api/health"

assert_json_contains "${smoke_base_url}/api/health" '"status":"ok"'
assert_json_contains "${smoke_base_url}/api/app/config" '"authless":true'
assert_json_contains "${smoke_base_url}/api/app/config" '"persistence":"pglite"'
if [[ -n "${DURABULL_EXPECTED_BUILD_ID:-}" ]]; then
  assert_json_contains "${smoke_base_url}/api/app/version" "\"buildId\":\"${DURABULL_EXPECTED_BUILD_ID}\""
fi
if [[ -n "${DURABULL_EXPECTED_RELEASE_CHANNEL:-}" ]]; then
  assert_json_contains \
    "${smoke_base_url}/api/app/version" \
    "\"releaseChannel\":\"${DURABULL_EXPECTED_RELEASE_CHANNEL}\""
fi
assert_json_contains "${smoke_base_url}/api/auth/get-session" '"id":"authless-user"'

echo "Docker image smoke test passed."
