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

The API listens on `PORT` or `8787` by default. `GET /api/health` returns the health payload.
