# Production API smoke test

After PostgreSQL migrations, S3 preflight and HTTPS reverse-proxy deployment, export the public server URL:

```sh
export DENTFLOW_SERVER_URL='https://YOUR-DENTFLOW-DOMAIN'
sh scripts/api-production-smoke-test.sh
```

The script refuses non-HTTPS URLs. It checks `/health` for API+database status, `/ready` for migration readiness, and `/v1/setup/status` for the expected initialization contract. It does not log in, mutate clinical data, or accept credentials.

## Clinical asset acceptance

Infrastructure smoke tests are not a substitute for the application path. Before production rollout, create a non-patient test case through DentFlow and perform the real authenticated flow:

1. Upload one required REF/LOT or instrument image through `POST /v1/implants/:id/clinical-assets`.
2. Confirm the response reports `uploadState: uploaded` only after the API writes to S3 and reads it back for hash/size verification.
3. Read the uploaded asset through authenticated `GET /v1/clinical-assets/:id`.
4. Confirm an account without clinic/case permission cannot read it.
5. Confirm the S3 object itself remains inaccessible anonymously.

Do not create a generic unauthenticated upload test endpoint. Clinical asset verification must exercise the existing session, clinic, doctor and case authorization rules.
