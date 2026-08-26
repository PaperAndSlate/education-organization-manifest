import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildReviewReport,
  assertApprovedSourcePath,
  candidateGate,
  decodeJsonPointer,
  detectConflicts,
  extractControlledCandidate,
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

  it('turns an explicit controlled extraction into schema-valid, review-gated records', () => {
    const result = extractControlledCandidate(
      {
        id: 'https://ecme-high.example/evidence/source/website',
        uri: 'https://ecme-high.example/about',
        title: 'Ecme High public website',
        sourceType: 'organization-website',
        format: 'html',
        content: '<main><h1>Ecme High School</h1></main>',
        retrievedAt: '2026-08-26T12:00:00Z',
        reviewOwner: 'publication-admin',
        modules: ['organization'],
      },
      [
        {
          id: 'https://ecme-high.example/evidence/claim/organization-name',
          resourceId: 'https://ecme-high.example/eom/organization',
          pointer: '/name',
          proposedValue: 'Ecme High School',
          locator: { selector: 'main h1' },
          confidence: 0.98,
          authorityClass: 'organization-origin',
        },
      ],
      { now: new Date('2026-08-26T12:01:00Z') },
    );

    expect(validateDocument(result.source).valid).toBe(true);
    expect(result.claims).toHaveLength(1);
    expect(validateDocument(result.claims[0]).valid).toBe(true);
    expect(validateDocument(result.candidate).valid).toBe(true);
    expect(result.candidate).toMatchObject({ status: 'extracted', directPublication: false });
    expect(result.privacy.status).toBe('clear');
    expect(result.directPublication).toBe(false);
  });

  it('quarantines sensitive source content without returning the raw snapshot', () => {
    const result = extractControlledCandidate(
      {
        id: 'https://ecme-high.example/evidence/source/review',
        uri: 'https://ecme-high.example/restricted',
        title: 'Restricted review copy',
        sourceType: 'human-submission',
        format: 'plain-text',
        content: 'password: do-not-publish student name: Student Example',
        retrievedAt: '2026-08-26T12:00:00Z',
        reviewOwner: 'privacy-reviewer',
      },
      [],
    );

    const serialized = JSON.stringify(result);
    expect(result.privacy.status).toBe('quarantined');
    expect(result.candidate).toMatchObject({
      privacyReview: 'quarantined',
      directPublication: false,
    });
    expect(serialized).not.toContain('do-not-publish');
    expect(serialized).not.toContain('Student Example');
  });

  it('redacts sensitive claim values while preserving review metadata', () => {
    const result = extractControlledCandidate(
      {
        id: 'https://ecme-high.example/evidence/source/private-review',
        uri: 'https://ecme-high.example/restricted-review',
        title: 'Restricted review copy',
        sourceType: 'human-submission',
        format: 'plain-text',
        content: 'A private review value was supplied for quarantine.',
        retrievedAt: '2026-08-26T12:00:00Z',
        reviewOwner: 'privacy-reviewer',
      },
      [
        {
          id: 'https://ecme-high.example/evidence/claim/private-value',
          resourceId: 'https://ecme-high.example/eom/organization',
          pointer: '/name',
          proposedValue: 'Private Student Example',
          locator: { section: 'restricted' },
          privacyClass: 'personal-data',
        },
      ],
    );

    expect(result.privacy.status).toBe('quarantined');
    expect(result.claims[0]).toMatchObject({
      privacyClass: 'personal-data',
      proposedValue: null,
    });
    expect(JSON.stringify(result)).not.toContain('Private Student Example');
  });

  it('bounds untrusted nested and cyclic values without a recursive stack overflow', () => {
    const deep: unknown[] = [];
    let cursor = deep;
    for (let index = 0; index < 130; index += 1) {
      const child: unknown[] = [];
      cursor.push(child);
      cursor = child;
    }

    const privacy = reviewPrivacy(deep);
    expect(privacy.status).toBe('quarantined');
    expect(privacy.findings.some((item) => item.code === 'EOM_AGENT_PRIVACY_DEPTH')).toBe(true);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => reviewPrivacy(cyclic)).not.toThrow();
    expect(() => provenanceCoverage(cyclic, [])).not.toThrow();
    expect(() =>
      extractControlledCandidate(
        {
          id: 'https://ecme-high.example/evidence/source/deep',
          uri: 'https://ecme-high.example/deep',
          title: 'Deep review copy',
          sourceType: 'human-submission',
          format: 'plain-text',
          content: 'review input',
          retrievedAt: '2026-08-26T12:00:00Z',
          reviewOwner: 'privacy-reviewer',
        },
        [
          {
            id: 'https://ecme-high.example/evidence/claim/deep',
            resourceId: 'https://ecme-high.example/eom/organization',
            pointer: '/name',
            proposedValue: deep,
            locator: { section: 'deep' },
          },
        ],
      ),
    ).toThrow(CandidatePolicyError);
  });
});
