#!/bin/sh
set -eu
: "${ASSET_BUCKET:?ASSET_BUCKET is required}"
: "${ASSET_BUCKET_OWNER:?ASSET_BUCKET_OWNER is required}"
cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CheckDentFlowBucketPrivacy",
      "Effect": "Allow",
      "Action": ["s3:GetBucketPublicAccessBlock"],
      "Resource": ["arn:aws:s3:::${ASSET_BUCKET}"]
    },
    {
      "Sid": "DentFlowClinicalAssets",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::${ASSET_BUCKET}/dentflow/clinics/*"]
    }${ASSET_KMS_KEY_ID:+,
    {
      "Sid": "DentFlowAssetKms",
      "Effect": "Allow",
      "Action": ["kms:GenerateDataKey", "kms:Decrypt"],
      "Resource": ["${ASSET_KMS_KEY_ID}"]
    }}
  ]
}
EOF
