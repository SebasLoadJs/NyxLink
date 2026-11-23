# License, provenance and publication acceptance — NyxLink v5.3

**Status: implementation and packaging evidence added; legal sign-off pending.**

## Source and attribution inventory

| Item | Current repository evidence |
| --- | --- |
| Original project | [Moonlink.js](https://github.com/Ecliptia/moonlink.js), maintained by 1Lucas1apk and contributors |
| NyxLink derivative | [NyxLink source history](https://github.com/SebasLoadJs/NyxLink) |
| License in package metadata | `OSL-3.0` in `package.json` |
| Complete license | `LICENSE` (the OSL v3.0 text) |
| Prominent derivative notice | `NOTICE.md`, listed in `package.json.files` |
| Readme credit | Original Moonlink author/contributors and source acknowledged |
| Packaged notice validation | `scripts/check-package.cjs` and `scripts/test-package.cjs` |

The OSL v3.0 includes preservation of existing source-level attribution
notices and obligations relating to derivative source and distribution.
This checklist is an engineering record, **not a legal conclusion**.

## Verified upstream comparison — 2026-11-23

The license text in [Moonlink.js upstream](https://github.com/Ecliptia/moonlink.js/blob/main/LICENSE) and [NyxLink](https://github.com/SebasLoadJs/NyxLink/blob/dev/LICENSE) has the **same Git blob SHA**: `cee9c3cff349671ef36ff601176679e452f3e5a5`. This verifies byte-identical OSL-3.0 license files, not full derivative-work or distribution compliance.

The upstream default-branch `package.json` identifies the package as `moonlink.js`, version `5.2.0`, with OSL 3.0 metadata. The NyxLink package name and `OSL-3.0` identifier differ in spelling only at the metadata level. NyxLink's `NOTICE.md` explicitly credits Moonlink and references the upstream source; an upstream root `NOTICE.md` was not present at the checked path. This absence **does not** imply that all source-level notices or contributor rights have been reviewed.

Remaining unknowns: provenance and distribution rights for `assets/nyxlink_banner.png`, other incorporated assets and any copied external snippets; upstream notices outside the checked paths; npm package ownership and legal approval. None has been marked cleared.

## Automatic checks for every release candidate

- Install the **packed tarball**, not the local working tree.
- Confirm `LICENSE` and `NOTICE.md` are included and their contents match
  the repository's tracked files.
- Reject unexpected environment files, runtime databases, log files,
  credentials, fixture media or source files from the package.
- Verify the exact public API and types in isolated CommonJS and ESM consumers.
- Run production dependency audit and CodeQL against the candidate SHA.

## Still requiring review before publication

1. Compare original Moonlink source-level copyright, licensing and attribution
   notices against NyxLink's derivative files and generated `dist` artifact.
2. Check contributors' upstream license grants for any imported work, assets,
   plugin integration examples or image materials not originating in Moonlink.
3. Confirm terms and attribution for separately distributed bundled images.
4. Verify the user's npm access/ownership of the `nyxlink` package and the
   credentials and GitHub Release permissions used by the release process.
5. Review OSL obligations for source availability and external deployments
   with qualified legal counsel if the distribution arrangement requires it.
6. Repeat automated checks on the immutable `5.3.0-rc.N` commit before any
   publication decision.

**Do not silently relicense the upstream work.** The final release must not
be tagged or published until the attribution review, package integrity,
ownership checks and live voice acceptance all pass.
