#!/bin/sh
set -eu
: "${ASSET_BUCKET:?ASSET_BUCKET is required}"
: "${ASSET_REGION:?ASSET_REGION is required}"
: "${ASSET_BUCKET_OWNER:?ASSET_BUCKET_OWNER is required}"
tmp="${TMPDIR:-/tmp}/dentflow-s3-smoke-$$"; mkdir -m 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
printf 'dentflow-private-storage-smoke\n' > "$tmp/source"
key="dentflow/deployment-test/smoke-$(date +%Y%m%d%H%M%S)-$$.txt"
put_args="--bucket $ASSET_BUCKET --key $key --body $tmp/source --expected-bucket-owner $ASSET_BUCKET_OWNER"
if [ -n "${ASSET_KMS_KEY_ID:-}" ]; then
  aws s3api put-object $put_args --server-side-encryption aws:kms --ssekms-key-id "$ASSET_KMS_KEY_ID" >/dev/null
else
  aws s3api put-object $put_args --server-side-encryption AES256 >/dev/null
fi
aws s3api get-object --bucket "$ASSET_BUCKET" --key "$key" --expected-bucket-owner "$ASSET_BUCKET_OWNER" "$tmp/readback" >/dev/null
cmp "$tmp/source" "$tmp/readback"
enc="$(aws s3api head-object --bucket "$ASSET_BUCKET" --key "$key" --expected-bucket-owner "$ASSET_BUCKET_OWNER" --query ServerSideEncryption --output text)"
if [ -n "${ASSET_KMS_KEY_ID:-}" ]; then [ "$enc" = "aws:kms" ] || { echo "Expected aws:kms, got $enc" >&2; exit 1; }
else [ "$enc" = "AES256" ] || { echo "Expected AES256, got $enc" >&2; exit 1; }; fi
status="$(curl -sS -o /dev/null -w '%{http_code}' "https://${ASSET_BUCKET}.s3.${ASSET_REGION}.amazonaws.com/${key}")"
case "$status" in 401|403|404) ;; *) echo "Anonymous S3 access unexpectedly returned HTTP $status" >&2; exit 1;; esac
echo "S3 smoke test passed: authenticated put/get matched, encryption verified, anonymous read denied."
echo "Test object retained for audit because the API role intentionally has no DeleteObject permission: $key"
