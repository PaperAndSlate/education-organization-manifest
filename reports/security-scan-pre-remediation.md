# Pre-remediation security scan evidence

Status: historical, superseded, and preserved for audit provenance.

- Scan: `7d2b34bb-c4b0-4fe1-a167-e5e80b31e363`
- Target revision: `f1aaa66324e99b3c8f04c7325e7cdb485951deaa`
- Scope: the pre-remediation implementation baseline
- Findings: six confirmed security and plan-conformance defects

The findings were:

1. canonical JSON serialization dropped an own `__proto__` property;
2. the CLI allocated an unbounded file before applying its size limit;
3. generator output replacement had a pathname time-of-check/time-of-use race;
4. iCalendar mapping accepted carriage-return/line-feed injection;
5. mapping adapters lacked local resource limits; and
6. the browser signature verifier did not match the Node verifier's protected-field checks.

This artifact is evidence of the starting state, not evidence of a current vulnerability or a
completed fix. The six items are now represented by executable characterization/regression coverage
and hardened implementations. They must remain closed only while the aggregate verification and
post-remediation formal scan pass. The earlier five-finding audit summary is superseded by this
correction; no historical scan result is silently rewritten.
