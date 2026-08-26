# Vendor and District Integration

## Integration principle

A vendor or district can maintain a resource without becoming the identity authority for the school.

## Vendor patterns

### Generate same-origin files

The vendor deploys through the school's hosting/CDN so resources remain same-origin.

### Reverse proxy

The school origin proxies the well-known path or module to vendor infrastructure.

### Explicit delegation

The school root points to the vendor origin and grants a constrained, time-bounded, non-transitive delegation.

## Vendor requirements

- stable canonical IDs based on school identity, not vendor account IDs alone;
- documented export;
- no lock-in to proprietary fields;
- clear source provenance;
- public/private field allowlist;
- incident and correction route;
- version compatibility;
- graceful contract termination;
- historical continuity;
- optional signature/key handover plan.

## District patterns

### District root with organization index

Appropriate when a district intentionally publishes for all represented schools and controls the relevant origin/scope.

### School roots with shared district modules

Each school root links to district calendars, transport, jobs, policies, or identifiers through explicit delegation.

### Managed deployment to school origins

The district generates and deploys each school's own root manifest.

## Contract/offboarding considerations

A school should be able to:

- export all authoring/public data;
- retain stable entity IDs;
- revoke delegation;
- move resources;
- preserve historical snapshots;
- update root immediately;
- rotate/remove keys;
- keep EOM conformance without the vendor.

## Multi-tenant safety

Vendor infrastructure must:

- isolate tenants;
- prevent cross-school IDs/data;
- bind requests and signatures to tenant/resource scope;
- avoid shared secret leakage;
- support per-school deletion/correction;
- enforce path and origin rules;
- test confused-deputy cases.

## Conformance

Vendors may claim only the role/profile/version actually tested. A vendor generator passing conformance does not certify every customer's data as accurate or privacy-safe.
