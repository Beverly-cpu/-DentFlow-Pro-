# Production deployment preflight

This checklist is intentionally separate from local docker-compose development.

## Server prerequisites

Install Node.js 22+, pnpm 10, PostgreSQL client (psql), AWS CLI v2 and curl. Copy `apps/api/.env.production.example` into the deployment secret/configuration system and replace placeholders there; do not commit the resulting file.

AWS credentials are supplied by the SDK default credential provider. Prefer an IAM role on the API runtime. The API role needs `s3:GetBucketPublicAccessBlock` on the bucket and `s3:PutObject`/`s3:GetObject` on `dentflow/clinics/*`. With KMS it also needs `kms:GenerateDataKey` and `kms:Decrypt` for the configured key.

## Order

1. Export the production environment variables in the API server session.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Run `pnpm lint && pnpm test && pnpm build:all`.
4. Run `pnpm db:migrate`.
5. Run `sh scripts/production-preflight.sh`.
6. Start the compiled API with `pnpm --filter @dentflow/api start`.
7. Through the HTTPS reverse proxy, verify `/health` returns status=ok/database=ok and `/ready` returns status=ready.
8. Use a non-patient test implant case to upload a clinical image through DentFlow. Confirm it becomes uploaded only after the server's S3 read-back hash/size verification.
9. Confirm anonymous S3 object access fails before beginning two-computer acceptance.

The preflight script does not create AWS or PostgreSQL resources and does not mutate S3 objects. It verifies connectivity, that the latest migration present in the checked-out repository is applied, AWS identity/bucket ownership and privacy controls.\n\n## Release blockers that require the real environment\n\nA green GitHub Quality Gate proves source lint/tests/build and shell syntax only. It does not prove production AWS credentials, PostgreSQL, HTTPS reverse proxy, private S3 behavior, two-PC concurrency, or the physical signature pad. Before enabling real patient use, run all three production scripts in the deployed environment and complete `TWO_PC_PRODUCTION_ACCEPTANCE.md` with non-patient test data. Any unchecked release-blocking item keeps the deployment in pre-production.


## Windows release candidate

The production desktop installer is built by the `Release Candidate` GitHub Actions workflow on `windows-latest`. The packaged application is versioned independently from development and the workflow sets `DENTFLOW_REQUIRE_REMOTE=1` so a production deployment cannot silently fall back to local SQLite when the central server URL is absent. Configure `DENTFLOW_SERVER_URL` in the deployed desktop environment to the accepted HTTPS API endpoint before clinical use.

The generated RC artifact is intentionally unsigned until an organization-controlled Windows code-signing certificate is configured. Treat SmartScreen/code-signing acceptance as a release blocker for broad production distribution. After the real-environment acceptance checklist passes, create the final signed release from the accepted commit/tag; do not treat an unsigned RC artifact as the final clinical production release.
