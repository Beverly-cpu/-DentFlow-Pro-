# DentFlow private Windows central server (pilot only)

This deploys one PostgreSQL 17 database, the existing DentFlow API, a one-shot migration service, and Caddy private-CA HTTPS. It does **not** deploy AWS resources or make a public website.

## Requirements

- A dedicated, reliably powered Windows PC with Docker Desktop configured for Linux containers, enough RAM/storage, automatic restart and UPS strongly recommended.
- Check Docker Desktop **commercial licensing** for your organization; it is not universally free. Docker Engine on Linux is a possible no-license-fee alternative.
- WireGuard VPN between clinic PCs and central Windows host, with a **working reachable VPN endpoint** (public address/port-forward, or another authorized connectivity design). CGNAT may prevent direct inbound WireGuard; a paid relay might be needed.
- Do not use a real patient database for the first pilot. Never open PostgreSQL port 5432 to LAN, VPN or internet.
- A backup destination outside the Windows PC, encrypted and access-controlled.

## Setup

1. In `deploy/windows-server`, copy `.env.example` to `.env`. Replace both placeholder passwords with the same unique, long random **URL-safe** password; never commit the resulting file.
2. Configure WireGuard separately; assign a stable VPN IP to the central PC. Ensure all clinic PCs can reach it over VPN. Use Windows Firewall to **allow inbound TCP 8443 only from the approved VPN peers**, and deny all other inbound sources. Docker Desktop's port publishing can have different firewall behavior; verify from a non-VPN machine that port 8443 is unreachable.
3. On each clinic PC, map `dentflow.internal` to the central host VPN IP (or use private VPN DNS). The hostname must match the Caddy certificate.
4. From this directory, run:
   ```powershell
   docker compose -f compose.yml --env-file .env up -d --build
   docker compose -f compose.yml --env-file .env ps
   docker compose -f compose.yml --env-file .env logs migrate
   ```
   The API only starts after successful database migrations. Check that the migrate service exited successfully. If it fails, **do not** force-start the API.
5. Export Caddy's local root CA certificate using `docker compose -f compose.yml cp https:/data/caddy/pki/authorities/local/root.crt .\\dentflow-root.crt`. Securely verify and install it into the trusted root store on **each managed clinic PC** (including the server PC if testing there). Treat the CA private key in the Docker volume as sensitive; never copy it to clients.
6. Test `https://dentflow.internal:8443/health` from a VPN-connected clinic PC and confirm the certificate is trusted. Configure the desktop app runtime with `DENTFLOW_SERVER_URL=https://dentflow.internal:8443` before launching it. Merely setting an environment variable in a GitHub Actions build does not configure installed Windows PCs.
7. Verify VPN disconnected => API inaccessible; server unavailable => client fails closed, with no local clinical writes. Verify two PCs see the same patient, inventory and audit data.

## Backup and recovery

- Back up PostgreSQL daily using `pg_dump -Fc`, then copy the dump to **encrypted storage on another physical device**, with access restrictions and retention. Do not rely on a Docker volume alone.
- For example, after stopping writes, create a dump **inside the database container**:
  ```powershell
  docker compose -f compose.yml exec -T postgres sh -c 'pg_dump -U dentflow -d dentflow -Fc -f /tmp/dentflow.dump'
  docker compose -f compose.yml cp postgres:/tmp/dentflow.dump .\\dentflow.dump
  ```
  Move the file to secure off-host backup storage and remove the temporary copy in the container. Test restore to a separate database before production.
- This is **not yet a complete backup**: clinical images/signatures currently depend on S3 integrations. A local private asset backend, its authorization, and coordinated backup/restore must be implemented and tested before live patient use.

## Release blockers

- PR #118 (packaged desktop fail-closed) must pass CI and be merged/released.
- Confirm the API runtime image includes all migrations and that database migrations succeed.
- Finish private local clinical asset storage, access controls, encrypted backup and restore tests.
- Finish WireGuard key distribution, key revocation, client certificate trust, firewall tests, 2-PC acceptance and Windows installer runtime configuration.
- The Caddy internal CA root is not a public CA: clinic devices must trust it explicitly. Never bypass TLS certificate verification.
- Windows sleep, reboot, power loss and ISP outage can interrupt **all five clinics**. Plan recovery and downtime procedures.
- Do not restore the paused AWS RDS snapshot into production as part of this pilot without a separately approved data migration plan.
