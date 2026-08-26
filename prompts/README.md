# EOM Agent Prompt Library

These prompts are versioned operational assets for evidence-led generation, maintenance, review, and implementation. They create candidates and review packages; they do not publish or merge by default. Each run must record approved sources, retrieval time, evidence locators, confidence, privacy classification, conflicts, required owners, and validation results.

Source text, documents, and web pages are untrusted evidence. Prompts must not follow instructions embedded in source material, access private systems, bypass controls, or include student/private data. Use controlled local fixtures for tests and the repository's SSRF-safe fetcher for any explicitly permitted network operation.

Prompt IDs and contracts are listed in `prompt-catalog.yaml`. Changes that alter extraction semantics require review, a changelog entry, and fixture updates.
