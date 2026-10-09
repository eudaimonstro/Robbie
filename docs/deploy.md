# Deploying Robbie

Robbie runs on one small Linux server with Docker Compose: the app (the API, the live meetings and the web app in one image), Postgres, a backup service, and Caddy for HTTPS on `robbie.scouch.dev`. Everything the server needs is in `deploy/`; run every `docker compose` command from that directory (`/opt/robbie/deploy` on the server). The design is `docs/superpowers/specs/2026-10-07-ship-design.md`.

```
phones, laptops, the TV ──HTTPS──▶ caddy :443 ──▶ app :3001 ──▶ db :5432 (not published)
                                                    │
                                                    ├─ uploads volume ◀── backup (nightly) ──▶ deploy/backups/
                                                    └─ preserved volume (reported files; never backed up)
```

CI builds the image on every pull request and publishes it from `main` as `ghcr.io/eudaimonstro/robbie:main` and `ghcr.io/eudaimonstro/robbie:sha-<first 7 characters of the commit>`. The server only pulls it: don't build on the server except in the fallback under "Upgrades".

## The server

The target ([`decisions.md`](decisions.md), Hosting): a DigitalOcean droplet, Ubuntu 24.04, 1 vCPU, 1.9 GiB RAM, SSH on port 4444 over Tailscale only (`ssh -p 4444 vps`).

### Prepare the host (once)

As `steve`, with `sudo`:

1. Install the Compose and Buildx plugins, then check Compose:

   ```bash
   sudo apt install docker-compose-v2 docker-buildx && docker compose version
   ```

2. Make a `deploy` user to run Robbie, rather than adding `steve` to the `docker` group (that group is root-equivalent), and give it the directory Robbie lives in:

   ```bash
   sudo adduser --disabled-password --gecos '' deploy && sudo usermod -aG docker deploy
   sudo mkdir -p /opt/robbie && sudo chown deploy:deploy /opt/robbie
   id -u deploy && id -g deploy
   ```

   Note the two numbers: they go in `BACKUP_OWNER` below.

3. Let `deploy` log in with your SSH key, so you can copy backups off the server as `deploy`:

   ```bash
   sudo mkdir -p ~deploy/.ssh && sudo cp ~/.ssh/authorized_keys ~deploy/.ssh/
   sudo chown -R deploy:deploy ~deploy/.ssh && sudo chmod 700 ~deploy/.ssh
   ```

   sshd also asks for a TOTP code (`sshd_config.d/99-2fa.conf`), so give `deploy` its own the way `steve`'s was set up (with the Google Authenticator PAM module, `sudo -iu deploy google-authenticator`), and add it to your authenticator app.

4. Add a 2 GB swap file. The containers don't use it: `compose.yaml` caps each with no swap (`memswap_limit` equal to `mem_limit`: the app 768 MB with a 384 MB Node heap, Postgres 512 MB, Caddy 256 MB, the backups 128 MB; 1.66 GB in all), so a runaway container restarts instead of pushing the box into swap. A 150-phone meeting measured at most 336 MB in the app's limit (386 MB RSS) through six reconnect storms. The swap file is for building the image here ("Upgrades") and the system's own spikes:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

5. Open the web ports, and only those. SSH stays reachable through Tailscale only.

   ```bash
   sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw status
   ```

From here on, work as `deploy`: `sudo -iu deploy`.

### DNS

- `robbie.scouch.dev` has an A record to the server's public address (157.245.128.187) in Cloudflare, **DNS only** (gray cloud), so Let's Encrypt's HTTP challenge reaches Caddy. Check: `dig +short robbie.scouch.dev` prints `157.245.128.187`.
- Email: in Resend, add and verify the domain `robbie.scouch.dev`, and add its DKIM (`resend._domainkey.robbie`), SPF and bounce MX (`send.robbie`) records in Cloudflare (Resend can add them itself). Add a DMARC record: `_dmarc.robbie` TXT `v=DMARC1; p=none;`. Create a **sending-only** API key for that domain. A meeting notice emails every member of an organization at once (one batch request to Resend per 50 people, a second apart; an organization sends at most 3 notices a day): check that the Resend plan's daily and monthly limits cover the largest organization's notice, which is one email per member.

## First deploy

As `deploy` on the server:

