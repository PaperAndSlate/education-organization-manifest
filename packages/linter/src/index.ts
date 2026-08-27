import {
  finding,
  isPrivateOrLocalHostname,
  isHttpsUri,
  type Finding,
} from '@paperandslate/eom-core';
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

const MAX_LINT_NODES = 100_000;
const MAX_LINT_DEPTH = 128;

interface LintBudget {
  nodes: number;
  limited: boolean;
}

export function lintPublication(document: unknown, options: LintOptions = {}): readonly Finding[] {
  const findings: Finding[] = [];
  const budget: LintBudget = { nodes: 0, limited: false };
  walk(document, '', findings, options, new WeakSet<object>(), budget, 0);
  if (budget.limited) {
    findings.unshift(
      finding(
        'EOM_LINT_RESOURCE_LIMIT',
        'security',
        `The value exceeds the ${MAX_LINT_NODES}-node or ${MAX_LINT_DEPTH}-level lint safety limit.`,
        {
          severity: 'error',
          help: 'Reduce the input before linting and validate it with the bounded publication parser.',
        },
      ),
    );
  }
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
      inspectContactPublicationReview(document, findings, options);
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
  ancestors: WeakSet<object>,
  budget: LintBudget,
  depth: number,
): void {
  if (budget.limited) return;
  budget.nodes += 1;
  if (budget.nodes > MAX_LINT_NODES || depth > MAX_LINT_DEPTH) {
    budget.limited = true;
    return;
  }
  if (typeof value === 'string') {
    inspectString(value, pointer, findings);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (ancestors.has(value)) {
    findings.push(
      finding(
        'EOM_LINT_CYCLIC_VALUE',
        'security',
        'The value contains a cyclic runtime reference.',
        {
          severity: 'error',
          pointer: pointer || '/',
          help: 'Parse strict JSON before linting; JSON publications cannot contain runtime cycles.',
        },
      ),
    );
    return;
  }
  if (Array.isArray(value)) {
    ancestors.add(value);
    try {
      if (!isDenseArray(value)) {
        findings.push(
          finding(
            'EOM_LINT_SPARSE_ARRAY',
            'security',
            'The runtime value contains a sparse array that is not valid JSON.',
            {
              severity: 'error',
              pointer: pointer || '/',
              help: 'Parse strict JSON or fill every array index before linting.',
            },
          ),
        );
        return;
      }
      for (let index = 0; index < value.length && !budget.limited; index += 1) {
        walk(value[index], `${pointer}/${index}`, findings, options, ancestors, budget, depth + 1);
      }
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  if (!isRecord(value)) {
    findings.push(
      finding(
        'EOM_LINT_NON_JSON_VALUE',
        'security',
        'The value contains a non-plain runtime object that is not valid JSON publication data.',
        {
          severity: 'error',
          pointer: pointer || '/',
          help: 'Parse strict JSON before linting and do not pass Date, Map, Set, or class instances as publication data.',
        },
      ),
    );
    return;
  }
  ancestors.add(value);
  try {
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
              // Prohibited public-data fields are a non-overridable policy failure.
              // `strictPrivacy` may control advisory privacy checks, but it must
              // never turn a publication boundary violation into a warning.
              severity: 'error',
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
      walk(child, childPointer, findings, options, ancestors, budget, depth + 1);
      if (budget.limited) break;
    }
  } finally {
    ancestors.delete(value);
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
  options: LintOptions,
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
            severity: options.strictPrivacy === true ? 'error' : 'warning',
            pointer: `/contacts/${index}/person`,
            help: 'Prefer a role-based contact or include deliberate-public review and expiry metadata.',
          },
        ),
      );
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}
