# EOM 1.0 Validation and Lint Findings

Structural validation checks JSON syntax, schema dialect, required fields, types, and unknown properties. Semantic validation checks IDs, references, language defaults, dates, course graphs, capability/resource agreement, authority/delegation, provenance pointers, and profile rules. Linting reports quality, freshness, accessibility, provenance coverage, interoperability, and policy recommendations. A warning is never mislabeled as a schema failure.

Findings have stable `code`, `severity`, `category`, `message`, resource, JSON Pointer, related references, and remediation help. Exit codes distinguish success, findings, usage/configuration, transport, internal failure, and signature/security policy failure. Local operation uses bundled schemas and no remote `$ref` by default.
