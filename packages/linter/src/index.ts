import { isPrivateOrLocalHostname, isHttpsUri } from '@paperandslate/eom-core';
import { finding, type Finding } from '@paperandslate/eom-validator';
import { provenanceFindings } from './provenance.js';

export { provenanceFindings } from './provenance.js';

export interface LintOptions {
  readonly now?: Date;
  readonly strictPrivacy?: boolean;
}

const prohibitedNames = new Set([
  'student',
  'students',
  'studentid',
  'studentids',
  'grades',
  'gradebook',
  'attendance',
  'iep',
  '504',
  'sen',
  'medical',
  'safeguarding',
  'discipline',
  'privateschedule',
  'privatetransportassignment',
  'password',
  'token',
  'secret',
  'apikey',
  'clientsecret',
  'credential',
  'credentials',
  'privatekey',
]);

export function lintPublication(document: unknown, options: LintOptions = {}): readonly Finding[] {
  const findings: Finding[] = [];
  walk(document, '', findings, options, new WeakSet<object>());
  if (isRecord(document)) {
    if (!document.expires) {
      findings.push(
        finding(
          'EOM_LINT_MISSING_EXPIRY',
          'freshness',
          'Public resources should declare an expires value or an explicit freshness profile.',
          {
            severity: 'warning',
            pointer: '/expires',
            help: 'Add a conservative expiry signal appropriate for the resource volatility.',
          },
        ),
      );
    }
    if (document.type === 'contact-directory') {
      inspectContactPublicationReview(document, findings);
    }
  }
  findings.push(...provenanceFindings(document));
  return findings;
}

function walk(
  value: unknown,
  pointer: string,
  findings: Finding[],
  options: LintOptions,
  visited: WeakSet<object>,
): void {
  if (typeof value === 'string') {
    inspectString(value, pointer, findings);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${pointer}/${index}`, findings, options, visited));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${escapePointer(key)}`;
    const normalized = key.replaceAll('_', '').replaceAll('-', '').toLowerCase();
    if (prohibitedNames.has(key) || prohibitedNames.has(normalized)) {
      findings.push(
        finding(
          'EOM_PRIVACY_PROHIBITED_FIELD',
          'privacy',
          `Field ${key} is outside the public EOM data boundary.`,
          {
            severity: options.strictPrivacy === false ? 'warning' : 'error',
            pointer: childPointer,
            help: 'Remove the field or replace it with an aggregate, role-based, deliberate-public representation.',
          },
        ),
      );
    }
    if (/(?:password|secret|token|credential|privatekey|apikey)/iu.test(key)) {
      findings.push(
        finding(
          'EOM_SECURITY_SENSITIVE_FIELD',
          'security',
          `Field ${key} resembles a credential or secret.`,
          {
            severity: 'error',
            pointer: childPointer,
            help: 'Never publish credentials, private keys, tokens, or internal authentication material.',
          },
        ),
      );
    }
    walk(child, childPointer, findings, options, visited);
  }
}

function inspectString(value: string, pointer: string, findings: Finding[]): void {
  if (/^https?:\/\//iu.test(value)) {
    if (!isHttpsUri(value)) {
      findings.push(
        finding('EOM_LINT_HTTPS_REQUIRED', 'security', 'Public EOM links should use HTTPS.', {
          severity: 'error',
          pointer,
        }),
      );
    } else {
      try {
        const parsed = new URL(value);
        if (isPrivateOrLocalHostname(parsed.hostname)) {
          findings.push(
            finding(
              'EOM_LINT_PRIVATE_HOST',
              'security',
              'A public publication must not link to a private or local hostname.',
              {
                severity: 'error',
                pointer,
                help: 'Use a public HTTPS origin, or keep internal endpoint information out of the publication.',
              },
            ),
          );
        }
      } catch {
        // Structural validation reports malformed URLs; the linter stays focused on policy.
      }
    }
  }
}

function inspectContactPublicationReview(
  document: Record<string, unknown>,
  findings: Finding[],
): void {
  const contacts = Array.isArray(document.contacts) ? document.contacts : [];
  contacts.forEach((contact, index) => {
    if (!isRecord(contact)) return;
    if (contact.person && !contact.publicationReview) {
      findings.push(
        finding(
          'EOM_CONTACT_REVIEW_REQUIRED',
          'privacy',
          'A contact that identifies a person needs an explicit publication review record.',
          {
            severity: 'warning',
            pointer: `/contacts/${index}/person`,
            help: 'Prefer a role-based contact or include deliberate-public review and expiry metadata.',
          },
        ),
      );
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
