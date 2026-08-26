# EOM 1.0 Conformance

## Roles

The suite defines Core Publisher, School Publisher, District Publisher, Module Publisher, Delegated Publisher, Signed Publisher, Consumer, Generator, and Validator roles. An implementation reports the exact specification, profile, suite, implementation version, and test time.

## Core Publisher minimum

A Core Publisher publishes a valid root manifest and organization profile/index, uses absolute IDs, declares scope/capability/resource relationships, serves the exact discovery path, and passes privacy and semantic checks. Optional modules, signatures, and delegation are not required for core conformance.

## Test categories

The versioned fixture suite covers JSON syntax and duplicate keys, schema/meta-validation, IDs and canonical URLs, resource envelopes, HTTP discovery/redirects/CORS/cache, references, capability/resource consistency, authority/delegation, languages, dates/lifecycle, provenance pointers, privacy, deterministic generation, signatures, extensions, migrations, and bounded network behavior.

## Reports and marks

Machine-readable reports must distinguish pass/fail by profile and test. A project may say “tested against EOM 1.0 Core Publisher Profile” only with a current report. A conformance mark, if later created, must show profile/version/report URL and must never imply school quality, accreditation, factual truth, legal compliance, or paper&slate endorsement.

## Independent interoperability

The release gate requests at least one publisher and one independent consumer exchange the same fixtures. Until evidence exists, the repository must publish a pilot/test kit and an explicit pending or blocked status rather than inventing a result.
