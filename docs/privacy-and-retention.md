# Privacy and retention

EOM is for deliberately public institutional information. Do not put student records, private
staff information, safeguarding or medical data, credentials, private keys, internal URLs, or
confidential documents in a manifest, fixture, pasted document, upload, or mapping input.

## Local tools

The browser playground parses pasted text and selected files locally. It does not upload, retain,
or send those values to analytics. Clearing the document removes the in-page result; closing the
tab removes the remaining in-memory state. Local processing is not a license to use private data.

## Optional URL validation

The browser URL feature only calls an explicitly entered same-origin service path. The request
omits credentials and refuses redirects. A site that provides such a service must perform the
server-side HTTPS, DNS, private-network, redirect, response-size, timeout, decompression, and
content-type checks described in the [HTTP specification](../spec/1.0/http-discovery.md). The
service should log only request metadata needed for abuse and operational review, never response
bodies, and expire those records under its published retention policy.

The repository CLI can audit a public origin through its bounded transport, but local file and
authoring commands do not fetch the network implicitly. No EOM implementation needs a
paperandslate.org service to parse, validate, or publish a local document.

## Publication boundary

Privacy findings are blocking when a document contains prohibited high-risk fields. Public staff
or contact data remains an organizational publication decision and should have an explicit review
owner, purpose, freshness expectation, and licensing basis. Mapping and extraction tools produce
reviewable candidates rather than silently promoting source content to an authoritative
publication.
