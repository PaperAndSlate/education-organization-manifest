import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildReviewReport,
  assertApprovedSourcePath,
  candidateGate,
  decodeJsonPointer,
  detectConflicts,
  isJsonPointer,
  provenanceCoverage,
  reviewPrivacy,
  sourcePathIsCandidate,
  CandidatePolicyError,
} from '@paperandslate/eom-agentic';
import { validateDocument } from '@paperandslate/eom-validator';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
}

describe('EOM evidence-led candidate workflows', () => {
  it('validates resource, field, and object provenance records and JSON Pointers', () => {
    for (const path of [
      'fixtures/valid/provenance/resource.json',
      'fixtures/valid/provenance/field.json',
      'fixtures/valid/provenance/object.json',
    ]) {
      const result = validateDocument(fixture(path));
      expect(result.valid, path).toBe(true);
    }
    expect(isJsonPointer('/items/0/name')).toBe(true);
    expect(isJsonPointer('/items/0~2/name')).toBe(false);
    expect(decodeJsonPointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
  });

  it('validates source, claim, conflict, and candidate workspace records', () => {
    const sources = fixture('fixtures/agentic/source-index.json') as readonly unknown[];
    const claims = fixture('fixtures/agentic/claims.json') as readonly unknown[];
    const workspace = fixture('fixtures/agentic/candidate-workspace.json');
    for (const record of [...sources, ...claims, workspace, ...detectConflicts(claims)]) {
      expect(validateDocument(record).valid).toBe(true);
    }
  });

  it('preserves disagreements and recommends without deleting a losing claim', () => {
    const claims = fixture('fixtures/agentic/claims.json') as readonly unknown[];
    const conflicts = detectConflicts(claims);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      type: 'conflict-record',
      status: 'unresolved',
      recommendedClaimId: 'https://ecme-high.example/evidence/claim/school-name-organization',
    });
    const conflictClaims = conflicts[0]?.claims as readonly unknown[];
    expect(conflictClaims).toHaveLength(2);
    expect(conflictClaims[0]).toMatchObject({
      claimId: 'https://ecme-high.example/evidence/claim/school-name-organization',
    });
  });

  it('blocks direct publication and creates a redacted review report', () => {
    const workspace = fixture('fixtures/agentic/candidate-workspace.json');
    const claims = fixture('fixtures/agentic/claims.json') as readonly unknown[];
    const sources = fixture('fixtures/agentic/source-index.json') as readonly unknown[];
    const unsafe = fixture('fixtures/invalid/privacy/student-record.json');
    const privacy = reviewPrivacy(unsafe);
    expect(privacy.status).toBe('quarantined');
    const report = buildReviewReport(workspace, sources, claims, detectConflicts(claims), unsafe);
    expect(report.publication).toBe('blocked');
    expect(report.noSensitiveValues).toBe(true);
    expect(JSON.stringify(report)).not.toContain('Student Example');
    expect(JSON.stringify(report)).not.toContain('synthetic-student-001');
    expect(candidateGate(workspace, claims, detectConflicts(claims), privacy).allowed).toBe(false);
  });

  it('requires full owner review, resolved conflicts, and release approval', () => {
    const workspace = {
      type: 'candidate-workspace',
      id: 'https://ecme-high.example/evidence/candidate/approved',
      status: 'release-approved',
      directPublication: false,
    };
    const claims = [
      {
        id: 'https://ecme-high.example/evidence/claim/name',
        target: { resourceId: 'https://ecme-high.example/eom/organization', pointer: '/name' },
        proposedValue: 'Ecme High School',
        method: { kind: 'direct-extraction' },
        authorityClass: 'organization-origin',
        privacyClass: 'public-reviewed',
        review: { state: 'approved', requiredOwner: 'publication-admin' },
      },
    ];
    const gate = candidateGate(workspace, claims, [], {
      status: 'clear',
      findings: [],
      redactedPaths: [],
      reportContainsSensitiveValues: false,
    });
    expect(gate.allowed).toBe(true);
  });

  it('reports uncovered candidate values and keeps candidates outside generator source paths', () => {
    const document = fixture('fixtures/agentic/public-candidate.json');
    const claims = [
      {
        id: 'https://ecme-high.example/evidence/claim/name',
        target: { resourceId: 'https://ecme-high.example/eom/organization', pointer: '/name' },
        proposedValue: 'Ecme High School',
      },
    ];
    const coverage = provenanceCoverage(document, claims);
    expect(coverage.valid).toBe(false);
    expect(coverage.uncoveredPointers).toContain('/organizationType');
    expect(sourcePathIsCandidate('review/candidates/ecme')).toBe(true);
    expect(sourcePathIsCandidate('examples/ecme-high/source')).toBe(false);
    expect(() => assertApprovedSourcePath('candidates/ecme-high')).toThrow(CandidatePolicyError);
  });
});
