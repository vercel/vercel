import { randomBytes } from 'node:crypto';
import deepEqual from 'fast-deep-equal';
import {
  formatFlagConditionComparatorList,
  FLAG_CONDITION_LIST_COMPARATORS,
  FLAG_CONDITION_RHS_OPTIONAL_COMPARATORS,
} from './comparators';
import type {
  SegmentComparator,
  SegmentCondition,
  SegmentConditionValue,
  SegmentData,
  SegmentMembershipOperation,
  SegmentOperation,
  SegmentOperationAction,
  SegmentRule,
  SegmentRuleOutcome,
  SegmentValue,
} from './types';

const OPERATOR_ALIASES: Record<string, SegmentComparator> = {
  '=': 'eq',
  '==': 'eq',
  eq: 'eq',
  equals: 'eq',
  equal: 'eq',
  'does-not-equal': '!eq',
  'not-equals': '!eq',
  'not-equal': '!eq',
  '!=': '!eq',
  '!eq': '!eq',
  in: 'oneOf',
  oneof: 'oneOf',
  'one-of': 'oneOf',
  oneOf: 'oneOf',
  'not-in': '!oneOf',
  'not-one-of': '!oneOf',
  '!oneof': '!oneOf',
  '!oneOf': '!oneOf',
  containsallof: 'containsAllOf',
  'contains-all-of': 'containsAllOf',
  containsAllOf: 'containsAllOf',
  containsanyof: 'containsAnyOf',
  'contains-any-of': 'containsAnyOf',
  containsAnyOf: 'containsAnyOf',
  containsnoneof: 'containsNoneOf',
  'contains-none-of': 'containsNoneOf',
  containsNoneOf: 'containsNoneOf',
  startswith: 'startsWith',
  'starts-with': 'startsWith',
  startsWith: 'startsWith',
  endswith: 'endsWith',
  'ends-with': 'endsWith',
  endsWith: 'endsWith',
  contains: 'contains',
  '!contains': '!contains',
  'does-not-contain': '!contains',
  notcontains: '!contains',
  'not-contains': '!contains',
  notContains: '!contains',
  exists: 'ex',
  ex: 'ex',
  '!exists': '!ex',
  'not-exists': '!ex',
  '!ex': '!ex',
  gt: 'gt',
  '>': 'gt',
  gte: 'gte',
  '>=': 'gte',
  lt: 'lt',
  '<': 'lt',
  lte: 'lte',
  '<=': 'lte',
};

const LIST_OPERATORS = new Set<SegmentComparator>(
  FLAG_CONDITION_LIST_COMPARATORS
);
const RHS_OPTIONAL_OPERATORS = new Set<SegmentComparator>(
  FLAG_CONDITION_RHS_OPTIONAL_COMPARATORS
);

function shortId(prefix: string): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(12);
  let id = prefix;
  for (let i = 0; i < bytes.length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

export function parseSegmentDataInput(input: string): SegmentData {
  const value = parseJson(input, 'segment data');
  if (!isRecord(value)) {
    throw new Error('Segment data must be a JSON object');
  }

  return value as SegmentData;
}

export function parseSegmentRuleInput(
  input: string,
  outcome: SegmentRuleOutcome = { type: 'all' }
): SegmentRule {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Segment rule cannot be empty');
  }

  if (trimmed.startsWith('{')) {
    const value = parseJson(trimmed, 'segment rule');
    if (!isRecord(value)) {
      throw new Error('Segment rule JSON must be an object');
    }
    return value as unknown as SegmentRule;
  }

  const conditions = trimmed
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(parseSegmentConditionInput);

  if (conditions.length === 0) {
    throw new Error('Segment rule must include at least one condition');
  }

  return {
    id: shortId('rule_'),
    conditions,
    outcome,
  };
}

export function parseSegmentConditionInput(input: string): SegmentCondition {
  const [field, operator, ...valueParts] = input.split(':');
  if (!field || !operator) {
    throw new Error(
      `Invalid segment rule "${input}". Use ENTITY.ATTRIBUTE:OPERATOR:VALUE, for example user.email:ends-with:@vercel.com.`
    );
  }

  const lhs = parseEntityAttribute(field);
  const cmp = parseComparator(operator);
  const rawValue = valueParts.join(':');

  if (!rawValue && !RHS_OPTIONAL_OPERATORS.has(cmp)) {
    throw new Error(`Segment rule "${input}" is missing a value`);
  }

  return {
    lhs,
    cmp,
    ...(rawValue ? { rhs: parseConditionValue(rawValue, cmp) } : {}),
  };
}

