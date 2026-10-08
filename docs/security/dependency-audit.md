# Dependency audit

Last checked: 2026-10-08.

`npm audit` reports 54 findings (45 high, 9 moderate, none critical) from four advisories. npm counts every package that depends on a vulnerable one, so one advisory under jest or Metro shows up dozens of times. The production audit of the three workspaces that ship to the server (`npm audit --omit=dev -w backend-node -w shared -w frontend-unified`) reports 3 moderate findings, all from `sprintf-js`, and nothing at high or above; CI fails that step at `--audit-level=high`.

## Overrides

The root `package.json` forces these versions. Each is scoped to the package that pins the old one, where npm allows it.

| Override                                 | Replaces | Advisory                                                  | Ships in                                      |
| ---------------------------------------- | -------- | --------------------------------------------------------- | --------------------------------------------- |
| `compression` ^1.8.2                     | 1.8.1    | the advisory on 1.8.1 (moderate)                          | development only (`@expo/cli`)                |
| `shell-quote` ^1.12.0                    | 1.9.0    | command injection in `quote()` (critical)                 | development only                              |
| `prisma` > `mysql2` ^3.24.5              | 3.15.3   | GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3 (high, moderate) | server image (the Prisma CLI runs migrations) |
| `@prisma/config` > `deepmerge-ts` ^8.0.2 | 7.1.5    | GHSA-ggr8-5vv4-36mx (high)                                | server image (Prisma's config loader)         |
| `xcode` > `uuid` ^11.1.1                 | 7.0.3    | uuid below 11.1.1 (moderate)                              | development only (Expo's iOS config plugins)  |

Adding an override takes two steps. `npm install` alone keeps the version already in the lockfile, and `npm ls` then reports it as invalid, which is most likely what an earlier attempt ran into when "forcing overrides broke the tree". Run `npm update <package>` after editing `overrides` so npm resolves it again, then check `npm ls <package>`.

Remove an override once the package that pinned the old version moves past it on its own (Prisma for `mysql2` and `deepmerge-ts`, `xcode` or Expo's config plugins for `uuid`): delete the entry, `npm install`, and confirm `npm ls` and `npm audit` show the same versions.

## Accepted findings

None of these has a fixed release that the tree can use. The latest `braces`, `node-forge` and `sprintf-js` are inside their advisories' ranges.

| Package                      | Severity | Advisory            | Path                                                                                           | Ships in                                                           | Why it's accepted                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `braces` 3.0.3               | high     | GHSA-vfj7-8cjw-p6xm | `micromatch` under jest (mobile tests) and Metro (`@expo/metro`, `@expo/metro-config`)         | development and build only                                         | Stack exhaustion on deeply nested glob patterns. The patterns come from the project's own configuration, never from users. 3.0.3 is the latest release.                                                                                                                                                                                                     |
| `node-forge` 1.4.0           | high     | GHSA-86w9-cpqp-85rv | `@expo/cli` and `@expo/code-signing-certificates` under `expo`                                 | build tooling only                                                 | RSA PKCS#1 v1.5 signature verification. The Expo CLI uses it to sign and check update manifests (EAS Update code signing), which this project doesn't use. 1.4.0 is the latest release.                                                                                                                                                                     |
| `sprintf-js` 1.0.3           | moderate | GHSA-hp3w-g68c-fv3c | `mammoth` > `argparse` 1.0.10; `@istanbuljs/load-nyc-config` > `js-yaml` 3 > `argparse` (jest) | server image (with `mammoth`), never loaded; otherwise development | Denial of service through unbounded precision specifiers. Only `mammoth`'s command-line tool (`bin/mammoth`) loads `argparse`; the server imports the library, which never does. 1.1.3 is the latest release, and a `mammoth` without `argparse` would be years older.                                                                                      |
| `decode-uri-component` 0.2.2 | moderate | GHSA-vcc3-ghjq-m6fr | `expo-router` > `query-string` 7.1.3                                                           | mobile app                                                         | Exponential decoding of malformed percent-encoded input: at worst a stall in the app on the phone that opens such a link. The fixed 0.5.0 (and every release from 0.3.0) is an ES module with a default export; `query-string` 7 `require()`s it and calls the result, which is then not a function, so an override breaks routing. Waits on `expo-router`. |

## Checking again

```bash
npm audit                                                            # everything
npm audit --omit=dev -w backend-node -w shared -w frontend-unified   # what ships to the server, as CI runs it
npm ls mysql2 deepmerge-ts uuid decode-uri-component                 # the overridden and accepted versions
```

When a fix appears (a new release outside an advisory's range, or Prisma, Expo or `expo-router` moving to a fixed version), take it, delete its row above, and update the totals and the date. If it was an override's reason, remove the override as described above.
