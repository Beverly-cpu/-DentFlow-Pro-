#!/bin/sh
set -eu
: "${DENTFLOW_SERVER_URL:?DENTFLOW_SERVER_URL is required}"
case "$DENTFLOW_SERVER_URL" in https://*) ;; *) echo "Production DENTFLOW_SERVER_URL must use https://" >&2; exit 1;; esac
base="${DENTFLOW_SERVER_URL%/}"
echo "== TLS/API health =="
health="$(curl --fail --silent --show-error --max-time 10 "$base/health")"
printf '%s\n' "$health"
printf '%s' "$health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.status!=="ok"||j.service!=="dentflow-api"||j.database!=="ok")process.exit(1)})'
echo "== API readiness =="
ready="$(curl --fail --silent --show-error --max-time 10 "$base/ready")"
printf '%s\n' "$ready"
printf '%s' "$ready" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.status!=="ready"||j.service!=="dentflow-api")process.exit(1)})'
echo "== Setup/auth surface =="
setup="$(curl --fail --silent --show-error --max-time 10 "$base/v1/setup/status")"
printf '%s\n' "$setup"
printf '%s' "$setup" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(typeof j.hasUsers!=="boolean")process.exit(1)})'
echo "API production smoke passed: valid HTTPS request path, database health/readiness and setup endpoint."