export function parseSegmentValueInput(input: string): {
  entity: string;
  attribute: string;
  value: SegmentValue;
} {
  const separatorIndex = input.indexOf('=');
  if (separatorIndex === -1) {
    throw new Error(
      `Invalid segment value "${input}". Use ENTITY.ATTRIBUTE=VALUE.`
    );
  }

  const lhs = input.slice(0, separatorIndex).trim();
  const rawValue = input.slice(separatorIndex + 1).trim();
  if (!rawValue) {
    throw new Error(`Invalid segment value "${input}". Value cannot be empty.`);
  }

  const { kind: entity, attribute } = parseEntityAttribute(lhs);
  const { value, note } = splitValueNote(rawValue);

  return {
    entity,
    attribute,
    value: note ? { value, note } : { value },
  };
}

export function addSegmentValue(
  data: SegmentData,
  field: 'include' | 'exclude',
  input: string
): void {
  const { entity, attribute, value } = parseSegmentValueInput(input);
  const map = data[field] ?? {};
  const entityValues = map[entity] ?? {};
  const values = entityValues[attribute] ?? [];
  entityValues[attribute] = values.concat(value);
  map[entity] = entityValues;
  data[field] = map;
}

export function buildSegmentOperations(
  field: 'include' | 'exclude',
  action: SegmentOperationAction,
  inputs: string[]
): SegmentMembershipOperation[] {
  return inputs.map(input => {
    const { entity, attribute, value } = parseSegmentValueInput(input);
    return {
      action,
      field,
      entity,
      attribute,
      value,
    };
  });
}

export function buildSegmentRuleOperations(
  action: SegmentOperationAction,
  inputs: string[]
): SegmentOperation[] {
  return inputs.map(input => buildSegmentRuleOperation(action, input));
}

export function buildSegmentTargetOperations(
  action: SegmentOperationAction,
  inputs: string[]
): SegmentOperation[] {
  return inputs.map(input => parseSegmentTargetOperation(action, input));
}

export function applySegmentOperations(
  data: SegmentData,
  operations: SegmentOperation[]
): SegmentData {
  const next = normalizeSegmentData({
    rules: structuredClone(data.rules ?? []),
    include: structuredClone(data.include ?? {}),
    exclude: structuredClone(data.exclude ?? {}),
  });

  for (const operation of operations) {
    if (operation.field === 'rule') {
      if (operation.action === 'add') {
        next.rules = (next.rules ?? []).concat(structuredClone(operation.rule));
      } else if (operation.ruleId) {
        const rules = next.rules ?? [];
        const ruleExists = rules.some(rule => rule.id === operation.ruleId);
        if (!ruleExists) {
          throw new Error(`Segment rule "${operation.ruleId}" does not exist.`);
        }
        next.rules = rules.filter(rule => rule.id !== operation.ruleId);
      } else if (operation.rule) {
        const ruleToRemove = operation.rule;
        const rules = next.rules ?? [];
        const ruleExists = rules.some(rule =>
          segmentRulesEqual(rule, ruleToRemove)
        );
        if (!ruleExists) {
          throw new Error('Segment rule does not exist.');
        }
        next.rules = rules.filter(
          rule => !segmentRulesEqual(rule, ruleToRemove)
        );
      }
      continue;
    }

    if (operation.action === 'add') {
      const map = next[operation.field] ?? {};
      const entityValues = map[operation.entity] ?? {};
      const values = entityValues[operation.attribute] ?? [];
      entityValues[operation.attribute] = values.concat(operation.value);
      map[operation.entity] = entityValues;
      next[operation.field] = map;
      continue;
    }

    const map = next[operation.field];
    const entityValues = map?.[operation.entity];
    const values = entityValues?.[operation.attribute];
    const valueExists = values?.some(
      value => value.value === operation.value.value
    );
    if (!values || !valueExists) {
      throw new Error(
        `Segment ${operation.field} value "${operation.entity}.${operation.attribute}=${operation.value.value}" does not exist.`
      );
    }
    entityValues![operation.attribute] = values.filter(
      value => value.value !== operation.value.value
    );
  }

  return next;
}

