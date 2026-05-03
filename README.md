# handitoff-core

Core application code for handitoff.io.

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Start the core API locally:

```bash
npm run start:api
```

Start Redis for development with Docker Compose:

```bash
docker compose up redis
```

Start Redis, API, and web together:

```bash
docker compose up redis api web
```

Operational docs:

- [Self-hosting and local development](docs/self-hosting.md)
- [Production builds](docs/production-builds.md)
- [Manual device test checklist](docs/manual-device-test-checklist.md)
