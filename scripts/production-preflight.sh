#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${ASSET_BUCKET:?ASSET_BUCKET is required}"
: "${ASSET_REGION:?ASSET_REGION is required}"
: "${ASSET_BUCKET_OWNER:?ASSET_BUCKET_OWNER is required}"
case "$ASSET_BUCKET_OWNER" in (*[!0-9]*|"") echo "ASSET_BUCKET_OWNER must be a 12 digit AWS account id" >&2; exit 1;; esac
[ "${#ASSET_BUCKET_OWNER}" -eq 12 ] || { echo "ASSET_BUCKET_OWNER must be 12 digits" >&2; exit 1; }
command -v node >/dev/null && command -v pnpm >/dev/null && command -v psql >/dev/null && command -v aws >/dev/null && command -v curl >/dev/null
node -e 'const m=Number(process.versions.node.split(".")[0]); if(m<22) process.exit(1)'
echo "== Database connection =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user;"
echo "== Applied migrations =="
expected="$(find apps/api/src/migrations -maxdepth 1 -type f -name '*.sql' -print | sed 's#^.*/##' | sort | tail -n 1)"
[ -n "$expected" ] || { echo "No API migrations found" >&2; exit 1; }
last="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1")"
[ "$last" = "$expected" ] || { echo "Expected latest migration $expected, got: $last" >&2; exit 1; }
echo "== AWS identity =="
aws sts get-caller-identity
echo "== S3 owner/access =="
aws s3api head-bucket --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER"
echo "== S3 public access block =="
block="$(aws s3api get-public-access-block --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text)"
[ "$block" = "True	True	True	True" ] || { echo "All four S3 Block Public Access controls must be true: $block" >&2; exit 1; }
public="$(aws s3api get-bucket-policy-status --bucket "$ASSET_BUCKET" --query 'PolicyStatus.IsPublic' --output text 2>/dev/null || printf 'False')"
[ "$public" = "False" ] || { echo "S3 bucket policy is public" >&2; exit 1; }
echo "Preflight passed: latest repository DB migration is applied and S3 privacy controls verified."
