# EOM 1.0 Versioning and Extensions

Protocol/specification, root schema, module schema, profile, vocabulary, extension, and package versions are distinct. Major versions can break validity or meaning; minor versions add compatible optional capabilities; patch versions do not change accepted instance meaning. Released versioned URLs are immutable; `latest` aliases are non-persistent conveniences.

Unknown top-level properties fail structural validation. Extensions are JSON objects under `extensions`, keyed by an absolute URI or controlled reverse-domain identifier; an extension cannot override core meaning or weaken privacy. Extension schemas and owners should be discoverable. Deprecations name replacements, first-deprecated version, planned removal, migration, and a stable linter code.
