import { finding, type Finding } from '@paperandslate/eom-core';

const MAX_PROVENANCE_RECORDS = 100_000;

/** Lint embedded provenance records without treating provenance as a factual guarantee. */
export function provenanceFindings(document: unknown): readonly Finding[] {
  if (!isRecord(document) || !Array.isArray(document.provenance)) return [];
  const provenance = document.provenance as unknown[];
  const findings: Finding[] = [];
  if (!isDenseArray(provenance)) {
    findings.push(
      finding(
        'EOM_LINT_SPARSE_ARRAY',
        'security',
        'The provenance value contains a sparse array that is not valid JSON.',
        {
          severity: 'error',
          pointer: '/provenance',
          help: 'Parse strict JSON or fill every provenance array index before linting.',
        },
      ),
    );
    return findings;
  }
  if (provenance.length > MAX_PROVENANCE_RECORDS) {
    findings.push(
      finding(
        'EOM_LINT_RESOURCE_LIMIT',
        'security',
        `The provenance array exceeds the ${MAX_PROVENANCE_RECORDS}-record safety limit.`,
        {
          severity: 'error',
          pointer: '/provenance',
          help: 'Reduce the provenance input before linting.',
        },
      ),
    );
  }
  const count = Math.min(provenance.length, MAX_PROVENANCE_RECORDS);
  for (let index = 0; index < count; index += 1) {
    const record = provenance[index];
    if (!isRecord(record)) continue;
    const pointer = `/provenance/${index}`;
    const scope = typeof record.scope === 'string' ? record.scope : undefined;
    if (scope === 'field') {
      const pointers = Array.isArray(record.targetPointers) ? record.targetPointers : [];
      if (pointers.length === 0) {
        findings.push(
          finding(
            'EOM_PROVENANCE_FIELD_TARGET_REQUIRED',
            'quality',
            'Field provenance must identify at least one JSON Pointer target.',
            {
              pointer: `${pointer}/targetPointers`,
              help: 'Use RFC 6901 pointers and prefer stable object-level provenance where possible.',
            },
          ),
        );
      } else if (!isDenseArray(pointers)) {
        findings.push(
          finding(
            'EOM_LINT_SPARSE_ARRAY',
            'security',
            'Provenance targetPointers must be a dense array.',
            {
              pointer: `${pointer}/targetPointers`,
              help: 'Provide every target pointer as an explicit array element.',
            },
          ),
        );
      }
      if (!isDenseArray(pointers)) continue;
      pointers.forEach((value, pointerIndex) => {
        if (typeof value !== 'string' || !isJsonPointer(value)) {
          findings.push(
            finding(
              'EOM_PROVENANCE_POINTER_INVALID',
              'quality',
              'A provenance target is not a valid RFC 6901 JSON Pointer.',
              {
                pointer: `${pointer}/targetPointers/${pointerIndex}`,
                help: 'Escape ~ as ~0 and / as ~1.',
              },
            ),
          );
        }
      });
    }
    if (scope === 'object' && typeof record.targetObjectId !== 'string') {
      findings.push(
        finding(
          'EOM_PROVENANCE_OBJECT_TARGET_REQUIRED',
          'quality',
          'Object provenance must identify a stable target object id.',
          { pointer: `${pointer}/targetObjectId` },
        ),
      );
    }
    if (scope === 'resource' && typeof record.targetResource !== 'string') {
      findings.push(
        finding(
          'EOM_PROVENANCE_RESOURCE_TARGET_REQUIRED',
          'quality',
          'Resource provenance must identify a target resource id.',
          { pointer: `${pointer}/targetResource` },
        ),
      );
    }
    if (typeof record.confidence === 'number' && (record.confidence < 0 || record.confidence > 1)) {
      findings.push(
        finding(
          'EOM_PROVENANCE_CONFIDENCE_RANGE',
          'quality',
          'Provenance confidence must be between 0 and 1.',
          { pointer: `${pointer}/confidence` },
        ),
      );
    }
  }
  return findings;
}

function isJsonPointer(value: string): boolean {
  return value === '' || /^(?:\/(?:[^~/]|~[01])*)+$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}
