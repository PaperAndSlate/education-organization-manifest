# EOM conformance fixtures

The fixture corpus is offline and synthetic. `valid/core` reuses the committed minimal core
publication fixtures; `invalid/` contains diagnostic captures that must produce a non-conforming
report. The expected result records are intentionally small and do not contain school or student
data.

The runner reads only JSON publication files from a supplied capture directory. It never follows
`href` values or makes DNS, HTTP, or other network requests. A live publisher/consumer exchange is
a separate external pilot gate and is not implied by a local report.

Profiles are versioned by URI in `@paperandslate/eom-testkit`:

- `publisher-core`;
- `consumer-core`;
- `generator`;
- `validator`;
- `module`;
- `signature-optional`.
