# Deterministic HTTP fixtures

HTTP behavior is tested with an in-process loopback server in `tests/fetch.test.ts`. The fixture server is used only with explicit test-only allowances for loopback HTTP and non-standard ports. Production-facing fetch defaults remain HTTPS-only, public-DNS-only, bounded, credential-free, and redirect-limited.

No live endpoint, DNS answer, cookie, proxy, or credential is required for the HTTP test suite.
