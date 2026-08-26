# IANA Registration Plan

## Selected working suffix

`educational-organization-manifest`

## Registry

IANA Well-Known URIs registry under RFC 8615.

## Status discipline

Until accepted, documentation must say:

> Proposed well-known URI suffix.

Do not say:

> Registered well-known URI.

## Registration timing

Submit for provisional registration once:

- the root format is stable enough for external implementation;
- a public specification URL exists;
- media type behavior is defined;
- HTTP methods, redirects, scope, and security considerations are complete;
- at least one working publisher exists;
- there is intent to maintain the specification.

Do not wait until every optional module is perfect. Registration concerns the well-known root behavior and format.

## Draft registration fields

### URI Suffix

`educational-organization-manifest`

### Change Controller

paper&slate Foundation or the formal legal entity responsible for `paperandslate.org`.

The submission must use the actual legal/controller identity available at filing time.

### Specification Document

Stable public specification URL, initially:

`https://paperandslate.org/spec/eom/1.0/`

If the specification is still a draft, use an immutable draft URL and describe status.

### Status

Request provisional first unless the expert advises permanent status based on maturity.

### Related Information

- schema catalog;
- GitHub repository;
- conformance suite;
- contact address;
- security policy.

## RFC 8615 requirements to cover

The specification must explicitly define:

- suffix syntax;
- supported URI schemes;
- exact hostname/origin discovery assumption;
- scope of metadata;
- GET behavior;
- HEAD behavior;
- redirects;
- response format;
- associated media type;
- additional path/query behavior, if any;
- caching;
- security considerations;
- privacy considerations;
- change controller;
- registration rationale;
- collision analysis.

## Media type decision

Recommended v1 baseline:

`application/json`

with:

- immutable `$schema`;
- `specification` URI;
- HTTP `Link` header with `rel="profile"`.

Evaluate a future registered media type such as:

`application/educational-organization-manifest+json`

Do not block initial implementation on a custom media type unless IANA review recommends it.

## Link relation decision

A dedicated link relation may help path-scoped school pages, but it is not required for root discovery.

V1 can use existing `describedby`, `canonical`, and `profile` link relations where applicable.

Consider a dedicated relation only after real implementation experience.

## Registration workflow

1. publish draft specification;
2. open a public GitHub registration issue;
3. create implementation examples;
4. seek review from web/protocol experts;
5. submit through the IANA/registry process referenced by RFC 8615;
6. respond to designated expert comments;
7. revise name/spec if required;
8. record acceptance and registry date;
9. update all docs without changing versioned historical drafts;
10. add an automated registry-presence check to release CI.

## Risk

The designated expert may reject or request changes because:

- the name is too generic;
- implementation evidence is insufficient;
- the format or media type is underspecified;
- security/privacy guidance is incomplete;
- an existing mechanism is more appropriate.

The project must be willing to rename before v1.0.

## Release gate

General production guidance and v1.0 release require accepted registration or an explicit governance decision explaining why a standards-compliant alternative path is being used.
