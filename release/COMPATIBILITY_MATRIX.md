# EOM compatibility matrix

| Artifact                                | Candidate                     | Compatibility evidence                         | External status                |
| --------------------------------------- | ----------------------------- | ---------------------------------------------- | ------------------------------ |
| EOM 1.0 specification                   | `v1.0.0-rc.1`                 | immutable copy and checksum in `manifest.json` | working draft                  |
| EOM 1.0 schemas                         | `v1.0.0-rc.1`                 | 42 JSON Schema 2020-12 files and schema gate   | working draft                  |
| TypeScript packages                     | `0.1.0`                       | workspace lockfile, typecheck, package build   | local reference implementation |
| Generator/validator profiles            | `1.0`                         | deterministic build and conformance report     | local evidence                 |
| Interoperability adapters               | versioned preview definitions | loss/privacy tests and mapping registry        | no certification claim         |
| Independent publisher/consumer exchange | not available in checkout     | pilot packet in `release/pilot/`               | blocked-external               |
| IANA suffix decision                    | not available in checkout     | submission draft in `release/registration/`    | blocked-external               |

The package version is intentionally separate from the protocol candidate version. A package change
does not silently change the wire contract; schema/prose changes require the corresponding RFC,
fixtures, and migration review.
