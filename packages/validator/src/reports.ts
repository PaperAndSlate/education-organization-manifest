import { stringifyCanonical } from '@paperandslate/eom-core';
import type { Finding, ValidationResult } from './findings.js';
import type { PublicationValidationResult } from './inputs.js';

export type ValidationReportFormat = 'json' | 'sarif' | 'junit' | 'html' | 'conformance';
export type ValidationReportInput = ValidationResult | PublicationValidationResult;

export function renderValidationReport(
  input: ValidationReportInput,
  format: ValidationReportFormat = 'json',
): string {
  if (format === 'sarif') return `${JSON.stringify(toSarif(input), null, 2)}\n`;
  if (format === 'junit') return `${toJunit(input)}\n`;
  if (format === 'html') return `${toHtml(input)}\n`;
  return stringifyCanonical(input as never);
}

function toSarif(input: ValidationReportInput): Record<string, unknown> {
  const findings = input.findings;
  const rules = [...new Map(findings.map((item) => [item.code, item])).values()].map((item) => ({
    id: item.code,
    shortDescription: { text: item.message },
    helpUri: item.help,
  }));
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: { driver: { name: 'eom-validator', version: '1.0.0-rc.3', rules } },
        results: findings.map((item) => ({
          ruleId: item.code,
          level:
            item.severity === 'error' ? 'error' : item.severity === 'warning' ? 'warning' : 'note',
          message: { text: item.message },
          ...(item.resource || item.pointer
            ? {
                locations: [
                  {
                    ...(item.resource
                      ? { physicalLocation: { artifactLocation: { uri: item.resource } } }
                      : {}),
                    ...(item.pointer
                      ? { logicalLocations: [{ fullyQualifiedName: item.pointer }] }
                      : {}),
                  },
                ],
              }
            : {}),
        })),
      },
    ],
  };
}

function toJunit(input: ValidationReportInput): string {
  const findings = input.findings;
  const failures = findings.filter((item) => item.severity === 'error').length;
  const cases =
    findings.length > 0
      ? findings
      : [
          {
            code: 'EOM_CLEAN',
            category: 'quality',
            severity: 'info',
            message: 'No findings.',
          } satisfies Finding,
        ];
  return [
    `<testsuite name="eom-validator" tests="${cases.length}" failures="${failures}" errors="0">`,
    ...cases.map((item) => {
      const body =
        item.severity === 'error' ? `<failure message="${escapeXml(item.message)}" />` : '';
      return `  <testcase classname="${escapeXml(item.category)}" name="${escapeXml(item.code)}">${body}</testcase>`;
    }),
    '</testsuite>',
  ].join('\n');
}

function toHtml(input: ValidationReportInput): string {
  const rows = input.findings
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.severity)}</td><td><code>${escapeHtml(item.code)}</code></td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.resource ?? '')}${escapeHtml(item.pointer ?? '')}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>EOM validation report</title><style>body{font:system-ui,sans-serif;margin:2rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd;padding:.5rem;text-align:left}code{font-family:ui-monospace,monospace}</style></head><body><h1>EOM validation report</h1><p>Status: <strong>${input.valid ? 'valid' : 'invalid'}</strong></p><table><thead><tr><th>Severity</th><th>Code</th><th>Category</th><th>Message</th><th>Location</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No findings.</td></tr>'}</tbody></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}
