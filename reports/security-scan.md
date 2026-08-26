# Security scan evidence

The repository security gate is offline and deterministic. It checks for private-key material,
credential-shaped tokens, committed environment files, unsafe remote installers, broad workflow
permissions, and the browser playground’s network/XSS boundary. Intentional invalid privacy fixtures
remain test inputs and are not treated as release data.

Run:

```powershell
pnpm verify:security
pnpm test -- --runInBand
```

## Final formal Standard result

The final source-backed Standard workbench scan completed against committed revision `36c63a8`:

- scan: `8e9bca1f-06a0-45d4-b915-cff64614cbcf`;
- coverage: complete across the repository source surfaces;
- reportable findings: zero critical, high, medium, or low findings;
- local aggregate evidence: `pnpm verify` passed, including parser, HTTP, generator, privacy,
  package, browser, conformance, and release checks.

The earlier baseline scan `5866a611-8be4-444f-bac0-da13abf62d27` is preserved as historical evidence
with four findings and is superseded by the remediation commits. Neither scan claims an external
penetration test, CodeQL-hosted result, production deployment review, IANA registration, legal
approval, independent interoperability, or adoption. No private key, credential, student record, or
sensitive source snapshot belongs in a release artifact.
