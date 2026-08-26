# Signature fixtures

Signature tests generate Ed25519 key material in memory and retain only public key metadata and detached signature records where a static vector is useful. No private key is committed. The test profile uses detached RFC 7797-style compact JWS with `b64:false` and an EOM critical profile header over RFC 8785 JCS bytes.
