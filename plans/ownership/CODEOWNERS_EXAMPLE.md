# CODEOWNERS Example

Target `.github/CODEOWNERS` example:

```text
# Protocol and schemas
/spec/**                              @paperandslate/eom-spec-editors
/schemas/**                           @paperandslate/eom-schema-maintainers
/vocabularies/**                      @paperandslate/eom-vocabulary-maintainers
/packages/signatures/**               @paperandslate/eom-security
/packages/validator/**                @paperandslate/eom-validator-maintainers

# Ecme High source example
/examples/ecme-high/source/organization/**       @paperandslate/example-school-admin
/examples/ecme-high/source/campuses/**           @paperandslate/example-school-admin
/examples/ecme-high/source/departments/math/**   @paperandslate/example-math
/examples/ecme-high/source/courses/math/**       @paperandslate/example-math @paperandslate/example-curriculum
/examples/ecme-high/source/departments/fcs/**    @paperandslate/example-fcs
/examples/ecme-high/source/courses/fcs/**        @paperandslate/example-fcs @paperandslate/example-curriculum
/examples/ecme-high/source/staff/**              @paperandslate/example-hr @paperandslate/example-privacy
/examples/ecme-high/source/transportation/**     @paperandslate/example-transport @paperandslate/example-privacy
/examples/ecme-high/source/meals/**              @paperandslate/example-food-services
/examples/ecme-high/source/sports/**             @paperandslate/example-athletics @paperandslate/example-comms
/examples/ecme-high/source/clubs/**              @paperandslate/example-activities @paperandslate/example-comms
/examples/ecme-high/source/jobs/**               @paperandslate/example-hr
/examples/ecme-high/source/news/**               @paperandslate/example-comms

# Generated files cannot be approved as source changes
/examples/ecme-high/generated/**                 @paperandslate/eom-release
```

## Branch protection notes

CODEOWNERS alone is insufficient.

Configure:

- required owner approvals;
- dismissal on new commits;
- required CI;
- no direct pushes;
- signed commits/tags where policy requires;
- limited bypass;
- environment approval for deployment.

## Generator enforcement

Optionally compare changed source paths with ownership metadata and produce a review matrix in CI. GitHub remains the approval enforcement layer.
