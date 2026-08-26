import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import { isJsonObject, type JsonValue } from '@paperandslate/eom-core';
import { readAllSchemas, schemaFileForType } from '@paperandslate/eom-schema';
import { finding, hasErrors, type Finding, type ValidationResult } from './findings.js';
import { semanticFindings } from './semantic.js';

export interface ValidationOptions {
  readonly schemaFile?: string;
  readonly semantic?: boolean;
  readonly now?: Date;
}

type AddFormats = (ajv: Ajv2020) => unknown;
const addFormats =
  (addFormatsModule as unknown as { default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats);

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    validateFormats: true,
    messages: true,
  });
  addFormats(ajv);
  for (const schema of readAllSchemas()) {
    ajv.addSchema(schema);
  }
  return ajv;
}

export function validateDocument(
  document: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const findings: Finding[] = [];
  if (!isJsonObject(document)) {
    findings.push(
      finding(
        'EOM_DOCUMENT_OBJECT_REQUIRED',
        'structural',
        'The publication must be a JSON object.',
      ),
    );
    return { valid: false, structuralValid: false, semanticValid: false, findings };
  }
  const type = typeof document.type === 'string' ? document.type : undefined;
  const schemaFile = options.schemaFile ?? (type ? schemaFileForType(type) : undefined);
  if (!schemaFile) {
    findings.push(
      finding(
        'EOM_SCHEMA_UNKNOWN_TYPE',
        'structural',
        'No bundled EOM 1.0 schema is registered for this document type.',
        {
          pointer: '/type',
          help: 'Choose a registered resource type or add its schema to the versioned catalog.',
        },
      ),
    );
    return { valid: false, structuralValid: false, semanticValid: false, findings };
  }
  const ajv = createAjv();
  let valid: boolean;
  let schemaId: string | undefined;
  try {
    const schema = readAllSchemas().find((candidate) =>
      candidate.$id?.toString().endsWith(`/${schemaFile}`),
    );
    schemaId = typeof schema?.$id === 'string' ? schema.$id : undefined;
    const validator = schemaId ? ajv.getSchema(schemaId) : undefined;
    if (!validator) {
      findings.push(
        finding('EOM_SCHEMA_NOT_LOADED', 'structural', `Schema ${schemaFile} could not be loaded.`),
      );
      return schemaId
        ? { valid: false, structuralValid: false, semanticValid: false, schema: schemaId, findings }
        : { valid: false, structuralValid: false, semanticValid: false, findings };
    }
    valid = validator(document);
    if (!valid) {
      for (const error of validator.errors ?? []) {
        findings.push(ajvFinding(error));
      }
    }
  } catch (error) {
    findings.push(
      finding(
        'EOM_SCHEMA_ENGINE_FAILURE',
        'structural',
        error instanceof Error ? error.message : 'Schema engine failure.',
        {
          severity: 'error',
        },
      ),
    );
    return schemaId
      ? { valid: false, structuralValid: false, semanticValid: false, schema: schemaId, findings }
      : { valid: false, structuralValid: false, semanticValid: false, findings };
  }
  const structuralValid = valid;
  if (options.semantic !== false && structuralValid) {
    findings.push(
      ...semanticFindings(document, options.now === undefined ? {} : { now: options.now }),
    );
  }
  const semanticValid = !findings.some(
    (item) => item.category === 'semantic' && item.severity === 'error',
  );
  const result = {
    valid: structuralValid && semanticValid && !hasErrors(findings),
    structuralValid,
    semanticValid,
    findings,
  };
  return schemaId ? { ...result, schema: schemaId } : result;
}

export function validatePublication(
  document: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  return validateDocument(document, options);
}

function ajvFinding(error: ErrorObject): Finding {
  const pointer = error.instancePath || '/';
  const detail = error.message ? `: ${error.message}` : '';
  return finding(
    `EOM_SCHEMA_${error.keyword.toUpperCase()}`,
    'structural',
    `${pointer} ${error.keyword}${detail}`,
    {
      pointer,
      help: 'Fix the document to match the published EOM JSON Schema.',
    },
  );
}

export function isValidationResult(value: unknown): value is ValidationResult {
  return isJsonObject(value) && typeof value.valid === 'boolean' && Array.isArray(value.findings);
}

export function validateJsonValue(
  value: JsonValue,
  options: ValidationOptions = {},
): ValidationResult {
  return validateDocument(value, options);
}
