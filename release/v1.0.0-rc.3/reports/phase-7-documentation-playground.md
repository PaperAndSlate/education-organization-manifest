# Phase 7: documentation and browser playground

> Historical phase report. Its local-slice evidence is retained, but completion claims are
> superseded for current release acceptance by [`reports/remediation-audit.md`](remediation-audit.md)
> and the rebuilt traceability matrix.

Status: implemented locally as a static, no-account, local-first experience. This report records repository behavior and does not claim a hosted deployment, external accessibility audit, or production service.

## Delivered

- static documentation pages for overview, publishing, consumption, reference, integration, Ecme exploration, governance, FAQ, and troubleshooting;
- copied versioned specification, schema, mapping, and source-document references in the deterministic docs build;
- keyboard-visible focus, skip links, semantic headings/landmarks, responsive reflow, reduced-motion styling, text alternatives for reports, and no color-only status semantics;
- a browser playground with JSON and bounded authoring-YAML parsing, local schema/semantic/privacy checks, machine-readable reports, fixture loading, starter profile generation, JSON download, resource exploration, module coverage, Schema.org preview, signature verification, conformance-report viewing, provenance/delegation views, and identifier-aware semantic diff preview;
- local file processing without upload, retention, analytics, remote scripts, or validation fetches;
- a Content Security Policy and `connect-src 'self'` browser boundary for the playground; optional URL validation is an explicit same-origin, credential-free, no-redirect request and is not a hosted service claim;
- static documentation link, markup, CSP, and local-network-boundary checks.

## Evidence

- `apps/docs/src/`
- `apps/docs/build.mjs`
- `apps/playground/src/`
- `apps/playground/build.mjs`
- `scripts/check-docs.ts` (built HTML and repository Markdown/static link checking)
- `tests/docs.test.ts`
- `docs/interoperability.md`
- `docs/publisher-quickstart.md`

## Boundaries

The browser playground is intentionally not an account system, storage service, or replacement for the CLI. Its optional URL mode only calls a same-origin service supplied by the host; that service must implement the constrained fetch boundary described in the privacy notice. No hosted validation service is claimed here. Manual screen-reader certification and cross-browser coverage beyond the automated Chromium checks remain external QA gates.
