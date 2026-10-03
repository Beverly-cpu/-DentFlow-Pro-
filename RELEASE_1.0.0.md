# DentFlow Pro 1.0.0

Release source is the accepted `main` commit that triggers the Windows production artifact with `[build-release]`.

## Software gates

- Central API / PostgreSQL multi-PC architecture
- Clinic/account authorization and audit trail
- Central patient, implant, inventory and clinical workflows
- Explicit REF/LOT selection and idempotent inventory mutations
- Historical picked costs with role/category visibility controls
- Private clinical assets and assigned-doctor signature/closure controls
- Encrypted pending mutation recovery
- Windows x64 NSIS packaging
- Production desktop fails closed when central server URL is missing
- Quality Gate: shell syntax, lint, tests and full build

## Deployment activation blockers

The 1.0.0 binary must not be enabled for real patient use until the deployed environment passes `production-preflight.sh`, `s3-private-smoke-test.sh`, `api-production-smoke-test.sh`, and every release-blocking item in `TWO_PC_PRODUCTION_ACCEPTANCE.md`. Windows organization code signing is also required for the final broadly distributed installer. These environment/hardware checks cannot be truthfully satisfied by source CI alone.
