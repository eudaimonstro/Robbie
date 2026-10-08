# Deploying Robbie

Robbie runs on one small Linux server with Docker Compose: the app (the API, the live meetings and the web app in one image), Postgres, a backup service, and Caddy for HTTPS on `robbie.scouch.dev`. Everything the server needs is in `deploy/`; run every `docker compose` command from that directory (`/opt/robbie/deploy` on the server). The design is `docs/superpowers/specs/2026-10-07-ship-design.md`.

```
phones, laptops, the TV ──HTTPS──▶ caddy :443 ──▶ app :3001 ──▶ db :5432 (not published)
                                                    │
                                                    └─ uploads volume ◀── backup (nightly) ──▶ deploy/backups/
```

CI builds the image on every pull request and publishes it from `main` as `ghcr.io/eudaimonstro/robbie:main` and `ghcr.io/eudaimonstro/robbie:sha-<first 7 characters of the commit>`. The server only pulls it: don't build on the server except in the fallback under "Upgrades".

## The server

The target (`spec.md` M12): a DigitalOcean droplet, Ubuntu 24.04, 1 vCPU, 1.9 GiB RAM, SSH on port 4444 over Tailscale only (`ssh -p 4444 vps`).

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

4. Add a 2 GB swap file (Node, Postgres and Caddy fit in 1.9 GiB with little headroom):

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
- Email: in Resend, add and verify the domain `robbie.scouch.dev`, and add its DKIM (`resend._domainkey.robbie`), SPF and bounce MX (`send.robbie`) records in Cloudflare (Resend can add them itself). Add a DMARC record: `_dmarc.robbie` TXT `v=DMARC1; p=none;`. Create a **sending-only** API key for that domain.

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

Phones in a live meeting reconnect by themselves after a restart (presence survives 90 seconds), but upgrade between meetings anyway.

Old images pile up on the disk: `docker image prune` removes the ones no container and no tag uses (`robbie:previous` stays).

**If the image can't be pulled** (GHCR down, no token), build it on the server. It needs the swap file and takes several minutes, and the server may run short of memory, so only when the registry really is out of reach:

```bash
docker compose build app && docker compose up -d --wait
```

Known `npm audit` findings, the overrides that fix the others, and how to check again before an upgrade are in [`security/dependency-audit.md`](security/dependency-audit.md).

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
- **Settings**, **Attendance**: the number of voting members and the quorum are right.
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
- **A member without a phone:** under **Attendance**, find them in the roster and choose **Mark present**. They count for the quorum and the minutes.
- **People in the room without an account:** enter how many under **Headcount**, optionally their names for the minutes, then **Save the headcount**. They count for the quorum. A new headcount replaces the last.
- **Votes:** members vote on their phones. For people voting by show of hands, enter the counts under **In the room** and choose **Enter the count** before **Close the vote**. With the method **Voice vote or show of hands**, the vote can't close until the count is in.
- **Elections:** the tellers' count of paper ballots goes under **Paper ballots in the room**, then **Enter the paper ballots**.
- **The minutes:** at the minutes item, the console asks "Are there any corrections to the minutes?"; choose **Approve as read** or **Approve with corrections** (type the corrections).
- **Adjourn** is the main action at the last agenda item; it asks first and lists any items not reached.

**After**

- Robbie drafts the minutes at the adjournment. The secretary edits them under **Minutes** and publishes them; the next meeting approves them.
- A bylaw amendment the meeting adopted is already a new version of the bylaws.
- A backup, copied off the server.

## Troubleshooting

- **`docker compose` refuses to start with "Set POSTGRES_PASSWORD in .env" or "Set ACME_EMAIL in .env":** that setting is blank in `.env`.
- **The app restarts in a loop:** `docker compose logs app` names every missing setting (the database, an email provider, `EMAIL_FROM`, `APP_URL`) and refuses `ENABLE_TEST_AUTH=true`.
- **No certificate:** the A record must be DNS only and point here, and ports 80 and 443 open (`sudo ufw status`); `docker compose logs caddy`.
- **Sign-in codes don't arrive:** the Resend dashboard's logs; the domain's DNS records verified; the test email under "First deploy".
- **Everyone gets "Too many requests":** `TRUST_PROXY` must be 1 (compose sets it; a warning at start-up says when it isn't).
- **`docker compose pull` is refused:** a private package needs `docker login ghcr.io` (under "First deploy"); a token that expired needs a new one.
