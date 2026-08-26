# EOM v1 Remediation Audit

Status: local implementable remediation complete, including the final formal security workbench
scan; external protocol, legal, governance, adoption, and deployment gates remain blocked or pending.
This report supersedes completion claims made by the pre-remediation phase reports.

## Baseline evidence

- The 194 files listed by `plans/pack-manifest.json` match their recorded byte lengths and SHA-256
  digests; the planning pack remains unchanged.
- The audited baseline was captured in the repository root commit before remediation began.
- The baseline ran 77 tests and a 75-check Ecme publisher report, but those checks did not cover the
  complete planning-pack acceptance criteria.
- `pnpm audit --prod --audit-level=low` reported no known registry vulnerabilities at audit time.

## Confirmed gaps

| Area             | Baseline finding                                                                                                      | Required remediation                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Package delivery | Package exports pointed at omitted source files; schema assets were repository-relative.                              | Export compiled `dist` entry points, bundle schema assets, and smoke-test packed packages.               |
| Generator safety | Configured output could replace an unsafe or unrelated directory.                                                     | Enforce protected roots, generated markers, symlink checks, and safe atomic replacement.                 |
| Network safety   | DNS was checked before a separate unbound `fetch` resolution.                                                         | Pin validated addresses to the connection and test rebinding.                                            |
| CI               | `pnpm/action-setup` used a non-existent commit pin.                                                                   | Use the verified v4.1.0 commit and validate all action pins.                                             |
| Source control   | The baseline had no commit and every project file was untracked.                                                      | Keep a reviewable commit history and require clean revision-bound releases.                              |
| Traceability     | Broad rows marked incomplete feature families verified.                                                               | Track atomic requirements, fixtures, commands, and evidence honestly.                                    |
| Modules          | Registry omitted required metadata; most modules shared a fixture and lacked principal invalid cases.                 | Add registry schema, full metadata, module-specific rules, fixtures, mappings, and conformance coverage. |
| Vocabularies     | No versioned vocabulary artifact directory existed.                                                                   | Add versioned, licensed, multilingual vocabulary snapshots and validation behavior.                      |
| CLI              | `init`, `diff`, and `migrate` were absent and existing commands were narrower than planned.                           | Complete command contract, reports, graph operations, and migrations.                                    |
| Conformance      | Profiles mostly repeated local parse/validate/lint checks and lacked consumer/generator behavior tests.               | Implement role-specific profiles, golden cases, publisher servers, and consumer adapters.                |
| Browser tools    | Playground used a duplicate shallow validator and restricted YAML parser.                                             | Share the real schema/semantic engine through a browser-safe bundle and complete planned tools.          |
| Quality gates    | Linting, drift, docs links, dependency checks, release checks, and accessibility coverage were shallow.               | Replace placeholders with authoritative checks and CI enforcement.                                       |
| Release evidence | SBOM versions were requested ranges; archives were not source-revision checked; reports overclaimed local completion. | Use exact lockfile resolutions, clean-tree checks, reproducibility checks, and accurate RC status.       |

## External gates intentionally retained

IANA registration, independent publisher/consumer pilots, legal review, governance approval, and
production deployment remain blocked or pending until evidence is supplied. Local implementation
work must not change those statuses.

## Remediation evidence

The following local gates passed on 2026-08-26 after the source-revision-bound implementation
tranche: frozen install, formatting, build, typecheck, 106 unit/integration tests, coverage
(68.20% lines, 65.42% branches, 78.42% functions), real ESLint, policy/security/license/dependency
checks, schema/vocabulary/module/ownership/fixture gates, five browser tests, deterministic builds,
94 example files, docs/link checks, nine conformance profiles, Ecme conformance, clean packed-package
imports, production advisory audit, release checks, and byte-identical release reproducibility via
the aggregate `pnpm verify` gate.
The release candidate is `1.0.0-rc.2`; its provenance is bound to a committed source revision and
its local provenance remains explicitly unsigned.

The final formal Standard security scan completed against committed revision `36c63a8` with complete
coverage and zero reportable findings (scan `8e9bca1f-06a0-45d4-b915-cff64614cbcf`). The historical
baseline scan (`5866a611-8be4-444f-bac0-da13abf62d27`) remains preserved with four findings and is
superseded by the remediation commits. Hosted Linux/Windows/macOS CI and CodeQL/dependency-review/
secret/REUSE jobs remain configured local evidence plus required remote gates.

## Exit condition

The local implementation exit condition is met: the atomic traceability matrix, historical phase
reports, definition of done, conformance reports, release checklist, formal security result, and
aggregate executable verification output now agree. Historical reports remain immutable evidence;
their earlier completion claims are superseded rather than rewritten. External gates remain open
until their named owners supply the evidence recorded in `reports/external-gates.md`.
