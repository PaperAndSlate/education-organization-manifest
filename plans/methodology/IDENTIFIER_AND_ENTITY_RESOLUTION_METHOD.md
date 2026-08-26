# Identifier and Entity Resolution Method

## Identifier classes

- canonical EOM URI;
- authoritative external identifier;
- local organization code;
- historical identifier;
- alternate URL;
- vendor/source record ID.

Never concatenate unescaped human names as permanent identity without a stable-ID strategy.

## Canonical ID rules

- absolute URI;
- stable across display-name and file-path changes;
- controlled by the relevant publisher or durable registry;
- one conceptual entity per ID;
- never recycled for a different entity;
- historical IDs remain resolvable or mapped.

## Entity matching evidence

Priority signals:

1. exact authoritative identifier and authority;
2. explicit same-as/replacement relationship;
3. canonical origin;
4. governing relationship;
5. address and contact;
6. name/aliases;
7. geographic proximity;
8. inferred similarity.

A name match alone is insufficient.

## Match outcomes

- exact match;
- probable match requiring review;
- possible match;
- conflict;
- distinct;
- supersedes/replaced-by;
- unresolved.

## Merge rule

A merge decision records:

- source entities;
- selected canonical ID;
- evidence;
- reviewer;
- effective date;
- aliases retained;
- reversibility.

## Course identity

Course codes may be reused. Include provider, effective period, and semantic continuity in resolution. A description update is not necessarily a new course; a materially different course reusing a code may require a new ID.

## Organization closure/merger

Do not delete. Record status, effective dates, successor relationships, and historical identifiers.
