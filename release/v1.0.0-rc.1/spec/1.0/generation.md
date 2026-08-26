# EOM 1.0 Authoring and Generation

The reference generator loads a validated configuration, discovers source files within approved roots, parses a safe YAML/JSON subset, normalizes language/date/URI shorthands, assigns or validates stable IDs, merges explicit overlays, builds a graph, attaches provenance, runs privacy/schema/semantic/lint checks, partitions resources, serializes canonical JSON, optionally signs, and atomically writes output plus reports.

Source order is normalized lexicographically; object identity is absolute ID; duplicate IDs and conflicting owned fields fail unless an explicit overlay policy permits the path. Output is deterministic for the same inputs/tool/config and nondeterministic build timestamps live outside canonical public JSON. Generated files carry markers and drift checks regenerate rather than accept manual edits.
