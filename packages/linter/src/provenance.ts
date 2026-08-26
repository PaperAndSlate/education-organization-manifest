import { finding, type Finding } from '@paperandslate/eom-validator';

/** Lint embedded provenance records without treating provenance as a factual guarantee. */
export function provenanceFindings(document: unknown): readonly Finding[] {
  if (!isRecord(document) || !Array.isArray(document.provenance)) return [];
  const findings: Finding[] = [];
  document.provenance.forEach((record, index) => {
    if (!isRecord(record)) return;
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
      }
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
  });
  return findings;
}

function isJsonPointer(value: string): boolean {
  return value === '' || /^(?:\/(?:[^~/]|~[01])*)+$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
