# Human Review Workflow

## Review roles

A school or district may combine these roles, but the workflow should represent them distinctly:

- **Publication administrator** — controls the root manifest and release.
- **Data steward** — ensures common identifiers, provenance, and consistency.
- **Module owner** — approves content for a department or module.
- **Privacy reviewer** — checks personal and sensitive public information.
- **Technical reviewer** — checks schema, links, security, and generation.
- **Legal/licensing reviewer** — resolves reuse or terms questions when needed.
- **Translator/localization reviewer** — approves multilingual content.

## Candidate states

```text
discovered
→ extracted
→ normalized
→ validation-failed | review-ready
→ changes-requested | approved
→ generated
→ release-approved
→ published
→ superseded
```

No automated path should skip from `extracted` to `published`.

## Pull-request checklist

A generated PR must answer:

- What source set was used?
- Which modules and organizations changed?
- Which values were inferred rather than direct?
- Which conflicts remain?
- Does the source license permit this use?
- Is any personal data included?
- Were deletions caused by a missing source or an explicit statement?
- Did identifiers change?
- Do effective dates make sense?
- Are multilingual values reviewed?
- Did generated output change deterministically?
- Which CODEOWNERS must approve?
- Does the publication require a new signature?

## Deletions

Absence from a newly crawled page is not sufficient evidence to delete a field. The agent should mark the value as potentially stale and request review.

Automatic deletion may be considered only when:

- the source is authoritative and machine-readable;
- the source explicitly marks the item removed/closed/expired;
- the policy is documented;
- the generated diff is reviewed.

## High-risk review triggers

Require explicit privacy/technical approval for:

- named staff;
- staff photos or biographies;
- facility/security details;
- transport stops or routes;
- meal allergens;
- aggregate statistics with small groups;
- admissions eligibility claims;
- jobs with personal recruiter contacts;
- third-party delegated origins;
- new signing keys;
- executable or embedded content;
- externally supplied rich text.

## Release approval

The publication administrator confirms:

- all required reviews passed;
- the canonical manifest resolves;
- linked resources return expected media types;
- no staging origins remain;
- expiry/freshness values are valid;
- the release report is archived;
- rollback is possible.

## Corrections

Every implementation should expose:

- a public correction/contact URL;
- an issue template or form;
- a process for urgent privacy removal;
- provenance-preserving correction history;
- a way for downstream indexes to observe the correction.
