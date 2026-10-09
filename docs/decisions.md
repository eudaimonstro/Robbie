# Decisions

The product and hosting decisions Robbie is built on, with the date each was made and where it was built. The designs behind most of them are in [`design/`](design/README.md); what is planned and what is left out is in [`mvp-roadmap.md`](mvp-roadmap.md).

Several of these were first written down in `spec.md`, the finishing spec of 2026-10-05, which the MVP roadmap replaced; it was removed on 2026-10-08 (`git show 0f62050:spec.md` has it).

## Product

- **One product, Robbie (2026-10-06).** "Robbie-Bylawyer" was the monorepo's name. The app says Robbie everywhere; the documents side (bylaws, amendments, minutes) is a section of it. Packages and folders keep their old names (`@robbie-bylawyer/*`, `bylawyer/` in the server).
- **Phones use the web app (2026-10-06).** People join by link or QR code in the phone's browser. The Expo app was frozen on 2026-10-06, retired on 2026-10-08 (it never spoke the slim update protocol) and removed in #56.
- **People without a device count (2026-10-06).** Most homeowners will never have an account. The organization records its voting members (the quorum's denominator); the chair marks members present from the roster and enters a headcount of people without an account, with names when wanted. Quorum is members on a device, members marked present and the headcount (and paper proxies and absentee ballots held, since #54) over the voting members. A vote is the device votes plus the chair's count of the room; the counts the chair enters are kept apart from device data and shown separately, so the room can check them.
- **A locked phone keeps its vote (2026-10-06).** A dropped connection keeps its member present for 90 seconds, and a member back during a vote can vote in it.
- **Meeting roles come from the organization (2026-10-06).** At every join: the packet's presiding officer chairs, secretaries and above are admins, members are members, anyone else signed in with the code is a non-voting guest until the meeting adjourns. Nothing is kept in memory or in an environment variable (`ADMIN_EMAILS` is gone).
- **One design language (2026-10-06).** `docs/design-brief.md`, on the tokens in `frontend-unified/src/styles/index.css`, for the whole app.
- **Vote thresholds are the organization's (2026-10-05; built in #53).** Bylaw amendments need two thirds or a majority, of the votes cast or of all the voting members, as the organization's bylaws say; other questions follow Robert's Rules.
- **Fewer motions, each correct end to end (2026-10-08, #52).** Robbie offers the motions an HOA meeting uses and makes each work in the state, the screens and the minutes; the rest are refused rather than half-working. The list and what to use instead: `docs/RONR_IMPLEMENTATION_STATUS.md`.
- **Live updates are coalesced and slimmed, not replayed (2026-10-08, #50).** The server sends a room the latest state at most every quarter second, compressed, with the meeting log and the decided motions as only what was added since (`StateUpdatePayload.tails`). Replaying actions to clients instead would leak secret ballots.
- **Versions are the record (2026-10-08, #48).** Only a document's current version changes; earlier versions stay as adopted. Deleting a document, an earlier version or an organization is a real delete that leaves an `AuditEntry`, not a soft delete.
- **Minutes are their own record (2026-10-07, #43).** One Markdown text per meeting (draft, published, approved), written from the meeting's records, not a versioned document.
- **The notice is a courtesy (2026-10-08, #55).** Robbie emails and prints a meeting's notice; the bylaws and state law set the official one.
- **Abuse handling is a script, not a screen (2026-10-08, #47).** Reported files are preserved and removed from the server with `handleReport` (`docs/deploy.md`, "Handling a report").

## Hosting (2026-10-05)

- **One server.** The owner's DigitalOcean droplet, with Docker Compose (the app, Postgres, backups and Caddy) and no Redis: the live meetings' state and the rate limits are per process. Postgres runs in the stack, not on the host, so its volume and backups stay together.
- **Images are built by CI.** The droplet (1 vCPU, 1.9 GiB RAM) runs out of memory on the Vite and TypeScript builds, so CI builds and publishes to GHCR and the server only pulls (`docs/deploy.md`).
- **Domain:** `robbie.scouch.dev`. `scouch.dev` is registered at Name.com and expires 2026-12-10 (keep auto-renew on); DNS is on Cloudflare, where the root serves GitHub Pages. The A record for `robbie` is DNS only, so Caddy gets its Let's Encrypt certificate over HTTP. Proxying it through Cloudflare later needs SSL mode Full (strict), an origin certificate (Cloudflare's, or Caddy's Cloudflare DNS plugin) and ufw limiting 80 and 443 to Cloudflare's ranges.
- **Email: Resend over HTTPS.** DigitalOcean blocks outbound SMTP (465 and 587) on the droplet, so the Resend provider uses its HTTPS API. The sending domain is the subdomain `robbie.scouch.dev`, which keeps the app's reputation apart from `scouch.dev`, with DKIM, SPF, a bounce MX and DMARC (starting at `p=none`), and a sending-only API key. Production refuses to start without `EMAIL_FROM`, since the code's fallback sender is on a domain nobody owns.

The droplet as surveyed on 2026-10-05:

| Item     | Value                                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Address  | 157.245.128.187                                                                                                                           |
| OS       | Ubuntu 24.04.5 LTS, kernel 6.8                                                                                                            |
| Size     | 1 vCPU, 1.9 GiB RAM, 48 GB disk                                                                                                           |
| SSH      | sshd on port 4444, bound to the Tailscale address only (`100.118.73.91`, tailnet name `vps`), key plus TOTP (`sshd_config.d/99-2fa.conf`) |
| Firewall | ufw active                                                                                                                                |
| Docker   | Engine 29.1.3 from Ubuntu's `docker.io` (the Compose plugin is installed as the runbook's first step)                                     |

Host chores outside the runbook, open as of the survey:

- fail2ban is installed but failed. sshd isn't public, so it adds little; if kept, it likely needs `backend = systemd` for Ubuntu 24.04's journal-only logging.
- `sshd_config` line 135 has a stale `AuthenticationMethods publickey`. It has no effect (`99-2fa.conf` is read first and sshd keeps the first value) but misleads.
- Deploys are by hand (`docs/deploy.md`, "Upgrades"). Automating them would need a `deploy` user exempt from the TOTP prompt for tailnet addresses only (`Match User deploy Address 100.64.0.0/10`) and CI joining the tailnet with a Tailscale auth key.

## Dependencies held back

- **TypeScript 6.0**, not 7: typescript-eslint doesn't support 7 yet.
- **Prisma 7**: 8 is a release candidate.
- **Node 24 and `@types/node` 24**: the runtime (`.nvmrc`). Node 26 becomes LTS on 2026-10-28; move both together then.
- **React 19.2.3, pinned exactly** at the root with `react-dom`: one copy for the web app and the tests. The reason it was held (Expo pinned it) left with the mobile app, so it can move with the next upgrade.

The overrides and accepted audit findings are in `docs/security/dependency-audit.md`.