1. Get the deploy files. The repository is public, so this needs no key or login:

   ```bash
   git clone https://github.com/eudaimonstro/Robbie.git /opt/robbie
   cd /opt/robbie/deploy && mkdir -p backups
   ```

   Make `backups` yourself, as here: otherwise Docker makes it, owned by root.

2. Settings:

   ```bash
   cp .env.production.example .env && chmod 600 .env
   openssl rand -hex 24
   ```

   Then fill in `.env` (`nano .env`):
   - `ACME_EMAIL`: your email, for certificate notices.
   - `POSTGRES_PASSWORD`: the random string `openssl` just printed.
   - `SERVER_SECRET`: another random string, from `openssl rand -hex 32` (the key of the hashes of sign-in addresses; the server refuses to start without one).
   - `RESEND_API_KEY`: the sending-only key.
   - `BACKUP_OWNER`: the two numbers from `id -u deploy` and `id -g deploy`, as `uid:gid` (the example's `1000:1000` is a placeholder).
   - Keep `ROBBIE_DOMAIN=robbie.scouch.dev`, `APP_URL=https://robbie.scouch.dev`, `EMAIL_FROM=Robbie <noreply@robbie.scouch.dev>` and `ROBBIE_IMAGE=ghcr.io/eudaimonstro/robbie:main`. Leave `CLIENT_ORIGIN` and `DATABASE_URL` unset (compose sets the database address).

   Keep a copy of the finished `.env` somewhere safe, off the server (a password manager): a restore onto a new server needs it.

3. Images: if the GitHub package is private, log in once with a personal access token that has only `read:packages` (it asks for the token as the password):

   ```bash
   docker login ghcr.io -u <github user>
   ```

4. Start, and wait until the app is healthy (migrations run first; a minute at most):

   ```bash
   docker compose pull && docker compose up -d --no-build --wait && docker compose ps
   ```

5. Check:
   - The migrations applied and the server started:

     ```bash
     docker compose logs app | grep -E 'migrations|Server running'
     ```

     It shows the migrations and `Server running on port 3001`. If the app keeps restarting, `docker compose logs app` names every missing setting.

   - The site answers over HTTPS:

     ```bash
     curl -s https://robbie.scouch.dev/api/health
     ```

     It answers `{"status":"healthy","mode":"postgresql"}`.

   - Caddy got its certificate: `docker compose logs caddy | grep -i certificate`.
   - Email works. Send a test email to yourself, and check it arrives (look in spam the first time):

     ```bash
     docker compose exec app node dist/scripts/sendTestEmail.js you@example.com
     ```

   - A backup works: `docker compose run --rm backup once`, then `ls -l backups` shows a `robbie-<stamp>.dump` and an `uploads-<stamp>.tar.gz`, owned by `deploy`.

### The first owner

There is no demo seed in production: **never run `dist/scripts/seedDemo.js` on the server**.

1. Open `https://robbie.scouch.dev` and sign in with your email and the code it sends.
2. Accept the terms.
3. Choose **New organization** and create the HOA. Its creator is its owner.
4. In **Settings**:
   - **Members**: under **Add by email**, add the secretary, the president and the homeowners with their roles. Each gets an email and signs in the same way.
   - **Attendance**: the number of **Voting members** and the **Quorum**.
   - The time zone (America/Chicago unless the HOA is elsewhere).

From the server, `docker compose exec app node dist/scripts/addOrgMember.js --org <slug> --email <email> --role <role>` also adds a member (roles: viewer, member, secretary, admin, owner; the slug is the organization's name in lowercase, with dashes for spaces and punctuation, such as `maple-grove-hoa`).

## Before launch

Before anyone outside the HOA can sign up:

- **The mailboxes:** `privacy@`, `abuse@` and `copyright@robbie.scouch.dev` exist and reach you. The Terms and the Privacy Policy give them (`frontend-unified/src/pages/legal/legalContact.ts`), and a report to `abuse@` may be child sexual abuse material that has to be acted on promptly (see "Handling a report"), so read it daily.
- **The DMCA agent:** register a designated agent with the US Copyright Office at [dmca.copyright.gov](https://dmca.copyright.gov) (a small fee; the registration lapses unless renewed every 3 years, so put the renewal date in a calendar). Then fill in `DMCA_AGENT` in `legalContact.ts` with exactly what you registered (the name, the postal address one line per entry, the phone, and `copyright@robbie.scouch.dev`), and release it. Until then the Terms give only the email, and the safe harbor of 17 U.S.C. 512(c) doesn't apply.
- **No disk-level backups:** droplet Backups off in DigitalOcean, no droplet snapshots, and any host backup tool excluding `/var/lib/docker/volumes/robbie_preserved` (see "Backups"): those would copy reported material along with the disk.
- **Who provides Robbie:** fill in `PROVIDER_NAME` in `legalContact.ts` (the person or company, as the lawyer advises); until then the Terms and the Privacy Policy say "the operator of Robbie".
- **The terms reviewed:** a lawyer reviews the Terms and the Privacy Policy, and the reviewed text replaces the draft (removing the "Draft" note and bumping `TERMS_VERSION`).

## Upgrades

Never within a day of a meeting.

1. Get the current deploy files (the compose file, the Caddyfile and the scripts):

   ```bash
   cd /opt/robbie/deploy && git pull
   ```

2. Back up, and note the two file names it prints:

   ```bash
   docker compose run --rm backup once
   ```

3. Keep the image running now under a local name, for a rollback:

   ```bash
   docker tag "$(docker compose images -q app)" robbie:previous
   ```

4. Choose the image: `ROBBIE_IMAGE` in `.env` is `ghcr.io/eudaimonstro/robbie:main` (the latest build of `main` that passed CI) or a specific build, `ghcr.io/eudaimonstro/robbie:sha-<7 characters>`. The tag for the commit you just pulled is:

   ```bash
   echo "ghcr.io/eudaimonstro/robbie:sha-$(git rev-parse HEAD | cut -c1-7)"
   ```

   If `pull` says that tag isn't found, CI hasn't published that commit (it failed or is still running).

5. Pull and restart. The app migrates the database as it starts.

   ```bash
   docker compose pull app && docker compose up -d --no-build --wait
   ```

6. Check: `docker compose logs app | grep 'Server running'`, then `curl -s https://robbie.scouch.dev/api/health`, then sign in.

Phones in a live meeting reconnect by themselves after a restart (presence survives 90 seconds): the app stops in a second or two, writing the meeting's last changes first, and starts in about one more, and each phone's join brings it the meeting as it is. Upgrade between meetings anyway.

Old images pile up on the disk: `docker image prune` removes the ones no container and no tag uses (`robbie:previous` stays).

**If the image can't be pulled** (GHCR down, no token), build it on the server. It needs the swap file and takes several minutes, and the server may run short of memory, so only when the registry really is out of reach:

```bash
docker compose build app && docker compose up -d --wait
```

Known `npm audit` findings, the overrides that fix the others, and how to check again before an upgrade are in [`security/dependency-audit.md`](security/dependency-audit.md).

### Release notes

- **Onboarding (October 2026):** a meeting opens only once its organization has set its voting members and quorum. Every organization made before this release has neither (its old quorum was a silent 3), so before its next meeting an admin opens **Settings**, **Attendance** and sets them from the bylaws; only an admin can. A meeting already open when you upgrade goes on.

## Rollback

1. Set `ROBBIE_IMAGE=robbie:previous` in `.env` (the image you tagged before upgrading), or the `:sha-<7 characters>` tag of the build you want, then:

   ```bash
   docker compose up -d --no-build --wait
   ```

2. Migrations only move forward. If the release you are leaving changed the database and the old one fails against it, restore the backup you made before upgrading (below); anything entered since that backup is lost.

## Backups

- **What and when:** each day after `BACKUP_HOUR_UTC` (9:00 UTC, 3 or 4 a.m. in Chicago) the `backup` service writes `robbie-<stamp>.dump` (the database) and `uploads-<stamp>.tar.gz` (meeting attachments) to `/opt/robbie/deploy/backups/`, owned by `deploy`, and deletes those older than `BACKUP_KEEP_DAYS` (14). `<stamp>` is the time in UTC, such as `2026-10-08T0900Z`.
- **Check them:** `ls -lh /opt/robbie/deploy/backups` shows a pair for each recent day; `docker compose logs backup` shows each run. A failed run says `Backup failed`, deletes no old backup, and tries again 10 minutes later.
- **Copy them off the server** (a failed server takes its backups with it). From your workstation, over Tailscale, at least weekly and after every meeting:

  ```bash
  rsync -av -e 'ssh -p 4444' deploy@vps:/opt/robbie/deploy/backups/ ~/robbie-backups/
  ```

- **On demand:** `docker compose run --rm backup once`.
- **Not backed up:** the `preserved` volume (files removed after a report; see "Handling a report"). Reported material must not spread into backups or off the server, so the backup service never mounts it. Never delete that volume (`docker compose down -v` would), and carry it over by hand only if the server is replaced while a preserved folder is still to be kept.
- **No disk-level backups:** the `preserved` volume is an ordinary folder on the server's disk (`/var/lib/docker/volumes/robbie_preserved/_data`), so anything that copies the whole disk copies it too: DigitalOcean's droplet Backups and Snapshots, or a host backup tool. Keep droplet Backups off and take no snapshots of the droplet; a host backup tool must exclude `/var/lib/docker/volumes/robbie_preserved`. The backups above are the only ones.

## Restore

CI restores a backup into a fresh stack on every pull request (`deploy/smoke.sh`), so the procedure below is the tested one. It replaces the database and the uploaded files, but only once the whole backup has been read: `restore.sh` checks both files, restores the database into a scratch database (`robbie_restore`) and unpacks the files into a scratch folder, then swaps them in. A backup that fails to restore leaves the database and the files as they were, and says so.

0. Back up what is there now, in case the restore is the mistake:

   ```bash
   cd /opt/robbie/deploy && docker compose run --rm backup once
   ```

1. Stop the app and the backup service (a backup running during the restore would hold the database open, and the restore would refuse to swap it):

   ```bash
   docker compose stop app backup
   ```

2. Restore, naming the two files in `backups/` (leave out the uploads file to restore only the database):

   ```bash
   docker compose run --rm --entrypoint /bin/sh backup /scripts/restore.sh robbie-<stamp>.dump uploads-<stamp>.tar.gz
   ```

3. Start the app and the backup service, then check `curl -s https://robbie.scouch.dev/api/health`, sign in, and open a document and a meeting's attachment:

   ```bash
   docker compose up -d --no-build --wait app backup
   ```

**Onto a new server:**

1. Prepare the host and check DNS as above (point the A record at the new address first).
2. Clone the repository and make `backups`, as in "First deploy" step 1.
3. Put back `deploy/.env` from your safe copy, or make a new one as in step 2 (any `POSTGRES_PASSWORD` works: the backup holds no passwords).
4. Copy the backup files into `/opt/robbie/deploy/backups/`, for example from your workstation:

   ```bash
   rsync -av -e 'ssh -p 4444' ~/robbie-backups/robbie-<stamp>.dump ~/robbie-backups/uploads-<stamp>.tar.gz deploy@vps:/opt/robbie/deploy/backups/
   ```

5. Start only the database, restore (Restore step 2), then start everything:

   ```bash
   docker compose pull && docker compose up -d --wait db
   docker compose run --rm --entrypoint /bin/sh backup /scripts/restore.sh robbie-<stamp>.dump uploads-<stamp>.tar.gz
   docker compose up -d --no-build --wait
   ```

## Logs

- `docker compose logs -f app` follows the app (add `--since 1h` to look back).
- The app logs JSON lines. With `jq` installed (`sudo apt install jq`), this reads just the messages (the migration lines aren't JSON, so `grep` drops them first):

  ```bash
  docker compose logs --no-log-prefix app | grep '^{' | jq -r '.msg'
  ```

- Docker keeps 5 files of 10 MB per service.
- `docker compose ps` shows each service's state and the app's health.

## The night of a meeting

**The day before**

- No upgrades. `curl -s https://robbie.scouch.dev/api/health` is healthy; `df -h /` has room.
- A backup: `docker compose run --rm backup once`, copied off the server (the `rsync` under "Backups").
- In Robbie, on **Live Meetings** (`/meetings`): the meeting is on the schedule with the right presiding officer, time and place, its agenda and its attachments. The agenda has an item for the minutes, such as "Approval of the minutes of the 2025 annual meeting".
- **Settings**, **Attendance**: the number of voting members and the quorum are right. Until they are set, no meeting can open.
- **Minutes**: last year's minutes are published, so the meeting can approve them.
- A real sign-in with an email the app hasn't seen: the code arrives within a minute.
- Sign in on the laptops for the TV and for the chair now (a sign-in lasts 30 days), so nobody waits for a code at the venue.

**At the venue, before people arrive**

1. **Wi-Fi:** get the guest network's name and password, and check a phone on it opens `https://robbie.scouch.dev`. Robbie works on mobile data too: that is the fallback.
2. **The chair's laptop:** plugged in, signed in as the presiding officer. On **Live Meetings**, **Start** opens the console at `/meetings/<CODE>` (everyone else sees **Join**). If the agenda changed since anyone opened the meeting, **More**, then **Reload the agenda**, before the call to order.
3. **The TV or projector:** a laptop signed in as anyone in the organization (a viewer is enough), opened to `https://robbie.scouch.dev/meetings/<CODE>/display`, full screen, with sleep and screen savers off and the power plugged in. If the chair's laptop drives the TV, the console's **Display** button opens it in a new window to drag there. Before the call to order the display shows the meeting code and a QR code.
4. **The QR code:** scan it from the back of the room with one phone on the venue Wi-Fi and one on mobile data; both open the meeting after sign-in.
5. **An iPhone, in Safari, on the venue Wi-Fi:** join the meeting signed in as a member and leave it open. Within a few seconds, without reloading anything, the TV's attendance count goes up by one and the console lists them as present. When the chair calls the meeting to order, that iPhone should change by itself. If the count doesn't move, reload the page once; if it still doesn't, ask people to use mobile data.
6. **One test sign-in on the venue Wi-Fi** with a homeowner's real email. The server allows 300 code requests per network address per 15 minutes, and everyone on the venue Wi-Fi shares one address: a room larger than that should spread sign-ins out or use mobile data.
7. **Paper:** a printed agenda and a sheet for the names of people without a phone, for the secretary.

**During the meeting** (the chair's console)

- **People arriving late:** after the call to order the display shows the business, not the QR code; **Join info** on the console shows the code and the QR code again.
- **A member without a phone:** under **Attendance**, find them in the roster and choose **Mark present**. They count for the quorum and the minutes. Someone added by email who never signed in is on the roster as "Added, not yet signed in": **Mark present** counts them in the room by name (the headcount and its names go up by one). If they sign in later in the meeting, the panel says they are counted twice and takes them out of the headcount with one tap.
- **People in the room without an account:** enter how many under **Headcount**, optionally their names for the minutes, then **Save the headcount**. They count for the quorum. A new headcount replaces the last.
- **Paper proxies and absentee ballots:** enter how many are held under **Proxies and absentee ballots held** (same form, **Save the headcount**). They count toward the quorum and show apart on the console, the TV ("40 here, 21 by proxy or absentee ballot") and in the minutes.
- **Votes:** members vote on their phones. For people voting by show of hands, enter the counts under **In the room** and choose **Enter the count** before **Close the vote**. With the method **Voice vote or show of hands**, the vote can't close until the count is in.
- **Elections:** the tellers' count of paper ballots goes under **Paper ballots in the room**, then **Enter the paper ballots**.
- **The minutes:** at the minutes item, the console asks "Are there any corrections to the minutes?"; choose **Approve as read** or **Approve with corrections** (type the corrections).
- **Adjourn** is the main action at the last agenda item; it asks first and lists any items not reached.

**After**

- Robbie drafts the minutes at the adjournment. The secretary edits them under **Minutes** and publishes them; the next meeting approves them.
- A bylaw amendment the meeting adopted is already a new version of the bylaws.
- A backup, copied off the server.

## Handling a report

Reports come to `abuse@robbie.scouch.dev` (illegal or abusive content) and `copyright@robbie.scouch.dev` (copyright notices), as the Terms say. Uploaded files are the only content people can't see outside their organization, so most reports name a file: a meeting's attachment. Everything here runs on the server, from `/opt/robbie/deploy`, with `handleReport.js` in the app's image (its working directory is `/app/backend-node`). It never prints or opens a file's contents.

**Find the attachment's id.** A link to the file ends in `/api/attachments/<id>/download`. Otherwise list the recent uploads with their organization and meeting, and match the report's description (this reads only the records, never the files):

```bash
docker compose exec -T db psql -U robbie -d robbie <<'SQL'
SELECT a.id, a."displayName", a."uploadedBy", a."uploadedAt", p."robbieCode", o.name AS organization
FROM "Attachment" a
LEFT JOIN "MeetingAgendaItem" i ON i.id = a."agendaItemId"
JOIN "MeetingPacket" p ON p.id = COALESCE(a."meetingPacketId", i."packetId")
JOIN "Organization" o ON o.id = p."organizationId"
WHERE a.type = 'uploaded_file'
ORDER BY a."uploadedAt" DESC
LIMIT 20;
SQL
```

**The script:**

```bash
# Preserve the file and its record in /data/preserved, then remove it from Robbie. Check first with --dry-run.
# --kind is csam, copyright or other, and is recorded: csam is never restored.
docker compose exec app node dist/scripts/handleReport.js --attachment <id> --kind <kind> --note "<the report: who, when, what>" --dry-run
docker compose exec app node dist/scripts/handleReport.js --attachment <id> --kind <kind> --note "<the report: who, when, what>"

# After a valid copyright counter-notice: put the file back where it was (refused for anything marked CSAM)
docker compose exec app node dist/scripts/handleReport.js --restore <folder> --note "<the counter-notice: who, when>"

# After a CyberTipline report: record it on the preserved folder (the year to keep it runs from the report)
docker compose exec app node dist/scripts/handleReport.js --record-report <folder> --reported-at <2026-10-09> --report-id <report number>

# Suspend an account (no sign-in; every session ends, and open meeting connections close within a minute), or lift it
docker compose exec app node dist/scripts/handleReport.js --suspend <email>
docker compose exec app node dist/scripts/handleReport.js --unsuspend <email>
```

With the app stopped, `docker compose run --rm app node dist/scripts/handleReport.js ...` does the same (it starts the database if it isn't running).

`--attachment` copies the file into its own folder in the `preserved` volume (`/data/preserved/<time>-<id>/`, readable only by the app's user), writes `manifest.json` beside it (the attachment's id, display name, file name, type, size, SHA-256, who uploaded it and when, the organization, the meeting, the agenda item, when it was preserved, how long to keep it, and your note), checks the copy's SHA-256 against the original's, and only then deletes the original file and then the attachment. If a delete fails it says so; run the same command again and it finishes from the copy it made. A file already missing from disk is refused unless you add `--missing-ok`. It prints the folder. To read a manifest (records only, never the file):

```bash
docker compose exec app ls /data/preserved
docker compose exec app cat /data/preserved/<folder>/manifest.json
```

Keep every preserved folder and its manifest at least until the manifest's `keepAtLeastUntil`, a year after it was preserved. A folder reported to the CyberTipline has `keepUntil` once the report is recorded (`--record-report`), a year after the report: keep it until then or until law enforcement releases it, whichever is later. Afterwards delete it only when no report or request about it is open: `docker compose exec app rm -r /data/preserved/<folder>`. The nightly backups leave the `preserved` volume out (see "Backups"). Robbie records who uploaded a file (`uploadedBy`) from this release on; files uploaded earlier show `null`, and Robbie keeps no IP addresses.

### Child sexual abuse material

1. **Don't open, download, view or forward the file**, and don't ask the person reporting it to send it. Work only from the report and the records. Possessing or distributing it is a crime; the steps below keep the one copy the law requires, on the server.
2. **Preserve and remove it** right away: find its id, then `--attachment <id> --kind csam --note "CSAM report from <who>, received <date>"` (a `--dry-run` first to check it's the right file).
3. **Suspend the uploader:** `--suspend <uploadedBy from the manifest>`. Under the Terms the account is closed: it stays suspended.
4. **Report it to NCMEC's CyberTipline** at [report.cybertip.org](https://report.cybertip.org) as soon as reasonably possible, as 18 U.S.C. 2258A requires once you know of it. Give what the manifest records: the uploader's email and account, when it was uploaded, the file's name, type, size and SHA-256, and the organization and meeting it was in, plus how you learned of it. Don't upload the file from the server; if NCMEC or law enforcement wants it, follow their directions.
5. **Record the report on the preserved folder**, with the date you submitted it and the report number NCMEC gives: `--record-report <folder> --reported-at <date> --report-id <number>`. The manifest then has `reportedAt`, `reportId` and `keepUntil`, a year after the report. Keep the report number with the folder's name in your own records too, off the server.
6. **Keep the preserved folder and manifest until a year after the report (`keepUntil`) or until law enforcement releases it, whichever is later** (18 U.S.C. 2258A(h), as amended by the REPORT Act), and let no one else at it: it is on the server only, readable only by the app's user, and never in a backup. Never copy it off the server except as law enforcement directs.
7. **The older uploads backups still hold the file.** Take a new backup now (`docker compose run --rm backup once`), then delete the `uploads-*.tar.gz` files taken while the file was there, on the server and in every copy off it (your workstation's `~/robbie-backups/`). The preserved copy is the one the law requires; other copies are only a risk. If you ever restore one of those older backups, run `--attachment` for it again.
8. **Don't tell the user why** beyond what the Terms say: the account was closed for breaking them. Telling them more can warn someone under investigation. Answer law enforcement's questions and legal process through your lawyer.

### Copyright notices

1. **Check the notice** has what 17 U.S.C. 512(c)(3) asks for (the Terms list it): a signature; the copyrighted work; the material and where it is in Robbie; the sender's contact details; the good-faith statement; and the statement that it is accurate, under penalty of perjury, from the owner or someone authorized to act for them. If the work, the material and a way to reach the sender are there but something else is missing, write back asking for it. A notice without those three isn't one.
2. **Remove the material promptly:** `--attachment <id> --kind copyright --note "DMCA notice from <who>, dated <date>"`. Don't suspend the uploader for a first notice.
3. **Tell the uploader** (the manifest's `uploadedBy`): what was removed and why, with the notice's substance, and that they can send a counter-notice to `copyright@robbie.scouch.dev` if it was removed by mistake or misidentification.
4. **A counter-notice** must have the uploader's signature; the material and where it was before it was removed; a statement under penalty of perjury that they believe in good faith it was removed by mistake or misidentification; their name, address and phone; and their consent to the federal district court for their address (or, outside the US, any district where Robbie may be found) and to accept service from the person who sent the notice. Send a copy to the person who sent the notice promptly, saying the material comes back in 10 business days. Then, 10 to 14 business days after the counter-notice arrived, unless that person has told you meanwhile that they have gone to court, restore it: `--restore <folder> --note "Counter-notice from <who>, dated <date>"` (a `--dry-run` first). It puts the attachment back, with its id, on the same agenda item or meeting, copies the file back under a new name and checks it against the manifest's SHA-256, and marks the manifest restored; the preserved copy stays. If the agenda item or the meeting has since been deleted, it refuses: tell the uploader they may upload it again. Then tell the uploader it is back.
5. **Repeat infringers:** keep a log off the server (date, sender, account, attachment id, outcome). An account with three notices that stood (no successful counter-notice) is suspended for good with `--suspend`; a flagrant case sooner. That is the repeat-infringer policy the Terms promise, and the safe harbor depends on applying it.

### Other abuse

- **Malware**, or a file that harms people (threats, harassment, someone's private information): preserve and remove it the same way (`--kind other`), without opening it, and suspend the uploader if it was deliberate. Telling the organization's owner what was removed, and why, is usually right.
- **Anything else illegal:** preserve and remove it, and ask your lawyer before reporting it or answering anyone about it.
- **A request from law enforcement** for records or files: through your lawyer, and only with legal process (a subpoena, a court order or a warrant), except an emergency involving danger of death or serious injury.

## Troubleshooting

- **`docker compose` refuses to start with "Set POSTGRES_PASSWORD in .env" or "Set ACME_EMAIL in .env":** that setting is blank in `.env`.
- **The app restarts in a loop:** `docker compose logs app` names every missing setting (the database, an email provider, `EMAIL_FROM`, `APP_URL`) and refuses `ENABLE_TEST_AUTH=true`.
- **No certificate:** the A record must be DNS only and point here, and ports 80 and 443 open (`sudo ufw status`); `docker compose logs caddy`.
- **Sign-in codes don't arrive:** the Resend dashboard's logs; the domain's DNS records verified; the test email under "First deploy".
- **A notice says some emails couldn't be delivered:** the server logs each by its domain ("A meeting notice couldn't be delivered"), and Resend's dashboard has the reason (a bounced address, the plan's limit).
- **Everyone gets "Too many requests":** `TRUST_PROXY` must be 1 (compose sets it; a warning at start-up says when it isn't).
- **`docker compose pull` is refused:** a private package needs `docker login ghcr.io` (under "First deploy"); a token that expired needs a new one.
