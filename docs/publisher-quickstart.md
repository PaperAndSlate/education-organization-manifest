# Publisher Quickstart

1. Choose an HTTPS origin that the educational organization controls.
2. Start with one organization profile and one role-based public contact.
3. Declare a stable absolute organization ID and a correction URL.
4. Build the root manifest at `/.well-known/educational-organization-manifest`.
5. Run `eom validate`, `eom lint`, and `eom inspect` locally.
6. Publish only the generated canonical JSON and its linked public resources.
7. Add modules one at a time, assigning source owners and a publication reviewer.
8. Re-run conformance and freshness/privacy checks on every release.

EOM is public by design. Do not add student records, private employee information, credentials, internal endpoints, private schedules, individual transport assignments, or security-sensitive facility details. Prefer role contacts. A vendor or district may host one module only when the root manifest gives it a scoped, time-bounded, non-transitive delegation.

The organization origin remains authoritative. A future paper&slate index may observe and preserve source provenance, but it is not the authority for the publication.
