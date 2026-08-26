---
'@paperandslate/eom-adapters': patch
'@paperandslate/eom-agentic': patch
'@paperandslate/eom-authority': patch
'@paperandslate/eom-cli': patch
'@paperandslate/eom-config': patch
'@paperandslate/eom-conformance-runner': patch
'@paperandslate/eom-core': patch
'@paperandslate/eom-generator': patch
'@paperandslate/eom-linter': patch
'@paperandslate/eom-schema': patch
'@paperandslate/eom-schemaorg-adapter': patch
'@paperandslate/eom-signatures': patch
'@paperandslate/eom-testkit': patch
'@paperandslate/eom-types': patch
'@paperandslate/eom-validator': patch
---

Remediate EOM v1 package safety, schema coverage, conformance tooling, and release evidence. RC3 introduces explicit generator build modes and ownership markers, final-URL authority evaluation with delegation key and subject scope, finite delegation lifetimes, and versioned structured signature lifetime metadata. RC2 delegation records without `validUntil` and RC2 signatures using the legacy protected `eom` string require migration by re-signing. This remains a working-draft release candidate and does not claim registration, certification, adoption, or production approval.
