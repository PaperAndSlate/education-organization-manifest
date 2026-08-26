# Security Policy Plan

## SECURITY.md must include

- supported versions;
- private reporting channel;
- expected report content;
- response targets without guarantees;
- coordinated disclosure process;
- encryption key if available;
- safe-harbor statement where appropriate;
- scope;
- out-of-scope factual school-data disputes;
- dependency vulnerability reporting;
- credit policy.

## Security contact

Publish:

`/.well-known/security.txt`

on paperandslate.org following RFC 9116.

## Supported areas

- schema/validator bypass;
- parser vulnerabilities;
- SSRF;
- path traversal;
- signature flaws;
- key handling;
- XSS in docs/playground;
- CI/supply chain;
- privacy leaks caused by tooling;
- conformance service abuse.

## Not security vulnerabilities by themselves

- a school publishes an inaccurate course;
- stale public information;
- disagreement over classification;
- expected missing optional data.

These may be data quality/correction issues.

## Advisory process

- private triage;
- reproduce;
- severity;
- patch;
- CVE if applicable;
- coordinated release;
- advisory;
- regression fixture;
- post-incident review.

## Security releases

Do not hide breaking behavior required to fix an active vulnerability. Provide clear migration and version support.

## Keys

Foundation release keys and protocol test keys are separate. Never use fixture private keys operationally.
