# EOM 1.0 CLI contract

The preferred binary is `eom`. Commands write the primary result to stdout, diagnostics to stderr, and never publish or forward credentials implicitly.

The local command surface is:

- `init` — create a bounded authoring project template under an approved destination;
- `build` — validate and generate canonical resources; writing requires an explicit non-dry build;
- `check` — dry-run an authoring project, validate a local publication, or validate a bounded graph;
- `validate` — validate a local JSON resource, publication directory, or explicitly requested HTTPS graph;
- `lint` — run privacy, freshness, quality, and publication-policy checks;
- `inspect` — summarize a manifest graph and capabilities;
- `diff` — produce a deterministic semantic diff between two local JSON documents;
- `migrate` — apply a named, explicit migration to a local JSON document and report changed paths;
- `fetch` — explicitly retrieve an HTTPS manifest through hardened bounded transport;
- `audit-url` — explicitly audit an HTTPS origin's discovery, HTTP metadata, cache, CORS, and
  redirect behavior;
- `schema` — list or print bundled schemas;
- `explain` — explain selected stable finding codes;
- `doctor` — inspect local tool/schema/configuration readiness; an explicitly supplied origin is
  audited through the bounded network transport, while `--offline` rejects network auditing.

Exit codes are stable: `0` means no blocking findings, `1` means validation or policy findings, `2` means usage/configuration, `3` means transport, `4` means internal failure, and `5` means signature/security policy failure. `--json` emits machine-readable output. Network access is never used by local commands and is never enabled by environment variables that alter semantic source data.

Global bounded options include `--timeout`, `--max-bytes`, `--cache-dir`, and `--deterministic`;
graph commands additionally accept `--max-depth`, `--max-resources`, `--max-files`, and
`--max-total-bytes`. Build and validation commands accept an explicit `--report` or `--output`
destination as appropriate. Reports can be emitted as JSON, SARIF, JUnit XML, HTML, or the
versioned conformance shape. URL and origin inputs are validated before transport; redirects are
bounded and revalidated.

Operational environment defaults are supported for automation: `EOM_TIMEOUT`, `EOM_MAX_BYTES`,
`EOM_MAX_REDIRECTS`, `EOM_CACHE_DIR`, `EOM_OFFLINE`, `EOM_DETERMINISTIC`, `EOM_JSON`, `EOM_QUIET`,
`EOM_VERBOSE`, and `EOM_CONFIG`. `EOM_NO_COLOR` and the conventional `NO_COLOR` disable color.
Explicit command-line flags take precedence over these environment values. Environment variables
cannot provide or alter semantic source data. A user-level JSON settings file may supply the same
operational keys at `%APPDATA%/eom/config.json` on Windows or `$XDG_CONFIG_HOME/eom/config.json`
(`~/.config/eom/config.json` fallback) and is lower precedence than environment and flags. Set
`EOM_USER_CONFIG` to select an explicit user settings file. Unknown settings, malformed JSON, and
oversized settings files are rejected.
