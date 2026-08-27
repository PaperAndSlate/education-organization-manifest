# Current pre-remediation Standard security scan

Status: durable pre-remediation evidence, preserved and superseded by the remediation work in the
working tree. This report is not evidence that the current changes are complete.

- Scan ID: `19953663-b1c5-459a-af76-5d9412d40a82`
- Target commit: `1119bb8aeb5865477e0e5f1c6d50bee5ce3a9c94`
- Target tree: the exact tree associated with that commit at scan time
- Scan mode: Standard
- Findings: five unresolved findings before the current remediation changes

The findings were:

1. `authority.root-observed-origin-binding` (high): a fetched root document could claim an
   authority origin different from the origin that served it.
2. `authority.delegated-descriptor-document-binding` (high): delegated authority was evaluated
   against a queued descriptor without binding that descriptor to the fetched document.
3. `integrity.candidate-source-realpath` (medium): lexical candidate checks did not prevent a
   symlink or junction from escaping into an approved source tree.
4. `evidence.security-scan-source-binding` (medium): aggregate evidence did not require the formal
   scan tree to equal the aggregate source tree.
5. `resource-exhaustion.browser-upload-precheck` (low): the browser read a file before checking
   its declared size.

The authoritative workbench report for this scan is retained outside the repository by the local
security tool. A fresh post-remediation scan must be run against the final clean commit and its
canonical artifacts must replace neither this historical record nor the earlier historical scan.
