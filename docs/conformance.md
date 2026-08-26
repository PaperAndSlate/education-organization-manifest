# Conformance and interoperability

The repository includes an offline conformance runner in
`@paperandslate/eom-testkit` and the `eom conformance` CLI command. It reads a local captured
publication directory, parses JSON with duplicate-key detection, validates each typed document,
applies the privacy/publication linter, and checks the local manifest resource graph.

```powershell
pnpm conformance
pnpm eom conformance examples/ecme-high/public --profile publisher-core --output reports/local/conformance.json
# For the committed report, run Prettier after writing the CLI's canonical JSON:
pnpm eom conformance examples/ecme-high/public --profile publisher-core --output reports/conformance/ecme-high.json
pnpm exec prettier --write reports/conformance/ecme-high.json
```

Reports name the exact EOM profile URI, implementation version, checks, evidence identifiers, and
status. `conforming` means the supplied local capture passed the named checks. It does not establish
factual correctness, legal compliance, school quality, certification, registration, or paper&slate
endorsement. Identical discovery aliases are accepted only when their bytes are identical.

Available canonical profiles are `core`, `school`, `district`, `module`, `delegated`, `signed`,
`consumer`, `generator`, and `validator`; compatibility aliases are `publisher-core`, `consumer-core`,
and `signature-optional`. Offline mode resolves linked resources only inside the supplied capture.
Publisher mode can target the controlled HTTP fixture server and checks discovery, content type,
redirects, cache metadata, and HEAD behavior. Consumer mode accepts an explicit adapter contract, and
generator/signed profiles check reproducibility and cryptographic verification respectively. An
independent publisher/consumer exchange remains an external pilot gate under `release/pilot/`.

Invalid one-rule fixtures are retained under `fixtures/invalid/` and the conformance expected-result
records under `fixtures/conformance/`. A report must be regenerated after changing a fixture or
implementation, and the release gate verifies its checksum rather than trusting a hand-edited claim.
