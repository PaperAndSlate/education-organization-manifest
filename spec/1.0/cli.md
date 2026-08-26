# EOM 1.0 CLI contract

The preferred binary is `eom`. Commands write the primary result to stdout, diagnostics to stderr, and never publish or forward credentials implicitly.

Implemented local commands are:

- `build` — validate and generate canonical resources; writing requires an explicit non-dry build;
- `check` — dry-run an authoring project or validate a local publication;
- `validate` — validate a local JSON resource;
- `lint` — run privacy, freshness, and quality checks;
- `inspect` — summarize a manifest graph and capabilities;
- `fetch` — explicitly retrieve an HTTPS manifest through hardened bounded transport;
- `schema` — list or print bundled schemas;
- `explain` — explain selected stable finding codes;
- `doctor` — inspect local tool/schema/configuration readiness without network access.

Exit codes are stable: `0` means no blocking findings, `1` means validation or policy findings, `2` means usage/configuration, `3` means transport, `4` means internal failure, and `5` means signature/security policy failure. `--json` emits machine-readable output. Network access is never used by local commands and is never enabled by environment variables that alter semantic source data.
