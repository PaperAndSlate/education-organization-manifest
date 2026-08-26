# Requirement Traceability Matrix Template

Codex must instantiate this template as `project/requirements.csv` or an equivalent machine-readable file plus a rendered Markdown view.

## Fields

| Field | Meaning |
|---|---|
| ID | Stable requirement ID, e.g. `EOM-CORE-001` |
| Source | Approved decision/spec/RFC/user requirement |
| Requirement | Testable statement |
| Priority | must/should/may |
| Phase | planned delivery phase |
| Owner | implementation/review owner |
| Specification | normative section |
| Schema | schema path/JSON Pointer |
| Implementation | source package/files |
| Tests | test/fixture IDs |
| Documentation | guide/reference pages |
| Privacy class | public/personal-public/high-review/etc. |
| Security notes | threat/control references |
| Compatibility | semver/migration impact |
| Status | proposed/in-progress/verified/blocked/deferred |
| Evidence | CI run, report, external decision |
| Blocker | external/internal dependency |
| Last reviewed | date |

## Seed requirements

The implementation should create at least these seed families:

```text
EOM-GOV-*     governance and licensing
EOM-NAME-*    protocol name/registration
EOM-HTTP-*    discovery and HTTP behavior
EOM-MAN-*     root manifest
EOM-ID-*      identifiers/scope
EOM-RES-*     resources/capabilities
EOM-OWN-*     ownership/delegation
EOM-I18N-*    internationalization
EOM-VER-*     versioning/extensions
EOM-PROV-*    provenance/conflicts
EOM-PRIV-*    privacy
EOM-SIG-*     signatures/integrity
EOM-MOD-*     module requirements
EOM-COURSE-*  course/offering semantics
EOM-GEN-*     authoring/generator
EOM-VAL-*     validator/linter
EOM-CLI-*     CLI
EOM-CONF-*    conformance
EOM-DOC-*     documentation/tools
EOM-AGENT-*   agent generation/review
EOM-INTEROP-* mappings/adapters
EOM-REL-*     release/operations
```

## Verification rule

A requirement may be `verified` only when:

- specification/schema/implementation references exist as applicable;
- tests pass;
- documentation exists;
- privacy/security review is complete;
- external evidence exists for external claims.

“Implemented” and “verified” are distinct states.
