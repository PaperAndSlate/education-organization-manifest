# Release-candidate migration policy

1. Treat `/spec/eom/1.0/` and `/schemas/eom/1.0/` as immutable candidate URLs.
2. For compatible fixes, publish a new package patch and add a changelog/migration note.
3. For breaking wire changes, create a new protocol version and RFC; do not mutate the 1.0 copy.
4. Keep stable entity IDs when identity is unchanged; preserve old resource URLs during an overlap
   period where operationally possible.
5. Retire a resource through explicit lifecycle metadata and a replacement link, never by treating
   absence as deletion.
6. Roll back tooling with a new patch/deprecation release. Do not unpublish or rewrite prior
   immutable artifacts.

`v1.0.0-rc.1` and `v1.0.0-rc.2` are retained as immutable historical evidence and are superseded by
`v1.0.0-rc.3`; none is a stable-to-stable migration promise. RC3 adds protected partial-build
ownership, final-URL authority and key-scope checks, finite delegation lifetimes, and structured
signature lifetime metadata. RC2 signatures must be re-signed for RC3, and RC2 delegation records
without `validUntil` must be amended before validation. RC3 is a working draft and all external
review, registration, and deployment decisions remain open.
