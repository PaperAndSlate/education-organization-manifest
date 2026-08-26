# Architecture Baseline

The target is a pnpm workspace with an ESM-first TypeScript reference implementation. JSON Schema 2020-12 is the structural source of truth. The dependency direction is schemas/vocabularies → generated types → core → validator/signatures → linter/generator → CLI and applications.

The core parser and validator work offline. Networked URL auditing is opt-in and SSRF-hardened. The generator produces deterministic canonical JSON from approved source files and writes reports separately from publication output. Browser applications consume library APIs but do not make protocol conformance depend on paperandslate.org.
