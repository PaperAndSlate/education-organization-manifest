# Ecme High Validation Scenarios

## Valid scenarios

1. Minimal root plus organization profile.
2. Rich root with every module.
3. School-owned course catalog.
4. District-delegated transportation.
5. Vendor-delegated meals.
6. District-delegated jobs.
7. Multilingual organization/course.
8. Unsigned conformant publication.
9. Valid optional signed publication.
10. Historical expired course retained as history but not current.
11. Planned course without an offering.
12. Optional module unavailable while root remains usable.

## Invalid scenarios

The `invalid-sample/` directory seeds tests for:

- student records;
- delegation scope escape;
- unapproved transitive delegation;
- prerequisite cycles;
- excessive named-staff personal data;
- private/internal API endpoint and secret.

Codex should expand with:

- duplicate JSON keys;
- invalid BCP 47 tags;
- invalid date ordering;
- duplicate course IDs;
- code reuse in overlapping effective periods;
- dangling references;
- course fields containing section schedule data;
- malformed extension namespace;
- root manifest over size budget;
- invalid cross-origin redirect;
- expired delegation;
- revoked key;
- signature over changed bytes;
- unsupported signature algorithm;
- unsafe HTML;
- YAML alias expansion;
- archive/path traversal;
- small-cell statistics without suppression.

Each invalid fixture must fail for one principal intended reason and assert a stable error code.
