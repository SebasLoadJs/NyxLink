# NyxLink 5.3 — release candidate and stable runbook

**Status: PREPARATION ONLY.** This document is not permission to publish. The development manifest is still `0.1.0-dev.3`; neither `v5.3.0-rc.1` nor `v5.3.0` is created by this procedure.

## Versions and distinct immutable tags

| Stage | Git | `package.json.version` | `publishConfig.tag` | npm |
| --- | --- | --- | --- | --- |
| Development | `dev` branch | `0.1.0-dev.N` | `dev` | Optional explicitly approved development release |
| First candidate | `v5.3.0-rc.1` tag | `5.3.0-rc.1` | `next` | `nyxlink@5.3.0-rc.1` (opt-in) |
| Candidate fix | `v5.3.0-rc.2` tag | `5.3.0-rc.2` | `next` | New immutable candidate; **never rewrite rc.1** |
| Stable | `v5.3` branch + `v5.3.0` tag | `5.3.0` | `latest` | `nyxlink@5.3.0` |

A Git tag and an npm version are **separate artifacts**. Publishing the package, updating an npm dist-tag, and creating a GitHub Release are independent actions. Do not equate a passing workflow, a tag, and a published npm package.

## Before selecting a candidate commit

- Close known critical/high defects; freeze functional scope. Do not silently downgrade backend-specific missing capabilities to “supported.”
- Require **all checks on the same final candidate SHA**: Node 22/24 strict TypeScript, coverage, public declarations, packed CommonJS/ESM consumers, package file/secret policy, production dependency audit, CodeQL, baseline/modern NodeLink and Lavalink integration, pinned Lavalink plugin integration and Redis contracts where configured.
- Run the extended backend endurance gate for **at least 600 seconds** and preserve the report for the exact candidate revision. A 30-second smoke is not sufficient.
- Run preliminary **authorized real Discord voice** acceptance before promoting the RC: NodeLink `--commands`, `--reconnect`, and crossfade `--armed`; Lavalink `--commands` and `--reconnect`. A second participant must check audibility, overlap, correct volume and dropouts. Follow [live-voice-verification.md](live-voice-verification.md). Do not commit tokens, fixture URLs or private reports.
- Finish [license-attribution-review.md](license-attribution-review.md), including source-level Moonlink attribution and assets; resolve legal questions with qualified review where necessary.
- Confirm real npm ownership/write permission for package `nyxlink` and availability of the intended version in the public registry; check GitHub tag and Release permissions.
- Obtain explicit authorization for the **candidate** publication, separately from authorization for the **stable** publication.

Record the final candidate SHA, individual Actions URLs, image digests, duration of the endurance run, location of private voice reports, and reviewer decisions in private release evidence. Do not mark an unobserved voice test as passed.

## Prepare an RC without publishing

On a clean `dev` checkout, after freezing the candidate:

1. Set `package.json.version` to `5.3.0-rc.1` and `publishConfig.tag` to `next`. Update the lockfile if package metadata change requires it.
2. Run the complete mandatory suite in [release-5.3-plan.md](release-5.3-plan.md), including real backend and 600-second tests, against **the new version commit**. Confirm package `version` is reflected in the compiled public API.
3. Inspect a clean `npm pack --dry-run` and `pnpm run test:package` report; verify `LICENSE`, `NOTICE.md` and absence of secrets.
4. Only when the candidate SHA is approved, create an **annotated** Git tag `v5.3.0-rc.1` pointing to that exact commit; do not move the tag later.
5. On the tagged checkout, validate its exact release ref:

```sh
GITHUB_REF=refs/tags/v5.3.0-rc.1 pnpm run release:check-tag
```

The ref check is read-only and **only checks manifest/version/tag consistency**. It does not verify CI, npm account ownership, the tag's remote object, audio quality, or approval to publish. The CI workflow must supply an authentic `GITHUB_REF`; setting an environment variable manually is not evidence of a remote tag.

## Explicit RC publication and package acceptance

After the user approves the RC, publish the tagged, reviewed package to **`next`**, not `latest`. The existing `.github/workflows/npm-publish.yml` deliberately does not publish; do not assume a green workflow has uploaded anything.

```sh
# Execute only on the reviewed RC tag, with authorized npm credentials:
npm publish --access public --tag next
npm view nyxlink@5.3.0-rc.1 version dist.tarball dist.integrity
npm dist-tag ls nyxlink
node scripts/test-package.cjs --registry
```

The `--registry` test must run with the RC version in the checked-out manifest and the required installed development tools. Verify a fresh independent bot can install `nyxlink@5.3.0-rc.1` (or `nyxlink@next`), import the API and complete the manual real Discord acceptance tests. Confirm npm `latest` **has not changed**.

If a defect requires changing code, prepare **`rc.2`** on a new commit and repeat the gates. Never overwrite an existing npm version or mutate an accepted candidate tag.

## Stable gate and release

- Require all RC acceptance results: consumer install from **public npm**, real Discord audible playback/reconnect and crossfade where supported, documented limitations, dependency/security clearance, licenses and attribution review, migration notes and no blocking defects.
- Freeze the accepted implementation, update the manifest to **`5.3.0` / `latest`** on a **new commit** (the version change means the stable commit SHA cannot equal the RC commit SHA).
- Re-run required CI and packaging checks on that exact stable commit, plus targeted live acceptance for any changed runtime behavior.
- Create the protected `v5.3` branch and annotated `v5.3.0` tag from that approved stable commit; run `release:check-tag` for `refs/tags/v5.3.0`.
- Only with separate explicit stable publication approval, create the GitHub Release and publish `nyxlink@5.3.0` to npm `latest`. Then verify a clean install and the public `npm view nyxlink version` value.

Keep `v5.2` untouched. Preserve the previous known-good deployment for rollback; npm packages are immutable and a published `latest` tag change must be managed explicitly rather than assumed reversible.

## Stop conditions

No candidate or stable publication if **any** required job is failing/unverified on its SHA, live audio remains unobserved, ownership/license clearance is missing, the package includes private data, registry or tag identity differs, or release approval has not been recorded. Avoid tagging from a partially validated development commit.
