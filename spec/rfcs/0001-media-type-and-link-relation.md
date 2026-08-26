# RFC-0001: EOM Media Type and Link Relation Strategy

- Status: Draft
- Created: 2026-08-25
- Target version: 1.0
- Change controller: paper&slate
- Related requirements: EOM-NAME-001, EOM-HTTP-001

## Summary

Use `application/json` and existing `profile`, `canonical`, and `describedby` links for the first public draft. Defer a custom media type or dedicated link relation until implementation and registry review demonstrate a need.

## Motivation and non-goals

The root needs predictable, widely supported discovery without waiting on a custom media-type registration. This RFC does not claim registration or prevent future standards work.

## Compatibility and security

Canonical JSON and immutable `$schema`/`specification` URLs identify semantics. Consumers must validate content type and not use link relations as authority outside the root scope. The same-origin HTTPS discovery and explicit delegation rules remain mandatory.

## Review and decision

Public review, implementation experience, IANA/designated-expert feedback, and at least one independent consumer should inform acceptance. Until accepted, this remains a proposal.
