# Cloud resource bootstrap

These scripts create the minimum cloud resources needed before DentFlow's production preflight. They do not contain credentials and should be run by an infrastructure administrator.

## 1. PostgreSQL

Generate a strong database password in the deployment secret manager. From an administrator connection:

```sh
psql "$ADMIN_DATABASE_URL" -v dentflow_password="'$DENTFLOW_DB_PASSWORD'" -f scripts/bootstrap-postgres.sql
```

Then build `DATABASE_URL` for the newly created `dentflow` login/database, export it only in the API server secret environment, and run `pnpm db:migrate`.

Expected: role `dentflow` exists, database `dentflow` is owned by it, public database privileges are revoked, and migration 0015 is applied.

## 2. Private AWS S3

Choose a globally unique bucket name and the AWS region/account that will own it:

```sh
export ASSET_BUCKET='YOUR-UNIQUE-DENTFLOW-BUCKET'
export ASSET_REGION='ap-northeast-1'
export ASSET_BUCKET_OWNER='123456789012'
# Optional:
# export ASSET_KMS_KEY_ID='arn:aws:kms:...'
sh scripts/bootstrap-private-s3.sh
```

Expected: the caller account exactly matches ASSET_BUCKET_OWNER; the bucket exists in that account; all four Block Public Access controls are true; versioning is enabled; default encryption is AES256 or the configured KMS key.

The bootstrap deliberately does not configure public ACLs, public bucket policies, website hosting or DeleteObject permissions.

## 3. API IAM role

Render the minimum application policy:

```sh
sh scripts/render-api-iam-policy.sh > /tmp/dentflow-api-policy.json
```

Attach it to the API runtime role through your normal infrastructure process. Do not create long-lived AWS keys for Electron clients.

## 4. Verify

After the role, database URL and API environment are installed on the server:

```sh
pnpm db:migrate
sh scripts/production-preflight.sh
```

Do not begin the two-computer clinical acceptance until preflight passes and the API is reachable over valid HTTPS.
