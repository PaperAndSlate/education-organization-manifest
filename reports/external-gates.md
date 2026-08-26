# External gate register

This register deliberately distinguishes repository evidence from actions requiring an external
party or deployment environment.

| Gate                                    | Status             | Owner                         | Close evidence                                                                                   |
| --------------------------------------- | ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Proposed well-known suffix registration | `blocked-external` | registration owner            | Dated registry recheck, submission receipt, and recorded decision.                               |
| Independent interoperability pilot      | `blocked-external` | pilot coordinator             | Redacted exchange logs from an independent publisher and consumer using the same fixture digest. |
| Legal/license review                    | `pending-external` | legal/release owner           | Written review of source rights, licenses, privacy wording, and release claim language.          |
| Stable governance approval              | `pending-external` | maintainers/change controller | Approved RFC/ADR and release decision.                                                           |
| Production deployment                   | `not-authorized`   | deploying organization        | Organization-owned HTTPS deployment, monitoring, correction contact, and rollback verification.  |
| External certification/adoption         | `not-claimed`      | future program owner          | A separately governed program and evidence; no such claim is made here.                          |

Local schema, generator, validator, signature, conformance, documentation, security, and package
checks are necessary repository gates but do not close this table.
