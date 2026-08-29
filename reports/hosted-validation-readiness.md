# Hosted validation readiness

This report records the engineering changes and hosted execution evidence that
prepare the repository for remote validation after the local RC3 evidence
phase. It is not an RC3 release report and does not rebind the existing RC3
evidence.

## Evidence boundary

The preserved RC3 evidence remains bound to:

- source revision `c42b3df9e1670db80c41275eba1eba2058f22c13`;
- source tree `3157225c89e3a66f6988bfe3f08c8929dc2b230d`;
- final evidence repository revision `c5b659281f0393e60282d68adaf209b92e9f1466`;
- formal Standard scan `d4abb4f5-1f16-4cdd-9122-d24528efbbdb`.

Hosted-readiness changes are post-RC3 source changes. A future release packet
must be regenerated and rescanned from the commit that contains them; this
report must not be used as evidence that the existing RC3 packet covers them.

## Hosted execution evidence

The implementation candidate at source revision
`661c0b5c0385ff990872c3a3571895507eaaa8c8` completed the following pull-request
workflows successfully:

- [CI run 33223565091](https://github.com/PaperAndSlate/education-organization-manifest/actions/runs/33223565091): all six Ubuntu, Windows, and macOS jobs passed for Node `24.17.0` and `24.x`.
- [CodeQL run 33223565098](https://github.com/PaperAndSlate/education-organization-manifest/actions/runs/33223565098): pull-request JavaScript/TypeScript analysis passed; SARIF upload was intentionally skipped for the untrusted PR event.
- [Supply-chain and security run 33223565104](https://github.com/PaperAndSlate/education-organization-manifest/actions/runs/33223565104): dependency review, secret scan, REUSE, and local-security jobs passed.

The matrix jobs ran the complete `pnpm verify:hosted` surface described below,
including clean package packing/consumer imports, browser and accessibility
tests, deterministic generation, examples, documentation, conformance, and
hosted structural traceability. These runs are hosted implementation evidence,
not a release publication, certification, or external interoperability result.
The exact run identities for any later report-only or evidence-only revision
must be read from the pull-request check rollup rather than inferred from this
candidate entry.

## Hosted workflow coverage

| Workflow                | Hosted coverage                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                | Ubuntu, Windows, and macOS; Node `24.17.0` and the latest Node `24.x`; frozen pnpm install; Chromium browser setup; `pnpm verify:hosted`; retained diagnostics.                               |
| `codeql.yml`            | Ubuntu JavaScript/TypeScript CodeQL analysis after a frozen install and build.                                                                                                                |
| `security.yml`          | Pull-request dependency review, full-history secret scanning, REUSE compliance, action/workflow policy, repository security policy, dependency/license checks, and production advisory audit. |
| `release-candidate.yml` | Manual candidate-only execution of the release-bound `pnpm verify`, Linux browser dependencies, and retained release evidence. It is not the arbitrary-PR gate.                               |

The matrix job names are derived from the operating system and Node value and
should be required individually in branch protection. The repository owner
must configure the protected default branch to require the six CI matrix jobs,
CodeQL, secret scanning, REUSE, and local security checks. Dependency review
should be required on pull requests. Require current CODEOWNERS approval for
protocol, schema, vocabulary, security, release, documentation, and example
ownership paths; dismiss stale approvals, require conversation resolution, and
disallow force-pushes to the protected branch. These are repository settings,
not claims that hosted branch protection is already configured.

## PR-safe validation boundary

`pnpm verify:hosted` runs the build, schema/vocabulary/module and fixture
checks, conformance profiles, generated drift, typecheck, unit/integration
tests, coverage, browser/accessibility tests, lint and policy checks, security,
license, dependency and production audit checks, clean package packing and
consumer imports, conformance, deterministic generation, examples, docs, and
traceability. It intentionally excludes `pnpm verify`, `pnpm verify:record`,
`pnpm release:check`, and `pnpm verify:release-reproducibility`: those commands
consume or produce exact source-bound release evidence and cannot honestly be
used as a generic pull-request check while the candidate packet is bound to a
different revision.

The durable result of the final traceability command is generated at
`reports/verification/traceability-result.json`. Hosted CI invokes that command
with the explicit `hosted-structure` mode, which records the checked repository
revision, source revision, planning-pack and traceability digests, file counts,
status, mode, and any failure details without treating the old RC3 aggregate
receipt as current evidence. The strict default mode still validates
`reports/verification/local-gates.json` for release work. A running or failed
result is not a successful traceability result; only a passed result carries a
source-revision claim. A hosted-structure result is not release evidence.

## Platform and environment controls

- Every hosted job uses a bounded timeout, workflow concurrency, explicit
  read-only repository permissions, SHA-pinned actions, and checkout with
  credential persistence disabled.
- CI sets `TZ=UTC` and disables Git automatic line-ending conversion. The
  repository's generators normalize archive paths, sort directory entries, use
  OS temporary directories, reject symlink escapes, and compare bytes rather
  than filesystem metadata.
- Chromium runs on all three operating systems. Linux installs Playwright's
  system dependencies; the hosted Windows and macOS runner images provide the
  corresponding browser libraries, so running the Linux package on those hosts
  would be invalid.
- Browser tests use the repository's local Python HTTP server and loopback
  origin. They do not require an internet service or ambient credentials.
- Package smoke tests use the pinned pnpm version, clean temporary installation
  roots, package-local exports, and runtime/type imports. Release reproducibility
  remains in the manual candidate workflow because it must compare the exact
  source-bound packet.
- Hosted diagnostics retain coverage, Playwright output, test results, and the
  traceability result for 14 days in CI and 30 days for a manual candidate.

## Workflow security posture

No workflow uses `pull_request_target`, broad write permissions, shell-piped
remote installers, or persisted checkout credentials. CodeQL's
`security-events: write` permission is scoped to its analysis job; all other
workflow permissions remain read-only. Fork pull requests must be treated as
untrusted: they receive no repository secrets, and maintainers should inspect
the CodeQL upload result on a same-repository push if GitHub does not permit a
fork result upload. The workflows do not grant a fork a path to publish,
release, deploy, or modify repository state.

Actions are pinned to the verified commit list enforced by
`pnpm actions:check`. Dependabot is configured for npm and GitHub Actions
updates. Dependency review, secret scanning, REUSE, the production advisory
audit, and repository policy checks remain separate jobs so a passing build
cannot hide a supply-chain failure.

## DEP0169 investigation

The warning was reproduced with `NODE_OPTIONS=--trace-deprecation pnpm
packages:check` while the clean package smoke tests still passed for all 15
packages. The stack identifies the exact chain as:

`Corepack pnpm 10.6.0` → `toNerfDart` → `getAuthHeadersFromConfig` →
`createGetAuthHeaderByURI` → `createClient` → `createNewStoreController` →
Node's `url.parse()` implementation.

The repository contains no first-party `url.parse()` call; first-party URL
handling uses the WHATWG `URL` API. The warning is therefore transitive inside
the pinned Corepack-bundled pnpm implementation, not an actionable repository
defect. No unnecessary dependency upgrade was made. The warning should be
rechecked when the supported pnpm baseline is intentionally updated.

The initial hosted run also printed the same Node deprecation family while
starting `gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c`
(v2.3.9), before its organization-license preflight failed. That wrapper is a
third-party Node action with bundled `@actions/*` and Octokit dependencies; it
is not part of the EOM source or package smoke path. The workflow now invokes
the upstream Gitleaks CLI from an immutable image, mounts the checkout
read-only, and disables container networking after image retrieval, so the
commercial wrapper and its dependency warnings are no longer on the hosted
scan path.

## External and hosted gates

This report does not claim CodeQL findings, dependency review results,
branch-protection configuration, IANA registration, independent
interoperability, legal or governance approval, pilots/adoption, deployment,
or stable publication. Those require the actual hosted or external evidence
and remain pending or blocked as previously recorded. The hosted execution
results above are limited to the named implementation candidate and do not
satisfy the external gates.
