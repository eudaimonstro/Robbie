# Dependency audit

Last checked: 2026-10-08, after the mobile app left the workspaces (#56).

`npm audit` reports 3 moderate findings, none high or critical, all from one advisory: `sprintf-js` under `mammoth` (npm counts the package and the two that depend on it). The production audit of the three workspaces that ship to the server (`npm audit --omit=dev -w backend-node -w shared -w frontend-unified`) reports the same 3; CI fails that step at `--audit-level=high`.

Removing the Expo app took its tooling with it (jest, Metro, the Expo CLI, `expo-router`), and with it the 51 other findings this page used to list (`braces`, `node-forge`, `decode-uri-component`) and two overrides (`compression`, `xcode` > `uuid`).

## Overrides

The root `package.json` forces these versions, each scoped to the package that pins the old one where npm allows it. Each is still needed: the package named pins the old version exactly.

| Override                                 | Replaces                         | Advisory                                                  | Ships in                                      |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `shell-quote` ^1.12.0                    | 1.9.0 (pinned by `concurrently`) | command injection in `quote()` (critical)                 | development only (`npm run dev`)              |
| `prisma` > `mysql2` ^3.24.5              | 3.15.3                           | GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3 (high, moderate) | server image (the Prisma CLI runs migrations) |
| `@prisma/config` > `deepmerge-ts` ^8.0.2 | 7.1.5                            | GHSA-ggr8-5vv4-36mx (high)                                | server image (Prisma's config loader)         |

Adding an override takes two steps. `npm install` alone keeps the version already in the lockfile, and `npm ls` then reports it as invalid. Run `npm update <package>` after editing `overrides` so npm resolves it again, then check `npm ls <package>`.

Remove an override once the package that pinned the old version moves past it on its own (`concurrently` for `shell-quote`, Prisma for `mysql2` and `deepmerge-ts`): delete the entry, `npm install`, and confirm `npm ls` and `npm audit` show the same versions.

## Accepted findings

| Package            | Severity | Advisory            | Path                          | Ships in                                    | Why it's accepted                                                                                                                                                                                                                                                                                         |
| ------------------ | -------- | ------------------- | ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sprintf-js` 1.0.3 | moderate | GHSA-hp3w-g68c-fv3c | `mammoth` > `argparse` 1.0.10 | server image (with `mammoth`), never loaded | Denial of service through unbounded precision specifiers. Only `mammoth`'s command-line tool (`bin/mammoth`) loads `argparse`; the server imports the library (reading `.docx` bylaws), which never does. 1.1.3 is the latest release, and `npm audit fix --force` would install a `mammoth` years older. |

## Checking again

```bash
npm audit                                                            # everything
npm audit --omit=dev -w backend-node -w shared -w frontend-unified   # what ships to the server, as CI runs it
npm ls shell-quote mysql2 deepmerge-ts sprintf-js                    # the overridden and accepted versions
```

When a fix appears (a release outside an advisory's range, or `concurrently`, Prisma or `mammoth` moving to a fixed version), take it, delete its row above, and update the totals and the date. If it was an override's reason, remove the override as described above.