function parseSegmentTargetOperation(
  action: SegmentOperationAction,
  input: string
): SegmentOperation {
  const separatorIndex = input.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error(
      `Invalid segment operation "${input}". Use include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, or rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE.`
    );
  }

  const field = input.slice(0, separatorIndex).trim().toLowerCase();
  const valueInput = input.slice(separatorIndex + 1).trim();
  if (!valueInput) {
    throw new Error(`Invalid segment operation "${input}". Target is empty.`);
  }

  if (field === 'include' || field === 'exclude') {
    const { entity, attribute, value } = parseSegmentValueInput(valueInput);
    return {
      action,
      field,
      entity,
      attribute,
      value,
    };
  }

  if (field === 'rule' || field === 'rules') {
    return buildSegmentRuleOperation(action, valueInput);
  }

  throw new Error(
    `Invalid segment operation target "${field}". Use include, exclude, or rule.`
  );
}

function buildSegmentRuleOperation(
  action: SegmentOperationAction,
  input: string
): SegmentOperation {
  if (action === 'remove' && isRuleIdInput(input)) {
    return {
      action,
      field: 'rule',
      ruleId: input.trim(),
    };
  }

  const rule = parseSegmentRuleInput(input);
  if (action === 'add') {
    return {
      action,
      field: 'rule',
      rule,
    };
  }

  return {
    action,
    field: 'rule',
    rule,
  };
}

export function normalizeSegmentData(data: SegmentData): SegmentData {
  return {
    rules: data.rules ?? [],
    include: data.include ?? {},
    exclude: data.exclude ?? {},
  };
}

function segmentRulesEqual(a: SegmentRule, b: SegmentRule): boolean {
  return deepEqual(getComparableRule(a), getComparableRule(b));
}

function getComparableRule(rule: SegmentRule) {
  return {
    conditions: rule.conditions,
    outcome: rule.outcome,
  };
}

function isRuleIdInput(input: string): boolean {
  const trimmed = input.trim();
  return (
    !trimmed.startsWith('{') && !trimmed.includes(':') && !trimmed.includes('.')
  );
}

function parseComparator(input: string): SegmentComparator {
  const normalized = input.trim();
  const lowercase = normalized.toLowerCase();
  const comparator =
    OPERATOR_ALIASES[normalized] ?? OPERATOR_ALIASES[lowercase];
  if (!comparator) {
    throw new Error(
      `Invalid segment rule operator "${input}". Valid operators: ${formatFlagConditionComparatorList()}.`
    );
  }
  return comparator;
}

function parseEntityAttribute(input: string): {
  type: 'entity';
  kind: string;
  attribute: string;
} {
  const [kind, ...attributeParts] = input.trim().split('.');
  const attribute = attributeParts.join('.');
  if (!kind || !attribute) {
    throw new Error(
      `Invalid entity attribute "${input}". Use ENTITY.ATTRIBUTE.`
    );
  }

  return {
    type: 'entity',
    kind,
    attribute,
  };
}

function parseConditionValue(
  input: string,
  comparator: SegmentComparator
): SegmentConditionValue {
  const trimmed = input.trim();

  if (LIST_OPERATORS.has(comparator)) {
    return {
      type: 'list',
      items: trimmed
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => ({ value: parseListItemValue(value) })),
    };
  }

  return parseScalarValue(trimmed);
}

function parseScalarValue(value: string): string | number | boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}

function parseListItemValue(value: string): string | number {
  if (value !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}

function splitValueNote(input: string): SegmentValue {
  const separatorIndex = input.indexOf('|');
  if (separatorIndex === -1) {
    return { value: input };
  }

  const value = input.slice(0, separatorIndex).trim();
  const note = input.slice(separatorIndex + 1).trim();
  return note ? { value, note } : { value };
}

function parseJson(input: string, label: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error(`Invalid JSON for ${label}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
