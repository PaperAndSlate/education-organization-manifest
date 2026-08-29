# EOM 1.0 Validation and Lint Findings

Structural validation checks JSON syntax, schema dialect, required fields, types, and unknown properties. Semantic validation checks IDs, references, language defaults, dates, course graphs, capability/resource agreement, authority/delegation, provenance pointers, and profile rules. Linting reports quality, freshness, accessibility, provenance coverage, interoperability, and policy recommendations. A warning is never mislabeled as a schema failure.

Findings have stable `code`, `severity`, `category`, `message`, resource, JSON Pointer, related references, and remediation help. Exit codes distinguish success, findings, usage/configuration, transport, internal failure, and signature/security policy failure. Local operation uses bundled schemas and no remote `$ref` by default.

Semantic validation MUST use bounded work when comparing attacker-controlled collections. In particular, course-code effective-period comparisons MUST enforce explicit comparison and finding budgets, emit the error finding `EOM_SEMANTIC_WORK_LIMIT` when a budget is exhausted, and stop the bounded check rather than continuing unbounded pairwise work. Consumers MUST treat that finding as a failed validation result. Implementations SHOULD preserve the input pointer and explain how to reduce the comparison set.

Publication graph consumers MUST validate the root manifest before using its resource declarations as a fetch frontier. A fetched resource MUST pass structural and semantic validation, descriptor identity/subject binding, and authority checks before its own declarations may expand the graph. An invalid or unauthorized document may be retained for diagnostics but MUST NOT authorize additional retrieval.
