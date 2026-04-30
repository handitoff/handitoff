# Production Builds

The web app and API can be built and deployed separately. Both read public runtime URLs from configuration, so the browser must receive URLs that are reachable from the public internet.

## Build Everything

From the repository root:

```bash
npm install
npm run build
```

Run checks before deploying:

```bash
npm run lint
npm run typecheck
npm run test
```

## API Deployment

Build only the API package:

```bash
npm run build -w @handitoff/api
```

Start it:

```bash
PORT=8787 npm run start -w @handitoff/api
```

Required API-side configuration:

```bash
HANDITOFF_APP_URL=https://handitoff.example.com
HANDITOFF_API_URL=https://api.handitoff.example.com
HANDITOFF_WS_URL=wss://api.handitoff.example.com/ws
HANDITOFF_REDIS_URL=redis://redis:6379
HANDITOFF_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:turn.example.com:3478?transport=udp","turn:turn.example.com:3478?transport=tcp"],"username":"turn-user","credential":"turn-password"}]
HANDITOFF_TURN_ENABLED=true
```

Expose:

- `GET /api/health` for health checks. A healthy response is JSON with `status: "ok"` and a `requestId`.
- `GET /api/config` for public browser configuration.
- `POST /api/sessions` and session lookup/end routes.
- `GET /ws` with WebSocket upgrade support for signaling.

Route `/ws` through any reverse proxy with WebSocket upgrade headers enabled. Use HTTPS for API routes and WSS for signaling.

## Web Deployment

Build only the web package:

```bash
npm run build -w @handitoff/web
```

Start it with the React Router server:

```bash
npm run start -w @handitoff/web
```

The browser needs these public values to point at the deployed API:

```bash
HANDITOFF_APP_URL=https://handitoff.example.com
HANDITOFF_API_URL=https://api.handitoff.example.com
HANDITOFF_WS_URL=wss://api.handitoff.example.com/ws
```

If web and API are on different origins, keep CORS enabled on the API and make sure the public API URL is the externally reachable URL, not an internal container name.

## Public Configuration URLs

`HANDITOFF_APP_URL` is used when the API creates join links.

`HANDITOFF_API_URL` is used by the browser for HTTP requests.

`HANDITOFF_WS_URL` is used by the browser for signaling. It must use `wss://` on an HTTPS site.

`HANDITOFF_ICE_SERVERS` is returned as public WebRTC configuration. Do not place long-lived production TURN secrets in public config unless that is how your TURN service is intentionally configured. For reliable public use, prefer short-lived TURN credentials from a credential service.

## TURN Requirement For Public Use

STUN-only deployments are best-effort. They can fail when either peer is behind restrictive NAT, blocked UDP, corporate filtering, or mobile carrier network policies.

For reliable public use, deploy TURN and include both UDP and TCP relay URLs. Keep `HANDITOFF_TURN_ENABLED=true` so the UI and diagnostics reflect that relay support is available.

## Server-Side Storage Boundary

The API stores short-lived session and signaling coordination state. File bytes are not uploaded to or stored by the API. Transfers happen through browser WebRTC data channels, directly when possible and through TURN relay when required.
