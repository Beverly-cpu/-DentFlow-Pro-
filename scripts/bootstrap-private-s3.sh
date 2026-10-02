#!/bin/sh
set -eu
: "${ASSET_BUCKET:?ASSET_BUCKET is required}"
: "${ASSET_REGION:?ASSET_REGION is required}"
: "${ASSET_BUCKET_OWNER:?ASSET_BUCKET_OWNER is required}"
[ "${#ASSET_BUCKET_OWNER}" -eq 12 ] || { echo "ASSET_BUCKET_OWNER must be 12 digits" >&2; exit 1; }
actual="$(aws sts get-caller-identity --query Account --output text)"
[ "$actual" = "$ASSET_BUCKET_OWNER" ] || { echo "AWS account mismatch: expected $ASSET_BUCKET_OWNER got $actual" >&2; exit 1; }
if aws s3api head-bucket --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER" 2>/dev/null; then
  echo "Bucket already exists and is owned by expected account."
else
  if [ "$ASSET_REGION" = "us-east-1" ]; then aws s3api create-bucket --bucket "$ASSET_BUCKET" --region "$ASSET_REGION"
  else aws s3api create-bucket --bucket "$ASSET_BUCKET" --region "$ASSET_REGION" --create-bucket-configuration "LocationConstraint=$ASSET_REGION"; fi
fi
aws s3api put-public-access-block --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER" --server-side-encryption-configuration "${ASSET_KMS_KEY_ID:+{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"$ASSET_KMS_KEY_ID\"},\"BucketKeyEnabled\":true}]}}${ASSET_KMS_KEY_ID:-{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"AES256\"}}]}}"
aws s3api get-public-access-block --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER"
aws s3api get-bucket-versioning --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER"
aws s3api get-bucket-encryption --bucket "$ASSET_BUCKET" --expected-bucket-owner "$ASSET_BUCKET_OWNER"
echo "Private DentFlow asset bucket bootstrap complete."
