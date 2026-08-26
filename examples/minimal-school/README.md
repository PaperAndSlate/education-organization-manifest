# Minimal school example

This fictional example publishes a root manifest, one organization profile, and one role-based contact directory. All identifiers use the reserved `.example` domain and are not live endpoints.

The files under `public/` mirror the paths a static publisher could serve:

- `/.well-known/educational-organization-manifest.json`
- `/eom/organization.json`
- `/eom/contacts.json`

Validate the root locally with:

```powershell
pnpm eom validate examples/minimal-school/public/.well-known/educational-organization-manifest.json --json
```
