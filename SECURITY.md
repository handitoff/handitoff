# Security Policy

## Reporting A Vulnerability

Please report suspected vulnerabilities privately by emailing hello@handitoff.io.

Include a clear description, affected component, reproduction steps, and any relevant logs or proof-of-concept details. Do not open a public issue for an unpatched vulnerability.

## Scope

Security-sensitive areas include:

- Session creation, pairing, approval, and public-code handling.
- WebSocket signaling and message validation.
- WebRTC transfer setup and application-layer file encryption.
- TURN credential generation and ICE server configuration.
- Redis-backed session storage, expiry, and rate limits.
