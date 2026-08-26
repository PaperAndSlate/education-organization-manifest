# Pack Validation Report

This report describes automated checks run against the planning pack before archive creation.

## Inventory

- Total files: **195**
- Markdown files: **115**
- JSON files: **32**
- YAML files: **23**
- Plain-text prompts: **22**
- Uncompressed content size: **550,105 bytes**

## Automated checks passed

- every file is non-empty;
- every `.json` file parses as JSON;
- every `.yaml` file parses through a safe YAML loader;
- Markdown triple-backtick fences are balanced;
- the Ecme root resource's same-origin links have corresponding sample files;
- delegated meal, transportation, and job links have self-contained local copies;
- no `Acme` spelling drift appears;
- sample email addresses use `.example`;
- valid Ecme source/output samples contain no seeded student records;
- all fictional school web origins use `.example`;
- a SHA-256 file manifest is included;
- the archive is designed to contain one top-level directory.

## Manual design checks completed

- all 36 approved product decisions are represented;
- the protocol name is neutral and paper&slate is described as steward;
- the suffix is labeled proposed rather than registered;
- root discovery is separated from large resources;
- course definitions are separated from offerings/sections;
- every requested v1 module has a data-model plan;
- source ownership is separated from publication authority;
- delegated vendor/district hosting is constrained;
- signatures are optional in v1;
- student-level data is permanently out of scope;
- provenance, multilingual values, extensions, conformance, and agent review are planned;
- website copy, tools, deferred work, and separate future repositories are documented.

## Important limitation

These checks validate the planning pack and illustrative syntax. They do not prove conformance to EOM because the normative schemas and implementation do not exist yet. The implementation repository must regenerate the sample and run the completed conformance suite.

The JSON and YAML under `examples/ecme-high/expected-sample/` and `source-sample/` are planning fixtures. They may change during specification implementation.
