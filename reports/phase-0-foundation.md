# Phase 0 Report — Research, Charter, and Governance Foundation

> Historical bootstrap report. Its phase-local statements are retained for provenance, but its
> completion claims are superseded for current release acceptance by
> [`reports/remediation-audit.md`](remediation-audit.md) and the rebuilt traceability matrix.

- Date: 2026-08-25
- Commit/branch: local bootstrap; no remote or release commit
- Owner: paper&slate / Codex implementation
- Planned scope: planning-pack inventory, charter, naming/status, standards boundaries, governance/licensing, threat/privacy baseline, architecture ADRs, traceability, issue taxonomy, agent prompts, and repository scaffolding
- Result: complete for the local foundation slice; external review and registration remain open gates

## Executive summary

The approved planning pack was read and checksum-verified before product implementation: 194 files are
listed in `plans/pack-manifest.json`, with the manifest itself accounting for the 195-file total. The
repository now has a strict pnpm/TypeScript baseline, source-of-truth and status documents,
governance/security/contribution policies, licensing metadata, pinned CI/runtime configuration,
architecture ADRs, RFC scaffolding, versioned draft specification entry points, the complete prompt
library, a living requirement matrix, risks, and release evidence surfaces. No IANA registration,
pilot, certification, legal approval, or production-readiness claim is made.

## Requirements completed or advanced

| Requirement family   | Implementation                                                                               | Tests/evidence                                            | Status                          |
| -------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| Governance/licensing | `GOVERNANCE.md`, `CONTRIBUTING.md`, `LICENSE`, `LICENSES/`, `REUSE.toml`, `docs/governance/` | `node` JSON parse; path checks; review policy             | in-progress                     |
| Name/registration    | `docs/project-status.md`, `spec/1.0/iana-registration.md`, RFC-0001                          | status wording is explicit; external registry not claimed | blocked-external for acceptance |
| Architecture         | `spec/adrs/0001`–`0010`, `docs/architecture/`, `turbo.json`                                  | ADR review against blueprint                              | in-progress                     |
| Agentic workflow     | `AGENTS.md`, `prompts/`, `prompts/prompt-catalog.yaml`                                       | prompt inventory and safety contract                      | in-progress                     |
| Traceability         | `requirements/TRACEABILITY_MATRIX.md`                                                        | all seed families mapped to planned artifacts             | in-progress                     |
| CI/release baseline  | `.github/`, `.nvmrc`, `.npmrc`, `reports/`                                                   | lockfile generation and toolchain checks                  | in-progress                     |

## Commands run

```text
node --version                         pass: v24.17.0
pnpm --version                         pass: 10.6.0
pnpm install --lockfile-only           pass: lockfile generated
node -e JSON.parse(package.json)       pass
git diff --check                       pass
planning-pack SHA-256 traversal       pass: 194 listed files, 0 mismatch (195 including manifest)
```

## Security and privacy impact

The baseline records the permanent exclusion of student-level/private data, the separation of publication authority from source ownership, SSRF/parser requirements for future tooling, no-direct-publication agent workflow, and no-secret policy. Executable enforcement and adversarial tests belong to later phases.

## Compatibility and migration impact

No released protocol/schema behavior changed. EOM 1.0 is a working draft; the proposed suffix and schemas are not immutable releases yet. Package metadata pins Node 24.17.0 and pnpm 10.6.0 for this implementation baseline.

## Ecme High/example impact

No generated public example was published in this phase. The planning sample remains the source brief for later synthetic fixtures.

## External blockers

IANA acceptance, independent publisher/consumer interoperability, legal review, public consensus, school approval for real data, and third-party certification require external evidence. The repository will prepare complete packages and keep status wording accurate.

## Next phase entry criteria

The next Worker must implement the minimal schema/validator/CLI vertical slice, establish the exact normative structural model, and convert the illustrative Ecme inputs into passing and intentionally failing executable fixtures before adding all modules.
