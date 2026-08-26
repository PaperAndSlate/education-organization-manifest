# EOM 1.0 Ownership and Delegation

Source ownership controls edits to authoring files; publication authority controls which party may publish an authoritative resource. They are separate. The origin serving the root is the authority anchor. A root delegation names a delegate, resource type/ID, allowed origin/path, validity period, status, optional key scope, and subject. Consumers verify presence, resource/type/ID scope, final URL origin/path, time, status, keys, and subject before accepting a delegated resource.

Cross-origin linked resources without signatures are valid when explicitly root-linked, but UIs must label publisher, maintainer, delegate, and signer separately. `transitive: true` is rejected by stable v1 tooling unless an explicit experimental profile is enabled. Revocation, expiry, vendor change, historical evidence, and module failure are preserved; a vendor does not become the school identity.
