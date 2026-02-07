/**
 * JSON Schema validator — validate API responses against user-defined schemas.
 * Supports JSON Schema draft-07 subset: type, required, properties, items,
 * enum, pattern, minimum, maximum, minLength, maxLength, format.
 */

export interface SchemaError {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: SchemaError[];
  checkedPaths: number;
}

export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
  description?: string;
  additionalProperties?: boolean | JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  nullable?: boolean;
}

const FORMAT_VALIDATORS: Record<string, (v: string) => boolean> = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uri: (v) => { try { new URL(v); return true; } catch { return false; } },
  url: (v) => { try { new URL(v); return true; } catch { return false; } },
  'date-time': (v) => !isNaN(Date.parse(v)),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
  ipv4: (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v),
};

function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate a value against a JSON Schema. Returns errors at each path.
 */
export function validateSchema(value: unknown, schema: JSONSchema, path = '$'): SchemaError[] {
  const errors: SchemaError[] = [];

  // Nullable check
  if (value === null && schema.nullable) return errors;

  // Type check
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = getType(value);
    // "integer" is a subset of "number"
    const typeMatch = types.some((t) =>
      t === actualType || (t === 'integer' && actualType === 'number' && Number.isInteger(value)) || (t === 'null' && value === null)
    );
    if (!typeMatch) {
      errors.push({ path, message: `Expected type ${types.join(' | ')}, got ${actualType}`, expected: types.join(' | '), received: actualType });
      return errors; // Short-circuit on type mismatch
    }
  }

  // Enum check
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push({ path, message: `Value must be one of: ${schema.enum.join(', ')}`, expected: schema.enum.join(' | '), received: String(value) });
    }
  }

  // String validations
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `String too short (min ${schema.minLength})`, expected: `>= ${schema.minLength} chars`, received: `${value.length} chars` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, message: `String too long (max ${schema.maxLength})`, expected: `<= ${schema.maxLength} chars`, received: `${value.length} chars` });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          errors.push({ path, message: `Does not match pattern: ${schema.pattern}` });
        }
      } catch { /* invalid regex, skip */ }
    }
    if (schema.format && FORMAT_VALIDATORS[schema.format]) {
      if (!FORMAT_VALIDATORS[schema.format](value)) {
        errors.push({ path, message: `Invalid format: expected ${schema.format}` });
      }
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `Value ${value} < minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `Value ${value} > maximum ${schema.maximum}` });
    }
  }

  // Object validations
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    // Required properties
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          errors.push({ path: `${path}.${key}`, message: `Missing required property: ${key}` });
        }
      }
    }

    // Property schemas
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateSchema(obj[key], propSchema, `${path}.${key}`));
        }
      }
    }
  }

  // Array validations
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `Array too short (min ${schema.minItems} items)`, expected: `>= ${schema.minItems}`, received: `${value.length}` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `Array too long (max ${schema.maxItems} items)`, expected: `<= ${schema.maxItems}`, received: `${value.length}` });
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateSchema(value[i], schema.items, `${path}[${i}]`));
      }
    }
  }

  return errors;
}

/**
 * Run full validation and return structured result.
 */
export function validate(value: unknown, schema: JSONSchema): ValidationResult {
  const errors = validateSchema(value, schema);
  return {
    valid: errors.length === 0,
    errors,
    checkedPaths: countPaths(schema),
  };
}

function countPaths(schema: JSONSchema, depth = 0): number {
  if (depth > 20) return 0;
  let count = 1;
  if (schema.properties) {
    for (const ps of Object.values(schema.properties)) {
      count += countPaths(ps, depth + 1);
    }
  }
  if (schema.items) {
    count += countPaths(schema.items, depth + 1);
  }
  return count;
}

/**
 * Auto-generate a JSON Schema from a sample value.
 */
export function generateSchema(value: unknown, maxDepth = 5, depth = 0): JSONSchema {
  if (depth >= maxDepth) return {};

  if (value === null) return { type: 'null' };

  if (Array.isArray(value)) {
    const schema: JSONSchema = { type: 'array' };
    if (value.length > 0) {
      schema.items = generateSchema(value[0], maxDepth, depth + 1);
    }
    return schema;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      properties[key] = generateSchema(val, maxDepth, depth + 1);
      required.push(key);
    }

    return { type: 'object', properties, required };
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  }

  if (typeof value === 'boolean') return { type: 'boolean' };

  if (typeof value === 'string') {
    // Detect common formats
    const schema: JSONSchema = { type: 'string' };
    if (FORMAT_VALIDATORS.email(value)) schema.format = 'email';
    else if (FORMAT_VALIDATORS['date-time'](value) && value.includes('T')) schema.format = 'date-time';
    else if (FORMAT_VALIDATORS.uuid(value)) schema.format = 'uuid';
    else if (FORMAT_VALIDATORS.uri(value)) schema.format = 'uri';
    return schema;
  }

  return {};
}
