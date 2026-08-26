# EOM module registry

EOM 1.0 defines 22 optional public module families. The machine-readable registry is [`modules/registry.json`](../modules/registry.json); each entry records its stable resource type, immutable schema URI, privacy class, freshness guidance, collection behavior, example, and informative mappings.

Modules are independently optional. A missing or unavailable optional module does not invalidate a valid root manifest. Publishers should only advertise a capability when the corresponding resource is actually published and reviewed.

The public boundary excludes student-level records, private staff data, credentials, internal endpoints, private schedules, individual transport assignments, and security-sensitive facility details. Staff and club data are deliberate-public; aggregate statistics require a metric definition, period, method, source, and suppression handling.

The registry is working-draft metadata. Adding or changing a core module requires an RFC and privacy/security review; mappings do not imply certification or conformance to an external standard.
