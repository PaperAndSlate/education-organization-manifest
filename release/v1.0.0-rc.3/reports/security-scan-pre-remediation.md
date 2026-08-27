# Pre-remediation security scan evidence

Status: historical, superseded, and preserved for audit provenance.

- Scan: `5a9b2061-44d3-4203-88ca-0eade4e56e11`
- Scope: the pre-remediation implementation baseline
- Findings: five confirmed security and plan-conformance defects

The findings were:

1. delegated signature key allowlists were not enforced;
2. redirect destinations were not re-authorized against the declared resource;
3. signature expiry metadata was mutable outside the protected signature input;
4. delegated resource subjects were not enforced; and
5. delegations lacked a required finite validity bound.

This artifact is evidence of the starting state, not evidence of a current vulnerability or a
completed fix. Each item is now represented by executable characterization/regression coverage and
must remain closed only while the aggregate verification and post-remediation formal scan pass.
