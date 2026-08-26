# Proposed Well-Known URI Registration

## Status

The selected suffix `educational-organization-manifest` is a proposed working value. This document is a submission draft, not evidence of IANA acceptance. Until the registry records acceptance, public documentation must use “proposed well-known URI suffix” and early deployments are pilots/working drafts.

## Draft fields

- URI suffix: `educational-organization-manifest`
- Change controller: the accountable paper&slate legal/foundation entity available at filing time
- Specification: `https://paperandslate.org/spec/eom/1.0/` or an immutable draft URL until stable
- Media type: `application/json` for v1; a custom type is deferred unless registry review requires it
- Related links: existing `describedby`, `canonical`, and `profile` relations; a dedicated relation is not required for v1

The final submission must define suffix syntax, HTTPS origin assumption, scope, GET/HEAD behavior, redirects, format, caching, security/privacy, change controller, rationale, and collision analysis under RFC 8615.

## Gate and evidence

Submit after the root is stable, a public specification exists, HTTP/security/privacy are complete, and a working publisher exists. The v1 release gate requires accepted registration or a documented governance decision to use a standards-compliant alternative path. The repository can prepare the request, expert-review questions, implementation evidence, and status page; it cannot claim acceptance without the registry decision.
