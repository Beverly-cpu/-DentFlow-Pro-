# DentFlow private S3 smoke test

## 5. Private S3 smoke test

After the API runtime role is attached, run from that same AWS identity:

```sh
sh scripts/s3-private-smoke-test.sh
```

Expected: an authenticated object write/read round trip is byte-identical, server-side encryption matches AES256 or the configured KMS key, and anonymous HTTPS access is denied. The test object contains no patient data and is intentionally retained under `dentflow/deployment-test/` because the application role has no DeleteObject permission. Remove deployment-test objects later using a separate infrastructure administrator identity according to your retention process.
