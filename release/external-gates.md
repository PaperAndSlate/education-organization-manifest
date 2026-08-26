# External release gates

These gates cannot be completed from this checkout. They are packaged with owners, exact evidence,
and accurate status so a future release reviewer can close them without inventing results.

| Gate                           | Owner                         | Status             | Evidence required to close                                                                            |
| ------------------------------ | ----------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Well-known suffix registration | registration owner            | `blocked-external` | Registry submission, decision/date, and archived registry evidence.                                   |
| Independent interoperability   | pilot coordinator             | `blocked-external` | One independent publisher and consumer exchange the same fixture, with redacted logs and report URLs. |
| Legal/licensing review         | legal/release owner           | `pending-external` | Written review of licenses, source rights, public-data boundary, and release wording.                 |
| Stable governance approval     | maintainers/change controller | `pending-external` | Recorded RFC/ADR approval and release decision.                                                       |
| Production deployment          | deploying organization        | `not-authorized`   | Organization-owned HTTPS origin, operational review, rollback, monitoring, and correction contact.    |

Local conformance, signatures, generated builds, and security checks do not close any of these
external gates. The candidate status remains a working draft and general production guidance is
not authorized by this repository.
