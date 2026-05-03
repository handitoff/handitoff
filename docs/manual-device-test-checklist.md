# Manual Device Test Checklist

Use this checklist for real browser and network reliability testing before release candidates. Record one row per browser pair and network condition.

## Test Build

- Date:
- Tester:
- Web URL:
- API URL:
- Build or commit:
- TURN enabled: Yes / No
- Notes:

## Device Matrix

| Pair                             | Network                    | Host browser/version | Guest browser/version | Pass/Fail | Notes |
| -------------------------------- | -------------------------- | -------------------- | --------------------- | --------- | ----- |
| Mac Chrome to iPhone Safari      | Same Wi-Fi                 |                      |                       |           |       |
| Mac Chrome to iPhone Safari      | Different Wi-Fi            |                      |                       |           |       |
| Mac Chrome to iPhone Safari      | Phone hotspot              |                      |                       |           |       |
| Mac Chrome to iPhone Safari      | Corporate/restricted Wi-Fi |                      |                       |           |       |
| Mac Chrome to iPhone Safari      | Mobile data                |                      |                       |           |       |
| Mac Chrome to iPhone Safari      | VPN enabled                |                      |                       |           |       |
| Mac Safari to iPhone Safari      | Same Wi-Fi                 |                      |                       |           |       |
| Mac Safari to iPhone Safari      | Different Wi-Fi            |                      |                       |           |       |
| Mac Safari to iPhone Safari      | Phone hotspot              |                      |                       |           |       |
| Mac Safari to iPhone Safari      | Corporate/restricted Wi-Fi |                      |                       |           |       |
| Mac Safari to iPhone Safari      | Mobile data                |                      |                       |           |       |
| Mac Safari to iPhone Safari      | VPN enabled                |                      |                       |           |       |
| Windows Chrome to Android Chrome | Same Wi-Fi                 |                      |                       |           |       |
| Windows Chrome to Android Chrome | Different Wi-Fi            |                      |                       |           |       |
| Windows Chrome to Android Chrome | Phone hotspot              |                      |                       |           |       |
| Windows Chrome to Android Chrome | Corporate/restricted Wi-Fi |                      |                       |           |       |
| Windows Chrome to Android Chrome | Mobile data                |                      |                       |           |       |
| Windows Chrome to Android Chrome | VPN enabled                |                      |                       |           |       |
| Windows Edge to iPhone Safari    | Same Wi-Fi                 |                      |                       |           |       |
| Windows Edge to iPhone Safari    | Different Wi-Fi            |                      |                       |           |       |
| Windows Edge to iPhone Safari    | Phone hotspot              |                      |                       |           |       |
| Windows Edge to iPhone Safari    | Corporate/restricted Wi-Fi |                      |                       |           |       |
| Windows Edge to iPhone Safari    | Mobile data                |                      |                       |           |       |
| Windows Edge to iPhone Safari    | VPN enabled                |                      |                       |           |       |
| Android Chrome to iPhone Safari  | Same Wi-Fi                 |                      |                       |           |       |
| Android Chrome to iPhone Safari  | Different Wi-Fi            |                      |                       |           |       |
| Android Chrome to iPhone Safari  | Phone hotspot              |                      |                       |           |       |
| Android Chrome to iPhone Safari  | Corporate/restricted Wi-Fi |                      |                       |           |       |
| Android Chrome to iPhone Safari  | Mobile data                |                      |                       |           |       |
| Android Chrome to iPhone Safari  | VPN enabled                |                      |                       |           |       |
| PC to PC                         | Same Wi-Fi                 |                      |                       |           |       |
| PC to PC                         | Different Wi-Fi            |                      |                       |           |       |
| PC to PC                         | Phone hotspot              |                      |                       |           |       |
| PC to PC                         | Corporate/restricted Wi-Fi |                      |                       |           |       |
| PC to PC                         | Mobile data                |                      |                       |           |       |
| PC to PC                         | VPN enabled                |                      |                       |           |       |
| Phone to phone                   | Same Wi-Fi                 |                      |                       |           |       |
| Phone to phone                   | Different Wi-Fi            |                      |                       |           |       |
| Phone to phone                   | Phone hotspot              |                      |                       |           |       |
| Phone to phone                   | Corporate/restricted Wi-Fi |                      |                       |           |       |
| Phone to phone                   | Mobile data                |                      |                       |           |       |
| Phone to phone                   | VPN enabled                |                      |                       |           |       |

## Flow Checks

For each matrix row, verify:

- Homepage creates a session and shows a QR code plus copyable join link.
- Guest opens the QR or join link and reaches waiting-for-approval state.
- Host sees the guest device label and can reject pairing.
- Rejected guest sees a rejected state and cannot signal.
- Guest repeats the join request and host approves pairing.
- Both devices reach connected state.
- Host sends one small file to guest.
- Guest sends one small file to host.
- Host sends multiple files in one transfer.
- Guest sends multiple files in one transfer.
- Host sends one large-ish file appropriate for the device and network.
- Guest sends one large-ish file appropriate for the device and network.
- Progress updates during each transfer.
- Completed files can be saved or downloaded.
- Cancel works during an active transfer.
- Retry appears for retryable transfer failures.
- Ending the session disconnects both devices.
- Expired sessions cannot be joined.

## Accessibility Checks

- Keyboard can create or refresh a session.
- Keyboard can copy the join link.
- Keyboard can choose files.
- Keyboard can approve and reject a peer.
- Keyboard can end the session.
- Keyboard can cancel, retry, and save transfers.
- QR and link controls have accessible labels.
- Transfer statuses include text or symbols and do not rely on color alone.
- Focus states are visible.
- Mobile buttons are at least 44px tall.
- Text remains readable and unclipped on phone-sized screens.

## Performance And Memory Checks

- Sender remains responsive while sending multiple files.
- Sender remains responsive while sending a large-ish file.
- Backpressure prevents the tab from becoming unresponsive on slow networks.
- Received file download URLs stop working after ending or leaving the session.
- Closing one tab during transfer marks the peer as disconnected or failed.
- Refreshing the homepage repeatedly does not permanently exhaust normal session creation limits.

## Known Issues

| Issue | Severity | Browser pair | Network | Repro steps | Owner | Status |
| ----- | -------- | ------------ | ------- | ----------- | ----- | ------ |
|       |          |              |         |             |       |        |
