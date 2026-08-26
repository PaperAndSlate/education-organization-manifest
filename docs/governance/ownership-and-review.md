# Ownership and review matrix

EOM separates source ownership from publication/release authority. A source owner may propose a
change to the files they maintain; that does not authorize a release,
change the protocol, or permit private data to enter a public publication. The repository
CODEOWNERS file routes changes, while the matrix below describes the review evidence required for a
change to be accepted.

## Path and review matrix

| Change area                                                        | Required technical review            | Required safety review                            | Release authority                                       |
| ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| `examples/**/source/**`                                            | module/source owner                  | privacy and security when the module is sensitive | release owner after generated drift and validation pass |
| `schemas/**`, `spec/1.0/**`                                        | schema and specification maintainers | security/privacy impact                           | change controller and release owner                     |
| `packages/validator/**`, `packages/linter/**`                      | validator maintainers                | security/privacy review                           | release owner                                           |
| `packages/signatures/**`, `packages/authority/**`, delegation data | security maintainers                 | security review and adversarial fixtures          | release owner                                           |
| `modules/**`, `vocabularies/**`, `mappings/**`                     | module/vocabulary or mapping owner   | privacy, licensing, and compatibility review      | release owner                                           |
| `scripts/**`, `.github/workflows/**`                               | maintainers                          | supply-chain/security review                      | release owner                                           |
| `release/**`, package versions, generated output                   | release maintainers                  | reproducibility, license, and provenance checks   | release owner; never inferred from source ownership     |

## Required change evidence

Every pull request that changes a protocol, schema, module, vocabulary, mapping, generator,
validator, privacy boundary, or release artifact records:

1. the requirement IDs and specification sections affected;
2. the source owner and independent publication reviewer;
3. valid, principal-invalid, privacy/security, extension, and compatibility fixtures as applicable;
4. generated output, type, documentation, and conformance drift results;
5. the compatibility and migration impact; and
6. the exact local gate or external evidence that remains pending.

CODEOWNERS is a routing aid, not proof that a review occurred. A release must have a clean,
committed source revision and cannot be approved solely by a department or vendor source owner.
External registration, independent interoperability, legal review, and governance approval remain
explicit release blockers until their evidence is recorded.
