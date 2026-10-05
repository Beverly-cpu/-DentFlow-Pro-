#!/usr/bin/env bash
set -euo pipefail
: "${AWS_REGION:?set AWS_REGION}"
: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID}"
: "${IMAGE_TAG:?set immutable IMAGE_TAG, preferably git SHA}"
repo="dentflow-prod-api"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build --file apps/api/Dockerfile --tag "$repo:$IMAGE_TAG" .
docker tag "$repo:$IMAGE_TAG" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$repo:$IMAGE_TAG"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$repo:$IMAGE_TAG"
