# EOM v1 Remediation Audit

Status: RC3 remediation is incomplete. The repository contains uncommitted remediation changes,
so no current aggregate verification or release claim is valid; the post-remediation security
result below is evidence for this exact working-tree snapshot only.

## Baseline and historical evidence

- The 194 files listed by `plans/pack-manifest.json` remain byte-for-byte unchanged. The generated
  traceability artifacts bind each file to its recorded SHA-256 digest.
- The remediation branch is the review target, but the current source changes have not yet been
  committed in a clean release revision.
- RC1 and RC2 artifacts and their reports are preserved as immutable historical evidence and are
  superseded for current acceptance. They are not evidence for RC3.
- The checked-in `release/v1.0.0-rc.3/` directory is also a stale candidate packet from an earlier
  source revision. Its generated status, checklist, and scan artifacts are preserved for audit
  history but are superseded and must not be read as current RC3 acceptance evidence.
- The durable pre-remediation formal scans are recorded in
  [`security-scan-pre-remediation.md`](security-scan-pre-remediation.md) and
  [`security-scan-pre-remediation-current.md`](security-scan-pre-remediation-current.md). The
  latter records the five findings from the current pre-patch Standard scan; neither is evidence
  that the present working tree is clean or remediated.

## Remediation scope

The implementation work addresses package-boundary safety, generator ownership and partial-build
modes, DNS-bound transport, final-URL delegation authority, finite delegation lifetimes and key
scopes, versioned signature lifetime binding, CLI behavior, browser-safe validation, conformance
evidence, 194-file traceability, release reproducibility, and truthful status reporting.

Focused characterization and regression checks pass for the changes currently in the worktree.
An earlier worktree-only post-remediation Standard scan (`77d6ca39-cf5a-4506-afd0-481bb7803bb1`)
is superseded and is not evidence for this revision; no clean-revision post-remediation scan is
claimed yet. The worktree is still uncommitted, so this is remediation evidence rather than
clean-commit release evidence.
The aggregate `pnpm verify` receipt, release packet, and generated traceability status remain
stale or unavailable for this source revision and must be regenerated only after a clean commit.
RC3 therefore remains an unissued working-draft candidate.

## External gates intentionally retained

IANA registration, independent publisher/consumer interoperability, legal review, governance
approval, production deployment, and adoption/certification remain explicitly blocked or pending.
They require named external owners and evidence in [`external-gates.md`](external-gates.md).

## Current exit blockers

- Commit the complete remediation on a clean revision and regenerate the receipt and traceability.
- Rerun the post-remediation Standard scan on the clean release commit; a dirty-tree scan cannot
  bind release evidence to that commit.
- Run the aggregate local gate, package/release reproducibility, browser/accessibility, and
  cross-platform checks; only then issue new RC3 evidence.
- Keep the external gates listed above blocked; they are not silently converted into local
  completion.
