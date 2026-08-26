# EOM Risk Register

| ID    | Risk                                             | Priority | Control/evidence                                                                 | Owner              | Status           |
| ----- | ------------------------------------------------ | -------: | -------------------------------------------------------------------------------- | ------------------ | ---------------- |
| R-001 | Proposed suffix is rejected or collides.         |        5 | Registration packet, accurate working-draft status, and dated external recheck.  | Registration owner | blocked-external |
| R-002 | Root grows into a data dump.                     |        4 | Size lint, linked modules, resource indexes.                                     | Specification      | open             |
| R-003 | U.S.-specific assumptions leak into core.        |        4 | International types, multilingual fixtures, profile review.                      | Schema             | open             |
| R-004 | Student/private data is published.               |        5 | Schema boundary, privacy linter, quarantine, human review.                       | Privacy            | open             |
| R-005 | Transport/facility data creates safety exposure. |        5 | Public-only fields, security review class, adversarial fixtures.                 | Security           | open             |
| R-006 | Delegated vendor creates false authority.        |        5 | Origin/path/resource/time scope, revocation, non-transitivity.                   | Protocol/security  | open             |
| R-007 | Agent inference overwrites facts.                |        5 | Evidence ledger, candidate workspace, no direct publication.                     | Agent workflow     | open             |
| R-008 | Schema/prose/example drift.                      |        5 | Traceability, generated docs, conformance, drift check.                          | Release            | controlled       |
| R-009 | Generator output is non-deterministic.           |        4 | Canonical ordering, repeated clean-build comparison, and release archive hashes. | Tooling            | controlled       |
| R-010 | URL tooling enables SSRF.                        |        5 | Public-IP checks, redirect revalidation, bounded fetcher.                        | Security           | open             |
| R-011 | Signature is mistaken for factual truth.         |        4 | Separate verification results and documentation.                                 | Security/docs      | open             |
| R-012 | External release gate is overstated.             |        5 | Blocked status package, release wording tests, and no-registration claim policy. | Governance         | controlled       |
