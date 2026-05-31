# handitoff

[handitoff.io](https://handitoff.io) is a browser-based file handoff app for moving files between devices without accounts, installs, or server-side file storage.

Open the site on two devices, pair them with a short code or QR code, approve the connection, and send files from one browser to the other. Files are not stored on Handitoff servers.

## What Is In This Repo

- `apps/web`: React Router web app.
- `apps/api`: Node.js signaling/session API.
- `packages/protocol`: Shared protocol types, messages, validation, and public-code helpers.
- `packages/config`: Runtime configuration loading and public config shaping.
- `packages/crypto`: Browser-side transfer encryption helpers.
- `packages/transfer`: WebRTC transfer orchestration.
- `packages/turn`: Short-lived TURN credential issuing.
- `packages/abuse`: Hosted abuse/rate-limit helpers.
- `packages/analytics`: Minimal event normalization and sink interfaces.

## Security And Privacy Model

- Files are sent browser to browser and are not saved by Handitoff.
- Transfers require approval from the receiving device.
- Pairing sessions are temporary.
- Transfer traffic is encrypted in the browser.
- A TURN relay can help devices connect on restrictive networks, but it should only relay encrypted traffic.

## Requirements

- Node.js 20.11 or newer.
- npm.
- Redis for deployable/self-hosted environments.
- Docker Compose, optional, for the provided local Redis/API/web stack.

## Quick Start

Install dependencies:

```bash
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

Start the web app and API:

```bash
npm run dev
```

By default, the local services run at:

- Web: `http://localhost:5173`
- API: `http://localhost:8787`
- WebSocket: `ws://localhost:8787/ws`
- Health check: `http://localhost:8787/api/health`

For Redis-backed local development:

```bash
docker compose up redis
```

Then set:

```bash
HANDITOFF_REDIS_URL=redis://localhost:6379
```

## Docker Compose

Start Redis, API, and web together:

```bash
docker compose up redis api web
```

The Compose file uses local development defaults.

## Common Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Build one app:

```bash
npm run build:api
npm run build:web
```

Run Prisma commands for the API:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:migrate:deploy
```

## Configuration

Start from `.env.example`. The main runtime settings are:

- `HANDITOFF_APP_URL`: Browser-facing web app URL.
- `HANDITOFF_API_URL`: Browser-facing API URL.
- `HANDITOFF_WS_URL`: Browser-facing WebSocket URL.
- `HANDITOFF_REDIS_URL`: Redis URL for shared session state.
- `HANDITOFF_ICE_SERVERS`: JSON ICE server list for WebRTC.
- `HANDITOFF_TURN_ENABLED`: Set `true` when TURN relay support is configured.

See [docs/self-hosting.md](docs/self-hosting.md) for the full environment variable table.

## Documentation

- [Self-hosting and local development](docs/self-hosting.md)
- [Production builds](docs/production-builds.md)
- [Manual device test checklist](docs/manual-device-test-checklist.md)

## License

MIT. See [LICENSE](LICENSE).
