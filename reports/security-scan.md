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

The local scan is not a substitute for an independent penetration test, CodeQL run, or deployment
review. No private key, credential, student record, or sensitive source snapshot belongs in a release
artifact.
