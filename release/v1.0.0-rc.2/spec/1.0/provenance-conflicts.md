# EOM 1.0 Provenance and Conflicts

Provenance may apply to a resource, object, or field JSON Pointer. A record includes source URI/type, asserted-by, observation/retrieval time, effective period, method/transformation, license, digest, verification status, and optional confidence. Field targets use RFC 6901 pointers; stable object IDs are preferred over array indexes.

The default precedence recommendation is authoritative government identity identifiers, current organization operational publication, authoritative public government data, then foundation-derived/inferred enrichment. Precedence is claim-category dependent and never silently deletes losing claims. Conflicting claims retain their values, provenance, scope, dates, and resolution status. Staleness warns according to module cadence; it does not itself imply deletion or falsehood.
