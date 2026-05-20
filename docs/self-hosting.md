# Self-Hosting And Local Development

This repository contains the core Handitoff web app and signaling API. File bytes are transferred between browser peers over WebRTC data channels. The API coordinates short-lived sessions, public codes, approval state, and signaling metadata; it does not store file contents, permanent file URLs, previews, or file indexes.

## Requirements

- Node.js 20.11 or newer.
- npm.
- Redis for self-host deployments and any development flow that should behave like a deployable environment.
- Docker Compose, if you want the provided Redis/API/web development stack.

## Local Development Without Docker

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

Start Redis locally and set:

```bash
HANDITOFF_REDIS_URL=redis://localhost:6379
```

Then run the web app and API:

```bash
npm run dev
```

The default local URLs are:

- Web: `http://localhost:5173`
- API: `http://localhost:8787`
- WebSocket: `ws://localhost:8787/ws`
- Health check: `http://localhost:8787/api/health`

For phone testing on the same network, set `HANDITOFF_LAN_HOST` to your development machine IP address, or set `HANDITOFF_APP_URL`, `HANDITOFF_API_URL`, and `HANDITOFF_WS_URL` explicitly.

## Local Development With Docker Compose

Start only the shared API dependency:

```bash
docker compose up redis
```

Start Redis, API, and web together:

```bash
docker compose up redis api web
```

The Compose file uses local development defaults only. It does not contain production secrets.

## Environment Variables

| Variable                                                  | Required         | Description                                                                                                   |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `PORT`                                                    | API deploy       | API listen port. Defaults to `8787`.                                                                          |
| `HANDITOFF_APP_URL`                                       | Yes              | Public browser URL for the web app, for example `https://handitoff.example.com`.                              |
| `HANDITOFF_API_URL`                                       | Yes              | Public HTTPS URL for the API, for example `https://api.handitoff.example.com`.                                |
| `HANDITOFF_WS_URL`                                        | Yes              | Public WebSocket URL for signaling, usually `wss://api.handitoff.example.com/ws`.                             |
| `HANDITOFF_REDIS_URL`                                     | Self-host deploy | Redis connection URL, for example `redis://redis:6379`.                                                       |
| `HANDITOFF_ICE_SERVERS`                                   | Recommended      | JSON array of ICE server definitions passed to `RTCPeerConnection`.                                           |
| `HANDITOFF_LAN_HOST`                                      | Local only       | Optional shortcut that derives local web/API/WebSocket URLs from one LAN host. Explicit URLs take precedence. |
| `HANDITOFF_BILLING_ENABLED`                               | No               | Feature flag. Keep `false` for the core self-host app.                                                        |
| `HANDITOFF_TURN_ENABLED`                                  | Public deploy    | Set `true` when TURN is configured.                                                                           |
| `HANDITOFF_MULTI_DEVICE_ROOMS`                            | No               | Future feature flag. Keep `false` for the MVP.                                                                |
| `HANDITOFF_ACCOUNTS`                                      | No               | Future feature flag. Keep `false` for the MVP.                                                                |
| `HANDITOFF_UNPAIRED_SESSION_TTL_SECONDS`                  | No               | Waiting-room session lifetime. Defaults to `600`.                                                             |
| `HANDITOFF_PAIRED_SESSION_TTL_SECONDS`                    | No               | Connected session lifetime. Defaults to `1800`.                                                               |
| `HANDITOFF_MAX_FILES_PER_TRANSFER`                        | No               | Client-facing transfer guidance. Defaults to `100`.                                                           |
| `HANDITOFF_MAX_FILE_SIZE_BYTES`                           | No               | Shared file size limit for validation and transfer offers. Defaults to `2147483648`.                          |
| `HANDITOFF_MAX_RECOMMENDED_FILE_SIZE_BYTES`               | No               | Backwards-compatible alias for the shared file size limit. Defaults to `2147483648`.                          |
| `HANDITOFF_MAX_ACTIVE_SESSIONS_PER_IP`                    | No               | API rate limit. Defaults to `5`.                                                                              |
| `HANDITOFF_MAX_JOIN_ATTEMPTS_PER_PUBLIC_CODE`             | No               | Join attempt rate limit. Defaults to `10`.                                                                    |
| `HANDITOFF_MAX_SIGNALING_MESSAGES_PER_MINUTE_PER_SESSION` | No               | Signaling rate limit. Defaults to `300`.                                                                      |

`HANDITOFF_ICE_SERVERS` must be JSON, for example:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  {
    "urls": [
      "turn:turn.example.com:3478?transport=udp",
      "turn:turn.example.com:3478?transport=tcp"
    ],
    "username": "turn-user",
    "credential": "turn-password"
  }
]
```

## Redis

Redis is required for self-host deployment so session state, public-code lookups, expiry, and rate-limit coordination are not tied to a single Node.js process. Run Redis close to the API and protect it from the public internet.

Use a persistent Redis volume if you want sessions to survive Redis restarts until their TTL expires. Handitoff sessions are short-lived, so Redis should not be used as long-term file or account storage.

## STUN And TURN

The default ICE config is STUN-only:

```json
[{ "urls": "stun:stun.l.google.com:19302" }]
```

STUN-only can work on many home and office networks, but it is not reliable for public use. Some NAT, firewall, mobile carrier, and enterprise network combinations require a relay. For reliable self-hosting, run or subscribe to a TURN service, add it to `HANDITOFF_ICE_SERVERS`, and set `HANDITOFF_TURN_ENABLED=true`.

TURN relays encrypted WebRTC traffic when a direct peer-to-peer path cannot be established. The relay can see connection metadata and encrypted packet flow, but it should not receive plaintext file bytes from the application.
