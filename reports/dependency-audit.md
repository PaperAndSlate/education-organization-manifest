# Dependency audit evidence

The committed lockfile is the dependency source for reproducible local installation. The dependency
gate checks that workspace references use `workspace:*`, external dependencies are not pulled from
unversioned Git/HTTP URLs, and the lockfile contains workspace importers.

```powershell
pnpm install --frozen-lockfile
pnpm dependency:check
```

This offline repository check does not claim that an online advisory database is current or that a
deployment has zero vulnerabilities. Before stable publication, maintainers must run the selected
advisory scanner against the exact lockfile, review parser/crypto/network dependencies, and record
the result with an owner and date.
