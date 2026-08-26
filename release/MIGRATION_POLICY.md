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

The current candidate has no stable-to-stable migration promise. It is a working draft and all
external review, registration, and deployment decisions remain open.
