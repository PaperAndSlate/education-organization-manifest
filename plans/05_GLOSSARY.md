# Working Glossary

## Authority

The party or origin entitled to assert that a resource is an official publication for a defined scope.

## Authoring source

Human-maintained YAML, JSON, CSV, or other approved source files used by the generator. Authoring source is not necessarily the wire representation.

## Canonical resource

The stable, published JSON representation identified by its canonical URI.

## Capability

A machine-readable declaration that a publisher supports a protocol feature or module.

## Campus

A physical or virtual site at which an educational organization operates. A campus is not always a separate legal organization.

## Claim

A value asserted about an entity, together with optional provenance, confidence, effective dates, and status.

## Course

A reusable educational definition: title, content, outcomes, credits, prerequisites, and related characteristics.

## Course offering

A time-, mode-, location-, or cohort-specific availability of a course.

## Section

A specific scheduled or administratively distinct subdivision of an offering. Section data is optional and must contain only deliberately public information.

## Delegation

An explicit authorization in the root authority chain allowing a different maintainer, key, origin, or vendor to publish a defined resource scope.

## Educational organization

A school, district, college, university, training provider, online provider, education authority, or other organization that provides or governs education.

## Extension

A namespaced addition outside the core model, declared under the `extensions` object and associated with an extension schema.

## Manifest

The compact well-known root document that establishes publisher identity, scope, capabilities, resources, and delegation.

## Module

A separately modeled resource family, such as courses, transportation, or menus.

## Origin

The URI scheme, host, and port combination under web origin semantics.

## Profile

A named set of additional requirements layered on core EOM, such as the School Publisher Profile or a jurisdiction profile.

## Provenance

Metadata describing the source, assertion, transformation, observation time, effective time, license, and verification of information.

## Publisher

The entity responsible for making a manifest or resource available.

## Resource

A linked EOM document or compatible representation containing data for one or more modules.

## Root authority

The authority established through control of the origin serving the well-known manifest.

## Semantic validation

Checks beyond JSON shape, including reference integrity, identifier uniqueness, date consistency, delegation scope, language rules, and cross-resource constraints.

## Source owner

A person or team responsible for a file or directory in the authoring repository. Source ownership does not automatically grant publication authority.

## Wire format

The representation consumers retrieve. EOM v1 uses canonical JSON as its wire format.

## Jurisdiction profile

A vocabulary and constraint package for a country, state, province, education system, or qualification framework.
