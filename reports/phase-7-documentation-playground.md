# Phase 7: documentation and browser playground

Status: implemented locally as a static, no-account, local-first experience. This report records repository behavior and does not claim a hosted deployment, external accessibility audit, or production service.

## Delivered

- static documentation pages for overview, publishing, consumption, reference, integration, Ecme exploration, governance, FAQ, and troubleshooting;
- copied versioned specification, schema, mapping, and source-document references in the deterministic docs build;
- keyboard-visible focus, skip links, semantic headings/landmarks, responsive reflow, reduced-motion styling, text alternatives for reports, and no color-only status semantics;
- a browser playground with JSON and restricted authoring-YAML parsing, local structural/semantic/privacy checks, machine-readable reports, fixture loading, starter profile generation, JSON download, resource exploration, module coverage, Schema.org preview, signature-shape review, conformance-report viewing, and top-level diff preview;
- local file processing without upload, retention, analytics, remote scripts, or validation fetches;
- a Content Security Policy and `connect-src 'none'` browser boundary for the playground;
- static documentation link, markup, CSP, and local-network-boundary checks.

## Evidence

- `apps/docs/src/`
- `apps/docs/build.mjs`
- `apps/playground/src/`
- `apps/playground/build.mjs`
- `scripts/check-docs.ts`
- `tests/docs.test.ts`
- `docs/interoperability.md`
- `docs/publisher-quickstart.md`

## Boundaries

The browser playground is intentionally not a backend URL validator, account system, storage service, or cryptographic replacement for the CLI. Remote URL mode would require a separately hardened constrained fetch service; no such service is claimed here. Manual screen-reader and cross-browser certification remain external QA gates.
