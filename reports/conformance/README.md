# Conformance reports

`ecme-high.json` is a deterministic local report for the complete fictional Ecme High publication
under the EOM 1.0 Core Publisher Profile. Its `conforming` status applies only to the captured
fixture and named local checks. It is not independent interoperability evidence, certification,
registration, legal approval, factual verification, or paper&slate endorsement.

Regenerate it with:

```powershell
pnpm eom conformance examples/ecme-high/public --profile publisher-core --output reports/conformance/ecme-high.json
pnpm exec prettier --write reports/conformance/ecme-high.json
```
