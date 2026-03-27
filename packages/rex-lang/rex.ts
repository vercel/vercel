// import { createRequire } from 'node:module';

// const require = createRequire(import.meta.url);
const rexGrammarModule =
  require('./rex.ohm-bundle.cjs') as typeof import('./rex.ohm-bundle');

const rexGrammar = rexGrammarModule?.default ?? rexGrammarModule;

export const grammar = rexGrammar;
export const semantics = rexGrammar.createSemantics();

export type IRNode =
  | { type: 'program'; body: IRNode[] }
  | { type: 'identifier'; name: string }
  | { type: 'self' }
  | { type: 'selfDepth'; depth: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'undefined' }
  | { type: 'number'; raw: string; value: number }
  | { type: 'string'; raw: string }
  | { type: 'array'; items: IRNode[] }
  | { type: 'arrayComprehension'; binding: IRBindingOrExpr; body: IRNode }
  | { type: 'whileArrayComprehension'; condition: IRNode; body: IRNode }
  | { type: 'object'; entries: { key: IRNode; value: IRNode }[] }
  | {
      type: 'objectComprehension';
      binding: IRBindingOrExpr;
      key: IRNode;
      value: IRNode;
    }
  | {
      type: 'whileObjectComprehension';
      condition: IRNode;
      key: IRNode;
      value: IRNode;
    }
  | { type: 'key'; name: string }
  | { type: 'group'; expression: IRNode }
  | {
      type: 'unary';
      op: 'neg' | 'not' | 'logicalNot' | 'delete';
      value: IRNode;
    }
  | {
      type: 'binary';
      op:
        | 'add'
        | 'sub'
        | 'mul'
        | 'div'
        | 'mod'
        | 'bitAnd'
        | 'bitOr'
        | 'bitXor'
        | 'and'
        | 'or'
        | 'nor'
        | 'eq'
        | 'neq'
        | 'gt'
        | 'gte'
        | 'lt'
        | 'lte';
      left: IRNode;
      right: IRNode;
    }
  | {
      type: 'assign';
      op: ':=' | '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=';
      place: IRNode;
      value: IRNode;
    }
  | {
      type: 'navigation';
      target: IRNode;
      segments: (
        | { type: 'static'; key: string }
        | { type: 'dynamic'; key: IRNode }
      )[];
    }
  | { type: 'call'; callee: IRNode; args: IRNode[] }
  | {
      type: 'conditional';
      head: 'when' | 'unless';
      condition: IRNode;
      thenBlock: IRNode[];
      elseBranch?: IRConditionalElse;
    }
  | { type: 'for'; binding: IRBindingOrExpr; body: IRNode[] }
  | { type: 'while'; condition: IRNode; body: IRNode[] }
  | { type: 'range'; from: IRNode; to: IRNode }
  | { type: 'break' }
  | { type: 'continue' };

export type IRBinding =
  | { type: 'binding:keyValueIn'; key: string; value: string; source: IRNode }
  | { type: 'binding:valueIn'; value: string; source: IRNode }
  | { type: 'binding:keyOf'; key: string; source: IRNode }
  | { type: 'binding:bareIn'; source: IRNode }
  | { type: 'binding:bareOf'; source: IRNode };

export type IRBindingOrExpr = IRBinding;

export type IRConditionalElse =
  | { type: 'else'; block: IRNode[] }
  | {
      type: 'elseChain';
      head: 'when' | 'unless';
      condition: IRNode;
      thenBlock: IRNode[];
      elseBranch?: IRConditionalElse;
    };

const DIGITS =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

const OPCODE_IDS = {
  do: '',
  add: 'ad',
  sub: 'sb',
  mul: 'ml',
  div: 'dv',
  eq: 'eq',
  neq: 'nq',
  lt: 'lt',
  lte: 'le',
  gt: 'gt',
  gte: 'ge',
  and: 'an',
  or: 'or',
  xor: 'xr',
  not: 'nt',
  boolean: 'bt',
  number: 'nm',
  string: 'st',
  array: 'ar',
  object: 'ob',
  mod: 'md',
  neg: 'ng',
  range: 'rn',
} as const;

type OpcodeName = keyof typeof OPCODE_IDS;

// Keyword identifiers that are reserved in the grammar and compile to opcodes when called.
const KEYWORD_OPCODES: ReadonlySet<string> = new Set([
  'boolean',
  'number',
  'string',
  'array',
  'object',
]);

type EncodeOptions = {
  domainRefs?: Record<string, string>;
  domainOpcodes?: Record<string, string>;
};

type CompileOptions = {
  optimize?: boolean;
  minifyNames?: boolean;
  dedupeValues?: boolean;
  dedupeMinBytes?: number;
  domainConfig?: unknown;
};

type RexDomainConfigEntry = {
  names?: unknown;
};

const BINARY_TO_OPCODE: Record<
  Exclude<Extract<IRNode, { type: 'binary' }>['op'], 'nor'>,
  OpcodeName
> = {
  add: 'add',
  sub: 'sub',
  mul: 'mul',
  div: 'div',
  mod: 'mod',
  bitAnd: 'and',
  bitOr: 'or',
  bitXor: 'xor',
  and: 'and',
  or: 'or',
  eq: 'eq',
  neq: 'neq',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
};

const ASSIGN_COMPOUND_TO_OPCODE: Partial<
  Record<Extract<IRNode, { type: 'assign' }>['op'], OpcodeName>
> = {
  '+=': 'add',
  '-=': 'sub',
  '*=': 'mul',
  '/=': 'div',
  '%=': 'mod',
  '&=': 'and',
  '|=': 'or',
  '^=': 'xor',
};

function encodeUint(value: number): string {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`Cannot encode non-uint value: ${value}`);
  if (value === 0) return '';
  let current = value;
  let out = '';
  while (current > 0) {
    const digit = current % 64;
    out = `${DIGITS[digit]}${out}`;
    current = Math.floor(current / 64);
  }
  return out;
}

function encodeZigzag(value: number): string {
  if (!Number.isInteger(value))
    throw new Error(`Cannot zigzag non-integer: ${value}`);
  const encoded = value >= 0 ? value * 2 : -value * 2 - 1;
  return encodeUint(encoded);
}

function encodeInt(value: number): string {
  return `${encodeZigzag(value)}+`;
}

function canUseBareString(value: string): boolean {
  for (const char of value) {
    if (!DIGITS.includes(char)) return false;
  }
  return true;
}

function decodeStringLiteral(raw: string): string {
  const quote = raw[0];
  if ((quote !== '"' && quote !== "'") || raw[raw.length - 1] !== quote) {
    throw new Error(`Invalid string literal: ${raw}`);
  }
  let out = '';
  for (let index = 1; index < raw.length - 1; index += 1) {
    const char = raw[index];
    if (char !== '\\') {
      out += char;
      continue;
    }
    index += 1;
    const esc = raw[index];
    if (esc === undefined) throw new Error(`Invalid escape sequence in ${raw}`);
    if (esc === 'n') out += '\n';
    else if (esc === 'r') out += '\r';
    else if (esc === 't') out += '\t';
    else if (esc === 'b') out += '\b';
    else if (esc === 'f') out += '\f';
    else if (esc === 'v') out += '\v';
    else if (esc === '0') out += '\0';
    else if (esc === 'x') {
      const hex = raw.slice(index + 1, index + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hex))
        throw new Error(`Invalid hex escape in ${raw}`);
      out += String.fromCodePoint(parseInt(hex, 16));
      index += 2;
    } else if (esc === 'u') {
      const hex = raw.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex))
        throw new Error(`Invalid unicode escape in ${raw}`);
      out += String.fromCodePoint(parseInt(hex, 16));
      index += 4;
    } else {
      out += esc;
    }
  }
  return out;
}

function encodeBareOrLengthString(value: string): string {
  if (canUseBareString(value)) return `${value}:`;
  return `${encodeUint(byteLength(value))},${value}`;
}

const DEC_PARTS = /^(-?\d)(?:\.(\d+))?e([+-]\d+)$/;

function splitDecimal(num: number): { base: number; exp: number } {
  const match = num.toExponential().match(DEC_PARTS);
  if (!match) throw new Error(`Failed to split decimal for ${num}`);
  const [, b1, b2 = '', e1] = match as RegExpMatchArray;
  const base = Number.parseInt(b1 + b2, 10);
  const exp = Number.parseInt(e1!, 10) - b2.length;
  return { base, exp };
}

function encodeDecimal(significand: number, power: number): string {
  return `${encodeZigzag(power)}*${encodeInt(significand)}`;
}

function encodeNumberNode(node: Extract<IRNode, { type: 'number' }>): string {
  const numberValue = node.value;
  if (Number.isNaN(numberValue)) return "nan'";
  if (numberValue === Infinity) return "inf'";
  if (numberValue === -Infinity) return "nif'";

  if (Number.isInteger(numberValue)) {
    const { base, exp } = splitDecimal(numberValue);
    if (exp >= 0 && exp <= 4) return encodeInt(numberValue);
    return encodeDecimal(base, exp);
  }

  const raw = node.raw.toLowerCase();
  const sign = raw.startsWith('-') ? -1 : 1;
  const unsigned = sign < 0 ? raw.slice(1) : raw;
  const splitExp = unsigned.split('e');
  const mantissaText = splitExp[0];
  const exponentText = splitExp[1] ?? '0';
  if (!mantissaText) throw new Error(`Invalid decimal literal: ${node.raw}`);
  const exponent = Number(exponentText);
  if (!Number.isInteger(exponent))
    throw new Error(`Invalid decimal exponent: ${node.raw}`);

  const dotIndex = mantissaText.indexOf('.');
  const decimals = dotIndex === -1 ? 0 : mantissaText.length - dotIndex - 1;
  const digits = mantissaText.replace('.', '');
  if (!/^\d+$/.test(digits))
    throw new Error(`Invalid decimal digits: ${node.raw}`);

  let significand = Number(digits) * sign;
  let power = exponent - decimals;
  while (significand !== 0 && significand % 10 === 0) {
    significand /= 10;
    power += 1;
  }
  return encodeDecimal(significand, power);
}

function encodeOpcode(opcode: OpcodeName): string {
  return `${OPCODE_IDS[opcode]}%`;
}

function encodeCallParts(parts: string[]): string {
  return `(${parts.join('')})`;
}

function needsOptionalPrefix(encoded: string): boolean {
  const first = encoded[0];
  if (!first) return false;
  return (
    first === '[' ||
    first === '{' ||
    first === '(' ||
    first === '=' ||
    first === '~' ||
    first === '?' ||
    first === '!' ||
    first === '|' ||
    first === '&' ||
    first === '>' ||
    first === '<' ||
    first === '#'
  );
}

function addOptionalPrefix(encoded: string): string {
  if (!needsOptionalPrefix(encoded)) return encoded;
  let payload = encoded;
  if (
    encoded.startsWith('?(') ||
    encoded.startsWith('!(') ||
    encoded.startsWith('|(') ||
    encoded.startsWith('&(') ||
    encoded.startsWith('>(') ||
    encoded.startsWith('<(') ||
    encoded.startsWith('#(')
  ) {
    payload = encoded.slice(2, -1);
  } else if (
    encoded.startsWith('>[') ||
    encoded.startsWith('>{') ||
    encoded.startsWith('<[') ||
    encoded.startsWith('<{') ||
    encoded.startsWith('#[') ||
    encoded.startsWith('#{')
  ) {
    payload = encoded.slice(2, -1);
  } else if (
    encoded.startsWith('[') ||
    encoded.startsWith('{') ||
    encoded.startsWith('(')
  ) {
    payload = encoded.slice(1, -1);
  } else if (encoded.startsWith('=') || encoded.startsWith('~')) {
    payload = encoded.slice(1);
  }
  return `${encodeUint(byteLength(payload))}${encoded}`;
}

function encodeBlockExpression(block: IRNode[]): string {
  if (block.length === 0) return "un'";
  if (block.length === 1) return encodeNode(block[0] as IRNode);
  return encodeCallParts([
    encodeOpcode('do'),
    ...block.map(node => encodeNode(node)),
  ]);
}

function encodeConditionalElse(elseBranch: IRConditionalElse): string {
  if (elseBranch.type === 'else')
    return encodeBlockExpression(elseBranch.block);
  const nested = {
    type: 'conditional',
    head: elseBranch.head,
    condition: elseBranch.condition,
    thenBlock: elseBranch.thenBlock,
    elseBranch: elseBranch.elseBranch,
  } satisfies IRNode;
  return encodeNode(nested);
}

function encodeDomainLookup(shortCode: string, tag: string): string {
  return `${shortCode}${tag}`;
}

function encodeNavigation(
  node: Extract<IRNode, { type: 'navigation' }>
): string {
  const domainRefs = activeEncodeOptions?.domainRefs;
  const domainOpcodes = activeEncodeOptions?.domainOpcodes;
  if ((domainRefs || domainOpcodes) && node.target.type === 'identifier') {
    const staticPath = [node.target.name];
    for (const segment of node.segments) {
      if (segment.type !== 'static') break;
      staticPath.push(segment.key);
    }

    for (let pathLength = staticPath.length; pathLength >= 1; pathLength -= 1) {
      const dottedName = staticPath.slice(0, pathLength).join('.');
      const refCode = domainRefs?.[dottedName];
      const opcodeCode = domainOpcodes?.[dottedName];
      const shortCode = refCode ?? opcodeCode;
      if (shortCode === undefined) continue;
      const tag = refCode !== undefined ? "'" : '%';

      const consumedStaticSegments = pathLength - 1;
      if (consumedStaticSegments === node.segments.length) {
        return encodeDomainLookup(shortCode, tag);
      }

      const parts = [encodeDomainLookup(shortCode, tag)];
      for (const segment of node.segments.slice(consumedStaticSegments)) {
        if (segment.type === 'static')
          parts.push(encodeBareOrLengthString(segment.key));
        else parts.push(encodeNode(segment.key));
      }
      return encodeCallParts(parts);
    }
  }

  const parts = [encodeNode(node.target)];
  for (const segment of node.segments) {
    if (segment.type === 'static')
      parts.push(encodeBareOrLengthString(segment.key));
    else parts.push(encodeNode(segment.key));
  }
  return encodeCallParts(parts);
}

function encodeWhile(node: Extract<IRNode, { type: 'while' }>): string {
  const cond = encodeNode(node.condition);
  const body = addOptionalPrefix(encodeBlockExpression(node.body));
  return `#(${cond}${body})`;
}

function encodeFor(node: Extract<IRNode, { type: 'for' }>): string {
  const body = addOptionalPrefix(encodeBlockExpression(node.body));
  if (node.binding.type === 'binding:bareIn') {
    return `>(${encodeNode(node.binding.source)}${body})`;
  }
  if (node.binding.type === 'binding:bareOf') {
    return `<(${encodeNode(node.binding.source)}${body})`;
  }
  if (node.binding.type === 'binding:valueIn') {
    return `>(${encodeNode(node.binding.source)}${node.binding.value}$${body})`;
  }
  if (node.binding.type === 'binding:keyValueIn') {
    return `>(${encodeNode(node.binding.source)}${node.binding.key}$${node.binding.value}$${body})`;
  }
  return `<(${encodeNode(node.binding.source)}${node.binding.key}$${body})`;
}

function encodeArrayComprehension(
  node: Extract<IRNode, { type: 'arrayComprehension' }>
): string {
  const body = addOptionalPrefix(encodeNode(node.body));
  if (node.binding.type === 'binding:bareIn') {
    return `>[${encodeNode(node.binding.source)}${body}]`;
  }
  if (node.binding.type === 'binding:bareOf') {
    return `<[${encodeNode(node.binding.source)}${body}]`;
  }
  if (node.binding.type === 'binding:valueIn') {
    return `>[${encodeNode(node.binding.source)}${node.binding.value}$${body}]`;
  }
  if (node.binding.type === 'binding:keyValueIn') {
    return `>[${encodeNode(node.binding.source)}${node.binding.key}$${node.binding.value}$${body}]`;
  }
  return `<[${encodeNode(node.binding.source)}${node.binding.key}$${body}]`;
}

function encodeObjectComprehension(
  node: Extract<IRNode, { type: 'objectComprehension' }>
): string {
  const key = addOptionalPrefix(encodeNode(node.key));
  const value = addOptionalPrefix(encodeNode(node.value));
  if (node.binding.type === 'binding:bareIn') {
    return `>{${encodeNode(node.binding.source)}${key}${value}}`;
  }
  if (node.binding.type === 'binding:bareOf') {
    return `<{${encodeNode(node.binding.source)}${key}${value}}`;
  }
  if (node.binding.type === 'binding:valueIn') {
    return `>{${encodeNode(node.binding.source)}${node.binding.value}$${key}${value}}`;
  }
  if (node.binding.type === 'binding:keyValueIn') {
    return `>{${encodeNode(node.binding.source)}${node.binding.key}$${node.binding.value}$${key}${value}}`;
  }
  return `<{${encodeNode(node.binding.source)}${node.binding.key}$${key}${value}}`;
}

function encodeWhileArrayComprehension(
  node: Extract<IRNode, { type: 'whileArrayComprehension' }>
): string {
  const cond = encodeNode(node.condition);
  const body = addOptionalPrefix(encodeNode(node.body));
  return `#[${cond}${body}]`;
}

function encodeWhileObjectComprehension(
  node: Extract<IRNode, { type: 'whileObjectComprehension' }>
): string {
  const cond = encodeNode(node.condition);
  const key = addOptionalPrefix(encodeNode(node.key));
  const value = addOptionalPrefix(encodeNode(node.value));
  return `#{${cond}${key}${value}}`;
}

let activeEncodeOptions: EncodeOptions | undefined;

function encodeNode(node: IRNode): string {
  switch (node.type) {
    case 'program':
      return encodeBlockExpression(node.body);
    case 'identifier': {
      const domainRef = activeEncodeOptions?.domainRefs?.[node.name];
      if (domainRef !== undefined) return `${domainRef}'`;
      const domainOpcode = activeEncodeOptions?.domainOpcodes?.[node.name];
      if (domainOpcode !== undefined) return `${domainOpcode}%`;
      return `${node.name}$`;
    }
    case 'self':
      return '@';
    case 'selfDepth': {
      if (!Number.isInteger(node.depth) || node.depth < 1)
        throw new Error(`Invalid self depth: ${node.depth}`);
      if (node.depth === 1) return '@';
      return `${encodeUint(node.depth - 1)}@`;
    }
    case 'boolean':
      return node.value ? "tr'" : "fl'";
    case 'null':
      return "nl'";
    case 'undefined':
      return "un'";
    case 'number':
      return encodeNumberNode(node);
    case 'string':
      return encodeBareOrLengthString(decodeStringLiteral(node.raw));
    case 'array': {
      const body = node.items
        .map(item => addOptionalPrefix(encodeNode(item)))
        .join('');
      return `[${body}]`;
    }
    case 'arrayComprehension':
      return encodeArrayComprehension(node);
    case 'whileArrayComprehension':
      return encodeWhileArrayComprehension(node);
    case 'object': {
      const body = node.entries
        .map(
          ({ key, value }) =>
            `${encodeNode(key)}${addOptionalPrefix(encodeNode(value))}`
        )
        .join('');
      return `{${body}}`;
    }
    case 'objectComprehension':
      return encodeObjectComprehension(node);
    case 'whileObjectComprehension':
      return encodeWhileObjectComprehension(node);
    case 'key':
      return encodeBareOrLengthString(node.name);
    case 'group':
      return encodeNode(node.expression);
    case 'unary':
      if (node.op === 'delete') return `~${encodeNode(node.value)}`;
      if (node.op === 'neg')
        return encodeCallParts([encodeOpcode('neg'), encodeNode(node.value)]);
      if (node.op === 'logicalNot') {
        const val = encodeNode(node.value);
        return `!(${val}tr')`;
      }
      return encodeCallParts([encodeOpcode('not'), encodeNode(node.value)]);
    case 'binary':
      if (node.op === 'and') {
        const operands = collectLogicalChain(node, 'and');
        const body = operands
          .map((operand, index) => {
            const encoded = encodeNode(operand);
            return index === 0 ? encoded : addOptionalPrefix(encoded);
          })
          .join('');
        return `&(${body})`;
      }
      if (node.op === 'or') {
        const operands = collectLogicalChain(node, 'or');
        const body = operands
          .map((operand, index) => {
            const encoded = encodeNode(operand);
            return index === 0 ? encoded : addOptionalPrefix(encoded);
          })
          .join('');
        return `|(${body})`;
      }
      if (node.op === 'nor') {
        const left = encodeNode(node.left);
        const right = addOptionalPrefix(encodeNode(node.right));
        return `!(${left}${right})`;
      }
      return encodeCallParts([
        encodeOpcode(BINARY_TO_OPCODE[node.op]),
        encodeNode(node.left),
        encodeNode(node.right),
      ]);
    case 'assign': {
      if (node.op === ':=')
        return `/${encodeNode(node.place)}${addOptionalPrefix(encodeNode(node.value))}`;
      if (node.op === '=')
        return `=${encodeNode(node.place)}${addOptionalPrefix(encodeNode(node.value))}`;
      const opcode = ASSIGN_COMPOUND_TO_OPCODE[node.op];
      if (!opcode) throw new Error(`Unsupported assignment op: ${node.op}`);
      const computedValue = encodeCallParts([
        encodeOpcode(opcode),
        encodeNode(node.place),
        encodeNode(node.value),
      ]);
      return `=${encodeNode(node.place)}${addOptionalPrefix(computedValue)}`;
    }
    case 'navigation':
      return encodeNavigation(node);
    case 'call': {
      // Keyword identifiers (boolean, number, string, array, object) are parsed
      // as identifier nodes but must be encoded as opcode calls, not variable navigation.
      if (
        node.callee.type === 'identifier' &&
        KEYWORD_OPCODES.has(node.callee.name)
      ) {
        return encodeCallParts([
          encodeOpcode(node.callee.name as OpcodeName),
          ...node.args.map(arg => encodeNode(arg)),
        ]);
      }
      return encodeCallParts([
        encodeNode(node.callee),
        ...node.args.map(arg => encodeNode(arg)),
      ]);
    }
    case 'conditional': {
      const opener = node.head === 'when' ? '?(' : '!(';
      const cond = encodeNode(node.condition);
      const thenExpr = addOptionalPrefix(encodeBlockExpression(node.thenBlock));
      const elseExpr = node.elseBranch
        ? addOptionalPrefix(encodeConditionalElse(node.elseBranch))
        : '';
      return `${opener}${cond}${thenExpr}${elseExpr})`;
    }
    case 'range':
      return encodeCallParts([
        encodeOpcode('range'),
        encodeNode(node.from),
        encodeNode(node.to),
      ]);
    case 'for':
      return encodeFor(node);
    case 'while':
      return encodeWhile(node);
    case 'break':
      return ';';
    case 'continue':
      return '1;';
    default: {
      const exhaustive: never = node;
      throw new Error(
        `Unsupported IR node ${(exhaustive as { type?: string }).type ?? 'unknown'}`
      );
    }
  }
}

function collectLogicalChain(node: IRNode, op: 'and' | 'or'): IRNode[] {
  if (node.type !== 'binary' || node.op !== op) return [node];
  return [
    ...collectLogicalChain(node.left, op),
    ...collectLogicalChain(node.right, op),
  ];
}

type ParseFailure = {
  message?: string;
  getRightmostFailurePosition?: () => number;
};

export function formatParseError(source: string, match: ParseFailure): string {
  const message = match.message ?? 'Parse failed';
  const pos = match.getRightmostFailurePosition?.();
  if (typeof pos !== 'number' || !Number.isFinite(pos)) return message;

  const safePos = Math.max(0, Math.min(source.length, pos));
  const lineStart = source.lastIndexOf('\n', safePos - 1) + 1;
  const lineEndIndex = source.indexOf('\n', safePos);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const lineText = source.slice(lineStart, lineEnd);
  // const lineNumber = source.slice(0, lineStart).split('\n').length;
  const columnNumber = safePos - lineStart + 1;
  const caret = `${' '.repeat(Math.max(0, columnNumber - 1))}^`;
  return `${message}\n  ${lineText}\n  ${caret}`;
}

export function parseToIR(source: string): IRNode {
  // @ts-expect-error: TODO
  const match = grammar.match(source);
  if (!match.succeeded()) {
    throw new Error(formatParseError(source, match as ParseFailure));
  }
  // @ts-expect-error: TODO
  return semantics(match).toIR() as IRNode;
}

function parseDataNode(node: IRNode): unknown {
  switch (node.type) {
    case 'group':
      return parseDataNode(node.expression);
    case 'program': {
      if (node.body.length === 1) return parseDataNode(node.body[0]!);
      if (node.body.length === 0) return undefined;
      throw new Error('Rex parse() expects a single data expression');
    }
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'boolean':
      return node.value;
    case 'number':
      return node.value;
    case 'string':
      return decodeStringLiteral(node.raw);
    case 'array':
      return node.items.map(item => parseDataNode(item));
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const entry of node.entries) {
        const keyNode = entry.key;
        let key: string;
        if (keyNode.type === 'key') key = keyNode.name;
        else {
          const keyValue = parseDataNode(keyNode);
          key = String(keyValue);
        }
        out[key] = parseDataNode(entry.value);
      }
      return out;
    }
    default:
      throw new Error(
        `Rex parse() only supports data expressions. Found: ${node.type}`
      );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isBareKeyName(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key);
}

function isNumericKey(key: string): boolean {
  if (key === '') return false;
  return String(Number(key)) === key && Number.isFinite(Number(key));
}

function stringifyKey(key: string): string {
  if (isBareKeyName(key)) return key;
  if (isNumericKey(key)) return key;
  return stringifyString(key);
}

function stringifyString(value: string): string {
  return JSON.stringify(value);
}

function stringifyInline(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (value === Infinity) return 'inf';
    if (value === -Infinity) return '-inf';
    return String(value);
  }
  if (typeof value === 'string') return stringifyString(value);
  if (Array.isArray(value)) {
    const len = value.length;
    if (len === 0) return '[]';
    let body = stringifyInline(value[0]);
    for (let i = 1; i < len; i++) body += ' ' + stringifyInline(value[i]);
    return `[${body}]`;
  }
  if (isPlainObject(value)) {
    let body = '';
    for (const k in value) {
      if (body) body += ' ';
      body += `${stringifyKey(k)}: ${stringifyInline(value[k])}`;
    }
    return body ? `{${body}}` : '{}';
  }
  throw new Error(
    `Rex stringify() cannot encode value of type ${typeof value}`
  );
}

function stringifyPretty(
  value: unknown,
  depth: number,
  indentSize: number,
  maxWidth: number
): string {
  // Primitives — no need to try inline then expand
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'nan';
    if (value === Infinity) return 'inf';
    if (value === -Infinity) return '-inf';
    return String(value);
  }
  if (typeof value === 'string') return stringifyString(value);

  const budget = maxWidth - depth * indentSize;

  if (Array.isArray(value)) {
    const len = value.length;
    if (len === 0) return '[]';
    // Try inline first with early bail
    let inline = '[';
    let fits = true;
    for (let i = 0; i < len; i++) {
      const item = value[i];
      if (typeof item === 'object' && item !== null) {
        fits = false;
        break;
      }
      const part = stringifyInline(item);
      inline += (i > 0 ? ' ' : '') + part;
      if (inline.length > budget) {
        fits = false;
        break;
      }
    }
    if (fits) {
      inline += ']';
      if (inline.length <= budget) return inline;
    }
    // Multi-line
    const indent = ' '.repeat(depth * indentSize);
    const childIndent = ' '.repeat((depth + 1) * indentSize);
    let result = '[\n';
    for (let i = 0; i < len; i++) {
      if (i > 0) result += '\n';
      result +=
        childIndent +
        stringifyPretty(value[i], depth + 1, indentSize, maxWidth);
    }
    return result + '\n' + indent + ']';
  }

  if (isPlainObject(value)) {
    // Try inline first with early bail
    let inline = '{';
    let fits = true;
    for (const k in value) {
      const v = value[k];
      if (typeof v === 'object' && v !== null) {
        fits = false;
        break;
      }
      const part = `${stringifyKey(k)}: ${stringifyInline(v)}`;
      if (inline.length > 1) inline += ' ';
      inline += part;
      if (inline.length > budget) {
        fits = false;
        break;
      }
    }
    if (fits) {
      if (inline.length === 1) return '{}';
      inline += '}';
      if (inline.length <= budget) return inline;
    }
    // Multi-line
    const indent = ' '.repeat(depth * indentSize);
    const childIndent = ' '.repeat((depth + 1) * indentSize);
    let result = '{\n';
    let first = true;
    for (const k in value) {
      if (!first) result += '\n';
      first = false;
      result += `${childIndent}${stringifyKey(k)}: ${stringifyPretty(value[k], depth + 1, indentSize, maxWidth)}`;
    }
    return result + '\n' + indent + '}';
  }

  return stringifyInline(value);
}

export function parse(source: string): unknown {
  return parseDataNode(parseToIR(source));
}

type DomainMaps = {
  domainRefs: Record<string, string>;
  domainOpcodes: Record<string, string>;
};

export function domainRefsFromConfig(config: unknown): DomainMaps {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Domain config must be an object');
  }
  const configObj = config as Record<string, unknown>;
  const domainRefs: Record<string, string> = {};
  const domainOpcodes: Record<string, string> = {};

  const dataSection = configObj.data;
  if (
    dataSection &&
    typeof dataSection === 'object' &&
    !Array.isArray(dataSection)
  ) {
    mapConfigEntries(dataSection as Record<string, unknown>, domainRefs);
  }

  const functionsSection = configObj.functions;
  if (
    functionsSection &&
    typeof functionsSection === 'object' &&
    !Array.isArray(functionsSection)
  ) {
    mapConfigEntries(
      functionsSection as Record<string, unknown>,
      domainOpcodes
    );
  }

  return { domainRefs, domainOpcodes };
}

function mapConfigEntries(
  entries: Record<string, unknown>,
  refs: Record<string, string>
) {
  const sourceKindByRoot = new Map<string, 'explicit' | 'implicit'>();
  for (const root of Object.keys(refs)) {
    sourceKindByRoot.set(root, 'explicit');
  }

  for (const [shortCode, rawEntry] of Object.entries(entries)) {
    const entry = rawEntry as RexDomainConfigEntry;
    if (!entry || typeof entry !== 'object') continue;
    if (!Array.isArray(entry.names)) continue;

    for (const rawName of entry.names) {
      if (typeof rawName !== 'string') continue;
      const existingRef = refs[rawName];
      if (existingRef !== undefined && existingRef !== shortCode) {
        throw new Error(
          `Conflicting refs for '${rawName}': ${existingRef} vs ${shortCode}`
        );
      }
      refs[rawName] = shortCode;

      const root = rawName.split('.')[0];
      if (!root) continue;
      const currentKind: 'explicit' | 'implicit' = rawName.includes('.')
        ? 'implicit'
        : 'explicit';
      const existing = refs[root];
      if (existing !== undefined) {
        if (existing === shortCode) continue;
        const existingKind = sourceKindByRoot.get(root) ?? 'explicit';
        if (currentKind === 'explicit') {
          throw new Error(
            `Conflicting refs for '${root}': ${existing} vs ${shortCode}`
          );
        }
        if (existingKind === 'explicit') continue;
        continue;
      }
      refs[root] = shortCode;
      sourceKindByRoot.set(root, currentKind);
    }
  }
}

export function stringify(
  value: unknown,
  options?: {
    indent?: number;
    maxWidth?: number;
    onLine?: (line: string) => void;
  }
): string {
  const indent = options?.indent ?? 2;
  const maxWidth = options?.maxWidth ?? 80;
  if (!Number.isInteger(indent) || indent < 0)
    throw new Error('Rex stringify() indent must be a non-negative integer');
  if (!Number.isInteger(maxWidth) || maxWidth < 20)
    throw new Error('Rex stringify() maxWidth must be an integer >= 20');
  if (options?.onLine) {
    stringifyStream(value, 0, indent, maxWidth, options.onLine);
    return '';
  }
  return stringifyPretty(value, 0, indent, maxWidth);
}

function stringifyStream(
  value: unknown,
  depth: number,
  indentSize: number,
  maxWidth: number,
  onLine: (line: string) => void
): void {
  // Primitives — emit inline
  if (value === undefined || value === null || typeof value !== 'object') {
    onLine(stringifyInline(value));
    return;
  }

  const budget = maxWidth - depth * indentSize;
  const pad = ' '.repeat(depth * indentSize);
  const childPad = ' '.repeat((depth + 1) * indentSize);

  if (Array.isArray(value)) {
    const len = value.length;
    if (len === 0) {
      onLine('[]');
      return;
    }
    // Try inline
    let inline = '[';
    let fits = true;
    for (let i = 0; i < len; i++) {
      const item = value[i];
      if (typeof item === 'object' && item !== null) {
        fits = false;
        break;
      }
      if (i > 0) inline += ' ';
      inline += stringifyInline(item);
      if (inline.length > budget) {
        fits = false;
        break;
      }
    }
    if (fits) {
      inline += ']';
      if (inline.length <= budget) {
        onLine(inline);
        return;
      }
    }
    // Stream multi-line
    onLine('[');
    for (let i = 0; i < len; i++) {
      const item = value[i];
      if (typeof item !== 'object' || item === null) {
        onLine(
          childPad + stringifyPretty(item, depth + 1, indentSize, maxWidth)
        );
      } else {
        streamNested(item, depth + 1, indentSize, maxWidth, childPad, onLine);
      }
    }
    onLine(pad + ']');
    return;
  }

  if (isPlainObject(value)) {
    // Try inline
    let inline = '{';
    let fits = true;
    for (const k in value) {
      const v = value[k];
      if (typeof v === 'object' && v !== null) {
        fits = false;
        break;
      }
      if (inline.length > 1) inline += ' ';
      inline += `${stringifyKey(k)}: ${stringifyInline(v)}`;
      if (inline.length > budget) {
        fits = false;
        break;
      }
    }
    if (fits) {
      if (inline.length === 1) {
        onLine('{}');
        return;
      }
      inline += '}';
      if (inline.length <= budget) {
        onLine(inline);
        return;
      }
    }
    // Stream multi-line
    onLine('{');
    for (const k in value) {
      const keyText = stringifyKey(k);
      const v = value[k];
      if (typeof v !== 'object' || v === null) {
        onLine(
          `${childPad}${keyText}: ${stringifyPretty(v, depth + 1, indentSize, maxWidth)}`
        );
      } else {
        streamNestedEntry(
          v,
          keyText,
          depth + 1,
          indentSize,
          maxWidth,
          childPad,
          onLine
        );
      }
    }
    onLine(pad + '}');
  }
}

function streamNested(
  value: unknown,
  depth: number,
  indentSize: number,
  maxWidth: number,
  pad: string,
  onLine: (line: string) => void
): void {
  const rendered = stringifyPretty(value, depth, indentSize, maxWidth);
  if (!rendered.includes('\n')) {
    onLine(pad + rendered);
    return;
  }
  const lines = rendered.split('\n');
  onLine(pad + lines[0]!);
  for (let i = 1; i < lines.length; i++) onLine(lines[i]!);
}

function streamNestedEntry(
  value: unknown,
  keyText: string,
  depth: number,
  indentSize: number,
  maxWidth: number,
  pad: string,
  onLine: (line: string) => void
): void {
  const rendered = stringifyPretty(value, depth, indentSize, maxWidth);
  if (!rendered.includes('\n')) {
    onLine(`${pad}${keyText}: ${rendered}`);
    return;
  }
  const lines = rendered.split('\n');
  onLine(`${pad}${keyText}: ${lines[0]!}`);
  for (let i = 1; i < lines.length; i++) onLine(lines[i]!);
}

const DIGIT_SET = new Set(DIGITS.split(''));
const DIGIT_INDEX = new Map<string, number>(
  Array.from(DIGITS).map((char, index) => [char, index])
);

type EncodedSpan = { start: number; end: number; raw: string };
type DedupeCandidate = {
  span: EncodedSpan;
  sizeBytes: number;
  offsetFromEnd: number;
};

function readPrefixAt(
  text: string,
  start: number
): { end: number; raw: string; value: number } {
  let index = start;
  while (index < text.length && DIGIT_SET.has(text[index] as string))
    index += 1;
  const raw = text.slice(start, index);
  let value = 0;
  for (const char of raw) {
    const digit = DIGIT_INDEX.get(char);
    if (digit === undefined)
      throw new Error(`Invalid prefix in encoded stream at ${start}`);
    value = value * 64 + digit;
  }
  return { end: index, raw, value };
}

function parsePlaceEnd(
  text: string,
  start: number,
  out?: EncodedSpan[]
): number {
  if (text[start] === '(') {
    let index = start + 1;
    while (index < text.length && text[index] !== ')') {
      index = parseValueEnd(text, index, out).end;
    }
    if (text[index] !== ')') throw new Error(`Unterminated place at ${start}`);
    return index + 1;
  }

  const prefix = readPrefixAt(text, start);
  const tag = text[prefix.end];
  if (tag !== '$' && tag !== "'") throw new Error(`Invalid place at ${start}`);
  let index = prefix.end + 1;
  if (text[index] !== '(') return index;
  index += 1;
  while (index < text.length && text[index] !== ')') {
    index = parseValueEnd(text, index, out).end;
  }
  if (text[index] !== ')') throw new Error(`Unterminated place at ${start}`);
  return index + 1;
}

function parseValueEnd(
  text: string,
  start: number,
  out?: EncodedSpan[]
): EncodedSpan {
  const prefix = readPrefixAt(text, start);
  const tag = text[prefix.end];
  if (!tag) throw new Error(`Unexpected end of encoded stream at ${start}`);

  if (tag === ',') {
    const strStart = prefix.end + 1;
    const strEnd = strStart + prefix.value;
    if (strEnd > text.length)
      throw new Error(`String overflows encoded stream at ${start}`);
    const raw = text.slice(start, strEnd);
    if (
      Buffer.byteLength(text.slice(strStart, strEnd), 'utf8') !== prefix.value
    ) {
      throw new Error(
        `Non-ASCII length-string not currently dedupe-safe at ${start}`
      );
    }
    const span = { start, end: strEnd, raw };
    if (out) out.push(span);
    return span;
  }

  if (tag === '=') {
    const placeEnd = parsePlaceEnd(text, prefix.end + 1, out);
    const valueEnd = parseValueEnd(text, placeEnd, out).end;
    const span = { start, end: valueEnd, raw: text.slice(start, valueEnd) };
    if (out) out.push(span);
    return span;
  }

  if (tag === '~') {
    const placeEnd = parsePlaceEnd(text, prefix.end + 1, out);
    const span = { start, end: placeEnd, raw: text.slice(start, placeEnd) };
    if (out) out.push(span);
    return span;
  }

  if (tag === '(' || tag === '[' || tag === '{') {
    const close = tag === '(' ? ')' : tag === '[' ? ']' : '}';
    let index = prefix.end + 1;
    while (index < text.length && text[index] !== close) {
      index = parseValueEnd(text, index, out).end;
    }
    if (text[index] !== close)
      throw new Error(`Unterminated container at ${start}`);
    const span = { start, end: index + 1, raw: text.slice(start, index + 1) };
    if (out) out.push(span);
    return span;
  }

  if (tag === '?' || tag === '!' || tag === '|' || tag === '&') {
    if (text[prefix.end + 1] !== '(')
      throw new Error(`Expected '(' after '${tag}' at ${start}`);
    let index = prefix.end + 2;
    while (index < text.length && text[index] !== ')') {
      index = parseValueEnd(text, index, out).end;
    }
    if (text[index] !== ')')
      throw new Error(`Unterminated flow container at ${start}`);
    const span = { start, end: index + 1, raw: text.slice(start, index + 1) };
    if (out) out.push(span);
    return span;
  }

  if (tag === '>' || tag === '<') {
    const open = text[prefix.end + 1];
    if (open !== '(' && open !== '[' && open !== '{')
      throw new Error(`Invalid loop opener at ${start}`);
    const close = open === '(' ? ')' : open === '[' ? ']' : '}';
    let index = prefix.end + 2;
    while (index < text.length && text[index] !== close) {
      index = parseValueEnd(text, index, out).end;
    }
    if (text[index] !== close)
      throw new Error(`Unterminated loop container at ${start}`);
    const span = { start, end: index + 1, raw: text.slice(start, index + 1) };
    if (out) out.push(span);
    return span;
  }

  const span = {
    start,
    end: prefix.end + 1,
    raw: text.slice(start, prefix.end + 1),
  };
  if (out) out.push(span);
  return span;
}

function gatherEncodedValueSpans(text: string): EncodedSpan[] {
  const spans: EncodedSpan[] = [];
  let index = 0;
  while (index < text.length) {
    const span = parseValueEnd(text, index, spans);
    index = span.end;
  }
  return spans;
}

function buildPointerToken(
  pointerStart: number,
  targetStart: number,
  occurrenceSize: number
): string | undefined {
  const offset = targetStart - pointerStart - occurrenceSize;
  if (offset < 0) return undefined;
  return `${encodeUint(offset)}^`;
}

function buildDedupeCandidateTable(
  encoded: string,
  minBytes: number
): Map<string, DedupeCandidate[]> {
  const spans = gatherEncodedValueSpans(encoded);
  const table = new Map<string, DedupeCandidate[]>();
  for (const span of spans) {
    const sizeBytes = span.raw.length;
    if (sizeBytes < minBytes) continue;
    const prefix = readPrefixAt(encoded, span.start);
    const tag = encoded[prefix.end];
    if (tag !== '{' && tag !== '[' && tag !== ',' && tag !== ':') continue;

    const offsetFromEnd = encoded.length - span.end;
    const entry: DedupeCandidate = {
      span,
      sizeBytes,
      offsetFromEnd,
    };

    if (!table.has(span.raw)) table.set(span.raw, []);
    (table.get(span.raw) as DedupeCandidate[]).push(entry);
  }
  return table;
}

function dedupeLargeEncodedValues(encoded: string, minBytes = 4): string {
  const effectiveMinBytes = Math.max(1, minBytes);
  let current = encoded;
  while (true) {
    const groups = buildDedupeCandidateTable(current, effectiveMinBytes);

    let replaced = false;
    for (const [value, occurrences] of groups.entries()) {
      if (occurrences.length < 2) continue;
      const canonical = occurrences[occurrences.length - 1] as DedupeCandidate;
      for (let index = occurrences.length - 2; index >= 0; index -= 1) {
        const occurrence = occurrences[index] as DedupeCandidate;
        if (occurrence.span.end > canonical.span.start) continue;

        if (current.slice(occurrence.span.start, occurrence.span.end) !== value)
          continue;

        const canonicalCurrentStart =
          current.length - canonical.offsetFromEnd - canonical.sizeBytes;
        const pointerToken = buildPointerToken(
          occurrence.span.start,
          canonicalCurrentStart,
          occurrence.sizeBytes
        );
        if (!pointerToken) continue;
        if (pointerToken.length >= occurrence.sizeBytes) continue;

        current = `${current.slice(0, occurrence.span.start)}${pointerToken}${current.slice(occurrence.span.end)}`;
        replaced = true;
        break;
      }
      if (replaced) break;
    }

    if (!replaced) return current;
  }
}

export function encodeIR(
  node: IRNode,
  options?: EncodeOptions & { dedupeValues?: boolean; dedupeMinBytes?: number }
): string {
  const previous = activeEncodeOptions;
  activeEncodeOptions = options;
  try {
    const encoded = encodeNode(node);
    if (options?.dedupeValues) {
      return dedupeLargeEncodedValues(encoded, options.dedupeMinBytes ?? 4);
    }
    return encoded;
  } finally {
    activeEncodeOptions = previous;
  }
}

type OptimizeEnv = {
  constants: Record<string, IRNode>;
  selfCaptures: Record<string, number>;
};

function cloneNode<T extends IRNode>(node: T): T {
  return structuredClone(node);
}

// function emptyOptimizeEnv(): OptimizeEnv {
//   return { constants: {}, selfCaptures: {} };
// }

function cloneOptimizeEnv(env: OptimizeEnv): OptimizeEnv {
  return {
    constants: { ...env.constants },
    selfCaptures: { ...env.selfCaptures },
  };
}

function clearOptimizeEnv(env: OptimizeEnv) {
  for (const key of Object.keys(env.constants)) delete env.constants[key];
  for (const key of Object.keys(env.selfCaptures)) delete env.selfCaptures[key];
}

function clearBinding(env: OptimizeEnv, name: string) {
  delete env.constants[name];
  delete env.selfCaptures[name];
}

function selfTargetFromNode(
  node: IRNode,
  currentDepth: number
): number | undefined {
  if (node.type === 'self') return currentDepth;
  if (node.type === 'selfDepth') {
    const target = currentDepth - (node.depth - 1);
    if (target >= 1) return target;
  }
  return undefined;
}

function selfNodeFromTarget(
  targetDepth: number,
  currentDepth: number
): IRNode | undefined {
  const relDepth = currentDepth - targetDepth + 1;
  if (!Number.isInteger(relDepth) || relDepth < 1) return undefined;
  if (relDepth === 1) return { type: 'self' } satisfies IRNode;
  return { type: 'selfDepth', depth: relDepth } satisfies IRNode;
}

function dropBindingNames(env: OptimizeEnv, binding: IRBindingOrExpr) {
  if (binding.type === 'binding:valueIn') {
    clearBinding(env, binding.value);
    return;
  }
  if (binding.type === 'binding:keyValueIn') {
    clearBinding(env, binding.key);
    clearBinding(env, binding.value);
    return;
  }
  if (binding.type === 'binding:keyOf') {
    clearBinding(env, binding.key);
  }
}

function optimizeBinding(
  binding: IRBindingOrExpr,
  sourceEnv: OptimizeEnv,
  currentDepth: number
): IRBinding {
  const source = optimizeNode(binding.source, sourceEnv, currentDepth);
  switch (binding.type) {
    case 'binding:bareIn':
      return { type: 'binding:bareIn', source };
    case 'binding:bareOf':
      return { type: 'binding:bareOf', source };
    case 'binding:valueIn':
      return { type: 'binding:valueIn', value: binding.value, source };
    case 'binding:keyValueIn':
      return {
        type: 'binding:keyValueIn',
        key: binding.key,
        value: binding.value,
        source,
      };
    case 'binding:keyOf':
      return { type: 'binding:keyOf', key: binding.key, source };
  }
}

function collectReads(node: IRNode, out: Set<string>) {
  switch (node.type) {
    case 'identifier':
      out.add(node.name);
      return;
    case 'group':
      collectReads(node.expression, out);
      return;
    case 'array':
      for (const item of node.items) collectReads(item, out);
      return;
    case 'object':
      for (const entry of node.entries) {
        collectReads(entry.key, out);
        collectReads(entry.value, out);
      }
      return;
    case 'arrayComprehension':
      collectReads(node.binding.source, out);
      collectReads(node.body, out);
      return;
    case 'whileArrayComprehension':
      collectReads(node.condition, out);
      collectReads(node.body, out);
      return;
    case 'objectComprehension':
      collectReads(node.binding.source, out);
      collectReads(node.key, out);
      collectReads(node.value, out);
      return;
    case 'whileObjectComprehension':
      collectReads(node.condition, out);
      collectReads(node.key, out);
      collectReads(node.value, out);
      return;
    case 'unary':
      collectReads(node.value, out);
      return;
    case 'binary':
      collectReads(node.left, out);
      collectReads(node.right, out);
      return;
    case 'assign':
      if (!(node.op === '=' && node.place.type === 'identifier'))
        collectReads(node.place, out);
      collectReads(node.value, out);
      return;
    case 'navigation':
      collectReads(node.target, out);
      for (const segment of node.segments) {
        if (segment.type === 'dynamic') collectReads(segment.key, out);
      }
      return;
    case 'call':
      collectReads(node.callee, out);
      for (const arg of node.args) collectReads(arg, out);
      return;
    case 'conditional':
      collectReads(node.condition, out);
      for (const part of node.thenBlock) collectReads(part, out);
      if (node.elseBranch) collectReadsElse(node.elseBranch, out);
      return;
    case 'for':
      collectReads(node.binding.source, out);
      for (const part of node.body) collectReads(part, out);
      return;
    case 'range':
      collectReads(node.from, out);
      collectReads(node.to, out);
      return;
    case 'program':
      for (const part of node.body) collectReads(part, out);
      return;
    default:
      return;
  }
}

function collectReadsElse(elseBranch: IRConditionalElse, out: Set<string>) {
  if (elseBranch.type === 'else') {
    for (const part of elseBranch.block) collectReads(part, out);
    return;
  }
  collectReads(elseBranch.condition, out);
  for (const part of elseBranch.thenBlock) collectReads(part, out);
  if (elseBranch.elseBranch) collectReadsElse(elseBranch.elseBranch, out);
}

function isPureNode(node: IRNode): boolean {
  switch (node.type) {
    case 'identifier':
    case 'self':
    case 'selfDepth':
    case 'boolean':
    case 'null':
    case 'undefined':
    case 'number':
    case 'string':
    case 'key':
      return true;
    case 'group':
      return isPureNode(node.expression);
    case 'array':
      return node.items.every(item => isPureNode(item));
    case 'object':
      return node.entries.every(
        entry => isPureNode(entry.key) && isPureNode(entry.value)
      );
    case 'navigation':
      return (
        isPureNode(node.target) &&
        node.segments.every(
          segment => segment.type === 'static' || isPureNode(segment.key)
        )
      );
    case 'unary':
      return node.op !== 'delete' && isPureNode(node.value);
    case 'binary':
      return isPureNode(node.left) && isPureNode(node.right);
    case 'range':
      return isPureNode(node.from) && isPureNode(node.to);
    default:
      return false;
  }
}

function eliminateDeadAssignments(block: IRNode[]): IRNode[] {
  const needed = new Set<string>();
  const out: IRNode[] = [];

  for (let index = block.length - 1; index >= 0; index -= 1) {
    const node = block[index] as IRNode;

    if (node.type === 'conditional') {
      let rewritten = node;
      if (
        node.condition.type === 'assign' &&
        node.condition.op === '=' &&
        node.condition.place.type === 'identifier'
      ) {
        const name = node.condition.place.name;
        const branchReads = new Set<string>();
        for (const part of node.thenBlock) collectReads(part, branchReads);
        if (node.elseBranch) collectReadsElse(node.elseBranch, branchReads);
        if (!needed.has(name) && !branchReads.has(name)) {
          rewritten = {
            type: 'conditional',
            head: node.head,
            condition: node.condition.value,
            thenBlock: node.thenBlock,
            elseBranch: node.elseBranch,
          } satisfies IRNode;
        }
      }

      collectReads(rewritten, needed);
      out.push(rewritten);
      continue;
    }

    if (
      node.type === 'assign' &&
      node.op === '=' &&
      node.place.type === 'identifier'
    ) {
      collectReads(node.value, needed);
      const name = node.place.name;
      const canDrop = !needed.has(name) && isPureNode(node.value);
      needed.delete(name);
      if (canDrop) continue;
      out.push(node);
      continue;
    }

    collectReads(node, needed);
    out.push(node);
  }

  out.reverse();
  return out;
}

function hasIdentifierRead(
  node: IRNode,
  name: string,
  asPlace = false
): boolean {
  if (node.type === 'identifier') return !asPlace && node.name === name;
  switch (node.type) {
    case 'group':
      return hasIdentifierRead(node.expression, name);
    case 'array':
      return node.items.some(item => hasIdentifierRead(item, name));
    case 'object':
      return node.entries.some(
        entry =>
          hasIdentifierRead(entry.key, name) ||
          hasIdentifierRead(entry.value, name)
      );
    case 'navigation':
      return (
        hasIdentifierRead(node.target, name) ||
        node.segments.some(
          segment =>
            segment.type === 'dynamic' && hasIdentifierRead(segment.key, name)
        )
      );
    case 'unary':
      return hasIdentifierRead(node.value, name, node.op === 'delete');
    case 'binary':
      return (
        hasIdentifierRead(node.left, name) ||
        hasIdentifierRead(node.right, name)
      );
    case 'range':
      return (
        hasIdentifierRead(node.from, name) || hasIdentifierRead(node.to, name)
      );
    case 'assign':
      return (
        hasIdentifierRead(node.place, name, true) ||
        hasIdentifierRead(node.value, name)
      );
    default:
      return false;
  }
}

function countIdentifierReads(
  node: IRNode,
  name: string,
  asPlace = false
): number {
  if (node.type === 'identifier') return !asPlace && node.name === name ? 1 : 0;
  switch (node.type) {
    case 'group':
      return countIdentifierReads(node.expression, name);
    case 'array':
      return node.items.reduce(
        (sum, item) => sum + countIdentifierReads(item, name),
        0
      );
    case 'object':
      return node.entries.reduce(
        (sum, entry) =>
          sum +
          countIdentifierReads(entry.key, name) +
          countIdentifierReads(entry.value, name),
        0
      );
    case 'navigation':
      return (
        countIdentifierReads(node.target, name) +
        node.segments.reduce(
          (sum, segment) =>
            sum +
            (segment.type === 'dynamic'
              ? countIdentifierReads(segment.key, name)
              : 0),
          0
        )
      );
    case 'unary':
      return countIdentifierReads(node.value, name, node.op === 'delete');
    case 'binary':
      return (
        countIdentifierReads(node.left, name) +
        countIdentifierReads(node.right, name)
      );
    case 'range':
      return (
        countIdentifierReads(node.from, name) +
        countIdentifierReads(node.to, name)
      );
    case 'assign':
      return (
        countIdentifierReads(node.place, name, true) +
        countIdentifierReads(node.value, name)
      );
    default:
      return 0;
  }
}

function replaceIdentifier(
  node: IRNode,
  name: string,
  replacement: IRNode,
  asPlace = false
): IRNode {
  if (node.type === 'identifier') {
    if (!asPlace && node.name === name) return cloneNode(replacement);
    return node;
  }

  switch (node.type) {
    case 'group':
      return {
        type: 'group',
        expression: replaceIdentifier(node.expression, name, replacement),
      } satisfies IRNode;
    case 'array':
      return {
        type: 'array',
        items: node.items.map(item =>
          replaceIdentifier(item, name, replacement)
        ),
      } satisfies IRNode;
    case 'object':
      return {
        type: 'object',
        entries: node.entries.map(entry => ({
          key: replaceIdentifier(entry.key, name, replacement),
          value: replaceIdentifier(entry.value, name, replacement),
        })),
      } satisfies IRNode;
    case 'navigation':
      return {
        type: 'navigation',
        target: replaceIdentifier(node.target, name, replacement),
        segments: node.segments.map(segment =>
          segment.type === 'static'
            ? segment
            : {
                type: 'dynamic',
                key: replaceIdentifier(segment.key, name, replacement),
              }
        ),
      } satisfies IRNode;
    case 'unary':
      return {
        type: 'unary',
        op: node.op,
        value: replaceIdentifier(
          node.value,
          name,
          replacement,
          node.op === 'delete'
        ),
      } satisfies IRNode;
    case 'binary':
      return {
        type: 'binary',
        op: node.op,
        left: replaceIdentifier(node.left, name, replacement),
        right: replaceIdentifier(node.right, name, replacement),
      } satisfies IRNode;
    case 'assign':
      return {
        type: 'assign',
        op: node.op,
        place: replaceIdentifier(node.place, name, replacement, true),
        value: replaceIdentifier(node.value, name, replacement),
      } satisfies IRNode;
    case 'range':
      return {
        type: 'range',
        from: replaceIdentifier(node.from, name, replacement),
        to: replaceIdentifier(node.to, name, replacement),
      } satisfies IRNode;
    default:
      return node;
  }
}

function isSafeInlineTargetNode(node: IRNode): boolean {
  if (isPureNode(node)) return true;
  if (node.type === 'assign' && node.op === '=') {
    return isPureNode(node.place) && isPureNode(node.value);
  }
  return false;
}

function inlineAdjacentPureAssignments(block: IRNode[]): IRNode[] {
  const out = [...block];
  let changed = true;

  while (changed) {
    changed = false;
    for (let index = 0; index < out.length - 1; index += 1) {
      const current = out[index] as IRNode;
      if (
        current.type !== 'assign' ||
        current.op !== '=' ||
        current.place.type !== 'identifier'
      )
        continue;
      if (!isPureNode(current.value)) continue;
      const name = current.place.name;
      if (hasIdentifierRead(current.value, name)) continue;

      const next = out[index + 1] as IRNode;
      if (!isSafeInlineTargetNode(next)) continue;
      if (countIdentifierReads(next, name) !== 1) continue;

      out[index + 1] = replaceIdentifier(next, name, current.value);
      out.splice(index, 1);
      changed = true;
      break;
    }
  }

  return out;
}

function toNumberNode(value: number): IRNode {
  let raw: string;
  if (Number.isNaN(value)) raw = 'nan';
  else if (value === Infinity) raw = 'inf';
  else if (value === -Infinity) raw = '-inf';
  else raw = String(value);
  return { type: 'number', raw, value } satisfies IRNode;
}

function toStringNode(value: string): IRNode {
  return { type: 'string', raw: JSON.stringify(value) } satisfies IRNode;
}

function toLiteralNode(value: unknown): IRNode | undefined {
  if (value === undefined) return { type: 'undefined' } satisfies IRNode;
  if (value === null) return { type: 'null' } satisfies IRNode;
  if (typeof value === 'boolean')
    return { type: 'boolean', value } satisfies IRNode;
  if (typeof value === 'number') return toNumberNode(value);
  if (typeof value === 'string') return toStringNode(value);
  if (Array.isArray(value)) {
    const items: IRNode[] = [];
    for (const item of value) {
      const lowered = toLiteralNode(item);
      if (!lowered) return undefined;
      items.push(lowered);
    }
    return { type: 'array', items } satisfies IRNode;
  }
  if (value && typeof value === 'object') {
    const entries: Array<{ key: IRNode; value: IRNode }> = [];
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      const loweredValue = toLiteralNode(entryValue);
      if (!loweredValue) return undefined;
      entries.push({ key: { type: 'key', name: key }, value: loweredValue });
    }
    return { type: 'object', entries } satisfies IRNode;
  }
  return undefined;
}

function constValue(node: IRNode): unknown | undefined {
  switch (node.type) {
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'boolean':
      return node.value;
    case 'number':
      return node.value;
    case 'string':
      return decodeStringLiteral(node.raw);
    case 'key':
      return node.name;
    case 'array': {
      const out: unknown[] = [];
      for (const item of node.items) {
        const value = constValue(item);
        if (value === undefined && item.type !== 'undefined') return undefined;
        out.push(value);
      }
      return out;
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const entry of node.entries) {
        const key = constValue(entry.key);
        if (key === undefined && entry.key.type !== 'undefined')
          return undefined;
        const value = constValue(entry.value);
        if (value === undefined && entry.value.type !== 'undefined')
          return undefined;
        out[String(key)] = value;
      }
      return out;
    }
    default:
      return undefined;
  }
}

function isDefinedValue(value: unknown): boolean {
  return value !== undefined;
}

function foldUnary(
  op: Extract<IRNode, { type: 'unary' }>['op'],
  value: unknown
): unknown | undefined {
  if (op === 'neg') {
    if (typeof value !== 'number') return undefined;
    return -value;
  }
  if (op === 'not') {
    if (typeof value === 'boolean') return !value;
    if (typeof value === 'number') return ~value;
    return undefined;
  }
  if (op === 'logicalNot') {
    return value === undefined ? true : undefined;
  }
  return undefined;
}

function foldBinary(
  op: Extract<IRNode, { type: 'binary' }>['op'],
  left: unknown,
  right: unknown
): unknown | undefined {
  if (
    op === 'add' ||
    op === 'sub' ||
    op === 'mul' ||
    op === 'div' ||
    op === 'mod'
  ) {
    if (typeof left !== 'number' || typeof right !== 'number') return undefined;
    if (op === 'add') return left + right;
    if (op === 'sub') return left - right;
    if (op === 'mul') return left * right;
    if (op === 'div') return left / right;
    return left % right;
  }

  if (op === 'bitAnd' || op === 'bitOr' || op === 'bitXor') {
    if (typeof left !== 'number' || typeof right !== 'number') return undefined;
    if (op === 'bitAnd') return left & right;
    if (op === 'bitOr') return left | right;
    return left ^ right;
  }

  if (op === 'eq') return left === right ? left : undefined;
  if (op === 'neq') return left !== right ? left : undefined;

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (typeof left !== 'number' || typeof right !== 'number') return undefined;
    if (op === 'gt') return left > right ? left : undefined;
    if (op === 'gte') return left >= right ? left : undefined;
    if (op === 'lt') return left < right ? left : undefined;
    return left <= right ? left : undefined;
  }

  if (op === 'and') return isDefinedValue(left) ? right : undefined;
  if (op === 'or') return isDefinedValue(left) ? left : right;
  return undefined;
}

function optimizeElse(
  elseBranch: IRConditionalElse | undefined,
  env: OptimizeEnv,
  currentDepth: number
): IRConditionalElse | undefined {
  if (!elseBranch) return undefined;
  if (elseBranch.type === 'else') {
    return {
      type: 'else',
      block: optimizeBlock(
        elseBranch.block,
        cloneOptimizeEnv(env),
        currentDepth
      ),
    } satisfies IRConditionalElse;
  }

  const optimizedCondition = optimizeNode(
    elseBranch.condition,
    env,
    currentDepth
  );
  const foldedCondition = constValue(optimizedCondition);
  if (
    foldedCondition !== undefined ||
    optimizedCondition.type === 'undefined'
  ) {
    const passes =
      elseBranch.head === 'when'
        ? isDefinedValue(foldedCondition)
        : !isDefinedValue(foldedCondition);
    if (passes) {
      return {
        type: 'else',
        block: optimizeBlock(
          elseBranch.thenBlock,
          cloneOptimizeEnv(env),
          currentDepth
        ),
      } satisfies IRConditionalElse;
    }
    return optimizeElse(elseBranch.elseBranch, env, currentDepth);
  }

  return {
    type: 'elseChain',
    head: elseBranch.head,
    condition: optimizedCondition,
    thenBlock: optimizeBlock(
      elseBranch.thenBlock,
      cloneOptimizeEnv(env),
      currentDepth
    ),
    elseBranch: optimizeElse(
      elseBranch.elseBranch,
      cloneOptimizeEnv(env),
      currentDepth
    ),
  } satisfies IRConditionalElse;
}

function optimizeBlock(
  block: IRNode[],
  env: OptimizeEnv,
  currentDepth: number
): IRNode[] {
  const out: IRNode[] = [];
  for (const node of block) {
    const optimized = optimizeNode(node, env, currentDepth);
    out.push(optimized);
    if (optimized.type === 'break' || optimized.type === 'continue') break;

    if (
      optimized.type === 'assign' &&
      optimized.op === '=' &&
      optimized.place.type === 'identifier'
    ) {
      const selfTarget = selfTargetFromNode(optimized.value, currentDepth);
      if (selfTarget !== undefined) {
        env.selfCaptures[optimized.place.name] = selfTarget;
        delete env.constants[optimized.place.name];
        continue;
      }

      const folded = constValue(optimized.value);
      if (folded !== undefined || optimized.value.type === 'undefined') {
        env.constants[optimized.place.name] = cloneNode(optimized.value);
        delete env.selfCaptures[optimized.place.name];
      } else {
        clearBinding(env, optimized.place.name);
      }
      continue;
    }

    if (
      optimized.type === 'unary' &&
      optimized.op === 'delete' &&
      optimized.value.type === 'identifier'
    ) {
      clearBinding(env, optimized.value.name);
      continue;
    }

    if (optimized.type === 'assign' && optimized.place.type === 'identifier') {
      clearBinding(env, optimized.place.name);
      continue;
    }

    if (
      optimized.type === 'assign' ||
      optimized.type === 'for' ||
      optimized.type === 'call'
    ) {
      clearOptimizeEnv(env);
    }
  }
  return inlineAdjacentPureAssignments(eliminateDeadAssignments(out));
}

function optimizeNode(
  node: IRNode,
  env: OptimizeEnv,
  currentDepth: number,
  asPlace = false
): IRNode {
  switch (node.type) {
    case 'program': {
      const body = optimizeBlock(
        node.body,
        cloneOptimizeEnv(env),
        currentDepth
      );
      if (body.length === 0) return { type: 'undefined' } satisfies IRNode;
      if (body.length === 1) return body[0] as IRNode;
      return { type: 'program', body } satisfies IRNode;
    }
    case 'identifier': {
      if (asPlace) return node;
      const selfTarget = env.selfCaptures[node.name];
      if (selfTarget !== undefined) {
        const rewritten = selfNodeFromTarget(selfTarget, currentDepth);
        if (rewritten) return rewritten;
      }
      const replacement = env.constants[node.name];
      return replacement ? cloneNode(replacement) : node;
    }
    case 'group': {
      return optimizeNode(node.expression, env, currentDepth);
    }
    case 'array': {
      return {
        type: 'array',
        items: node.items.map(item => optimizeNode(item, env, currentDepth)),
      } satisfies IRNode;
    }
    case 'object': {
      return {
        type: 'object',
        entries: node.entries.map(entry => ({
          key: optimizeNode(entry.key, env, currentDepth),
          value: optimizeNode(entry.value, env, currentDepth),
        })),
      } satisfies IRNode;
    }
    case 'unary': {
      const value = optimizeNode(
        node.value,
        env,
        currentDepth,
        node.op === 'delete'
      );
      const foldedValue = constValue(value);
      if (foldedValue !== undefined || value.type === 'undefined') {
        const folded = foldUnary(node.op, foldedValue);
        const literal =
          folded === undefined ? undefined : toLiteralNode(folded);
        if (literal) return literal;
      }
      return { type: 'unary', op: node.op, value } satisfies IRNode;
    }
    case 'binary': {
      const left = optimizeNode(node.left, env, currentDepth);
      const right = optimizeNode(node.right, env, currentDepth);
      const leftValue = constValue(left);
      const rightValue = constValue(right);
      if (
        (leftValue !== undefined || left.type === 'undefined') &&
        (rightValue !== undefined || right.type === 'undefined')
      ) {
        const folded = foldBinary(node.op, leftValue, rightValue);
        const literal =
          folded === undefined ? undefined : toLiteralNode(folded);
        if (literal) return literal;
      }
      return { type: 'binary', op: node.op, left, right } satisfies IRNode;
    }
    case 'range':
      return {
        type: 'range',
        from: optimizeNode(node.from, env, currentDepth),
        to: optimizeNode(node.to, env, currentDepth),
      } satisfies IRNode;
    case 'navigation': {
      const target = optimizeNode(node.target, env, currentDepth);
      const segments = node.segments.map(segment =>
        segment.type === 'static'
          ? segment
          : {
              type: 'dynamic',
              key: optimizeNode(segment.key, env, currentDepth),
            }
      );

      const targetValue = constValue(target);
      if (targetValue !== undefined || target.type === 'undefined') {
        let current: unknown = targetValue;
        let foldable = true;
        for (const segment of segments) {
          if (!foldable) break;
          const key =
            segment.type === 'static'
              ? segment.key
              : constValue(
                  // @ts-expect-error: TODO
                  segment.key
                );
          if (
            segment.type === 'dynamic' &&
            key === undefined &&
            segment.key.type !== 'undefined'
          ) {
            foldable = false;
            break;
          }
          if (current === null || current === undefined) {
            current = undefined;
            continue;
          }
          current = (current as Record<string, unknown>)[String(key)];
        }
        if (foldable) {
          const literal = toLiteralNode(current);
          if (literal) return literal;
        }
      }

      return {
        type: 'navigation',
        target,
        segments: segments as Extract<
          IRNode,
          { type: 'navigation' }
        >['segments'],
      } satisfies IRNode;
    }
    case 'call': {
      return {
        type: 'call',
        callee: optimizeNode(node.callee, env, currentDepth),
        args: node.args.map(arg => optimizeNode(arg, env, currentDepth)),
      } satisfies IRNode;
    }
    case 'assign': {
      return {
        type: 'assign',
        op: node.op,
        place: optimizeNode(node.place, env, currentDepth, true),
        value: optimizeNode(node.value, env, currentDepth),
      } satisfies IRNode;
    }
    case 'conditional': {
      const condition = optimizeNode(node.condition, env, currentDepth);
      const thenEnv = cloneOptimizeEnv(env);
      if (
        condition.type === 'assign' &&
        condition.op === '=' &&
        condition.place.type === 'identifier'
      ) {
        thenEnv.selfCaptures[condition.place.name] = currentDepth;
        delete thenEnv.constants[condition.place.name];
      }
      const conditionValue = constValue(condition);
      if (conditionValue !== undefined || condition.type === 'undefined') {
        const passes =
          node.head === 'when'
            ? isDefinedValue(conditionValue)
            : !isDefinedValue(conditionValue);
        if (passes) {
          const thenBlock = optimizeBlock(
            node.thenBlock,
            thenEnv,
            currentDepth
          );
          if (thenBlock.length === 0)
            return { type: 'undefined' } satisfies IRNode;
          if (thenBlock.length === 1) return thenBlock[0] as IRNode;
          return { type: 'program', body: thenBlock } satisfies IRNode;
        }
        if (!node.elseBranch) return { type: 'undefined' } satisfies IRNode;
        const loweredElse = optimizeElse(
          node.elseBranch,
          cloneOptimizeEnv(env),
          currentDepth
        );
        if (!loweredElse) return { type: 'undefined' } satisfies IRNode;
        if (loweredElse.type === 'else') {
          if (loweredElse.block.length === 0)
            return { type: 'undefined' } satisfies IRNode;
          if (loweredElse.block.length === 1)
            return loweredElse.block[0] as IRNode;
          return { type: 'program', body: loweredElse.block } satisfies IRNode;
        }
        return {
          type: 'conditional',
          head: loweredElse.head,
          condition: loweredElse.condition,
          thenBlock: loweredElse.thenBlock,
          elseBranch: loweredElse.elseBranch,
        } satisfies IRNode;
      }

      const thenBlock = optimizeBlock(node.thenBlock, thenEnv, currentDepth);
      const elseBranch = optimizeElse(
        node.elseBranch,
        cloneOptimizeEnv(env),
        currentDepth
      );

      // Strip dead assignment from condition: when x=expr do ... end
      // If x is no longer read in the optimized body/else, unwrap to just the value.
      let finalCondition = condition;
      if (
        condition.type === 'assign' &&
        condition.op === '=' &&
        condition.place.type === 'identifier'
      ) {
        const name = condition.place.name;
        const reads = new Set<string>();
        for (const part of thenBlock) collectReads(part, reads);
        if (elseBranch) collectReadsElse(elseBranch, reads);
        if (!reads.has(name)) {
          // @ts-expect-error: TODO
          finalCondition = condition.value;
        }
      }

      return {
        type: 'conditional',
        head: node.head,
        condition: finalCondition,
        thenBlock,
        elseBranch,
      } satisfies IRNode;
    }
    case 'for': {
      const sourceEnv = cloneOptimizeEnv(env);
      const binding = optimizeBinding(node.binding, sourceEnv, currentDepth);
      const bodyEnv = cloneOptimizeEnv(env);
      dropBindingNames(bodyEnv, binding);
      return {
        type: 'for',
        binding,
        body: optimizeBlock(node.body, bodyEnv, currentDepth + 1),
      } satisfies IRNode;
    }
    case 'arrayComprehension': {
      const sourceEnv = cloneOptimizeEnv(env);
      const binding = optimizeBinding(node.binding, sourceEnv, currentDepth);
      const bodyEnv = cloneOptimizeEnv(env);
      dropBindingNames(bodyEnv, binding);
      return {
        type: 'arrayComprehension',
        binding,
        body: optimizeNode(node.body, bodyEnv, currentDepth + 1),
      } satisfies IRNode;
    }
    case 'whileArrayComprehension':
      return {
        type: 'whileArrayComprehension',
        condition: optimizeNode(node.condition, env, currentDepth),
        body: optimizeNode(node.body, env, currentDepth + 1),
      } satisfies IRNode;
    case 'objectComprehension': {
      const sourceEnv = cloneOptimizeEnv(env);
      const binding = optimizeBinding(node.binding, sourceEnv, currentDepth);
      const bodyEnv = cloneOptimizeEnv(env);
      dropBindingNames(bodyEnv, binding);
      return {
        type: 'objectComprehension',
        binding,
        key: optimizeNode(node.key, bodyEnv, currentDepth + 1),
        value: optimizeNode(node.value, bodyEnv, currentDepth + 1),
      } satisfies IRNode;
    }
    case 'whileObjectComprehension':
      return {
        type: 'whileObjectComprehension',
        condition: optimizeNode(node.condition, env, currentDepth),
        key: optimizeNode(node.key, env, currentDepth + 1),
        value: optimizeNode(node.value, env, currentDepth + 1),
      } satisfies IRNode;
    default:
      return node;
  }
}

export function optimizeIR(node: IRNode): IRNode {
  // Optimization is temporarily disabled pending correctness fixes.
  return node;
}

function collectLocalBindings(node: IRNode, locals: Set<string>) {
  switch (node.type) {
    case 'assign':
      if (node.place.type === 'identifier') locals.add(node.place.name);
      collectLocalBindings(node.place, locals);
      collectLocalBindings(node.value, locals);
      return;
    case 'program':
      for (const part of node.body) collectLocalBindings(part, locals);
      return;
    case 'group':
      collectLocalBindings(node.expression, locals);
      return;
    case 'array':
      for (const item of node.items) collectLocalBindings(item, locals);
      return;
    case 'object':
      for (const entry of node.entries) {
        collectLocalBindings(entry.key, locals);
        collectLocalBindings(entry.value, locals);
      }
      return;
    case 'navigation':
      collectLocalBindings(node.target, locals);
      for (const segment of node.segments) {
        if (segment.type === 'dynamic')
          collectLocalBindings(segment.key, locals);
      }
      return;
    case 'call':
      collectLocalBindings(node.callee, locals);
      for (const arg of node.args) collectLocalBindings(arg, locals);
      return;
    case 'unary':
      collectLocalBindings(node.value, locals);
      return;
    case 'binary':
      collectLocalBindings(node.left, locals);
      collectLocalBindings(node.right, locals);
      return;
    case 'range':
      collectLocalBindings(node.from, locals);
      collectLocalBindings(node.to, locals);
      return;
    case 'conditional':
      collectLocalBindings(node.condition, locals);
      for (const part of node.thenBlock) collectLocalBindings(part, locals);
      if (node.elseBranch) collectLocalBindingsElse(node.elseBranch, locals);
      return;
    case 'for':
      collectLocalBindingFromBinding(node.binding, locals);
      for (const part of node.body) collectLocalBindings(part, locals);
      return;
    case 'arrayComprehension':
      collectLocalBindingFromBinding(node.binding, locals);
      collectLocalBindings(node.body, locals);
      return;
    case 'whileArrayComprehension':
      collectLocalBindings(node.condition, locals);
      collectLocalBindings(node.body, locals);
      return;
    case 'objectComprehension':
      collectLocalBindingFromBinding(node.binding, locals);
      collectLocalBindings(node.key, locals);
      collectLocalBindings(node.value, locals);
      return;
    case 'whileObjectComprehension':
      collectLocalBindings(node.condition, locals);
      collectLocalBindings(node.key, locals);
      collectLocalBindings(node.value, locals);
      return;
    default:
      return;
  }
}

function collectLocalBindingFromBinding(
  binding: IRBindingOrExpr,
  locals: Set<string>
) {
  if (binding.type === 'binding:valueIn') {
    locals.add(binding.value);
    collectLocalBindings(binding.source, locals);
    return;
  }
  if (binding.type === 'binding:keyValueIn') {
    locals.add(binding.key);
    locals.add(binding.value);
    collectLocalBindings(binding.source, locals);
    return;
  }
  if (binding.type === 'binding:keyOf') {
    locals.add(binding.key);
    collectLocalBindings(binding.source, locals);
    return;
  }
  collectLocalBindings(binding.source, locals);
}

function collectLocalBindingsElse(
  elseBranch: IRConditionalElse,
  locals: Set<string>
) {
  if (elseBranch.type === 'else') {
    for (const part of elseBranch.block) collectLocalBindings(part, locals);
    return;
  }
  collectLocalBindings(elseBranch.condition, locals);
  for (const part of elseBranch.thenBlock) collectLocalBindings(part, locals);
  if (elseBranch.elseBranch)
    collectLocalBindingsElse(elseBranch.elseBranch, locals);
}

function bumpNameFrequency(
  name: string,
  locals: Set<string>,
  frequencies: Map<string, number>,
  order: Map<string, number>,
  nextOrder: { value: number }
) {
  if (!locals.has(name)) return;
  if (!order.has(name)) {
    order.set(name, nextOrder.value);
    nextOrder.value += 1;
  }
  frequencies.set(name, (frequencies.get(name) ?? 0) + 1);
}

function collectNameFrequencies(
  node: IRNode,
  locals: Set<string>,
  frequencies: Map<string, number>,
  order: Map<string, number>,
  nextOrder: { value: number }
) {
  switch (node.type) {
    case 'identifier':
      bumpNameFrequency(node.name, locals, frequencies, order, nextOrder);
      return;
    case 'assign':
      if (node.place.type === 'identifier')
        bumpNameFrequency(
          node.place.name,
          locals,
          frequencies,
          order,
          nextOrder
        );
      collectNameFrequencies(node.place, locals, frequencies, order, nextOrder);
      collectNameFrequencies(node.value, locals, frequencies, order, nextOrder);
      return;
    case 'program':
      for (const part of node.body)
        collectNameFrequencies(part, locals, frequencies, order, nextOrder);
      return;
    case 'group':
      collectNameFrequencies(
        node.expression,
        locals,
        frequencies,
        order,
        nextOrder
      );
      return;
    case 'array':
      for (const item of node.items)
        collectNameFrequencies(item, locals, frequencies, order, nextOrder);
      return;
    case 'object':
      for (const entry of node.entries) {
        collectNameFrequencies(
          entry.key,
          locals,
          frequencies,
          order,
          nextOrder
        );
        collectNameFrequencies(
          entry.value,
          locals,
          frequencies,
          order,
          nextOrder
        );
      }
      return;
    case 'navigation':
      collectNameFrequencies(
        node.target,
        locals,
        frequencies,
        order,
        nextOrder
      );
      for (const segment of node.segments) {
        if (segment.type === 'dynamic')
          collectNameFrequencies(
            segment.key,
            locals,
            frequencies,
            order,
            nextOrder
          );
      }
      return;
    case 'call':
      collectNameFrequencies(
        node.callee,
        locals,
        frequencies,
        order,
        nextOrder
      );
      for (const arg of node.args)
        collectNameFrequencies(arg, locals, frequencies, order, nextOrder);
      return;
    case 'unary':
      collectNameFrequencies(node.value, locals, frequencies, order, nextOrder);
      return;
    case 'binary':
      collectNameFrequencies(node.left, locals, frequencies, order, nextOrder);
      collectNameFrequencies(node.right, locals, frequencies, order, nextOrder);
      return;
    case 'range':
      collectNameFrequencies(node.from, locals, frequencies, order, nextOrder);
      collectNameFrequencies(node.to, locals, frequencies, order, nextOrder);
      return;
    case 'conditional':
      collectNameFrequencies(
        node.condition,
        locals,
        frequencies,
        order,
        nextOrder
      );
      for (const part of node.thenBlock)
        collectNameFrequencies(part, locals, frequencies, order, nextOrder);
      if (node.elseBranch)
        collectNameFrequenciesElse(
          node.elseBranch,
          locals,
          frequencies,
          order,
          nextOrder
        );
      return;
    case 'for':
      collectNameFrequenciesBinding(
        node.binding,
        locals,
        frequencies,
        order,
        nextOrder
      );
      for (const part of node.body)
        collectNameFrequencies(part, locals, frequencies, order, nextOrder);
      return;
    case 'arrayComprehension':
      collectNameFrequenciesBinding(
        node.binding,
        locals,
        frequencies,
        order,
        nextOrder
      );
      collectNameFrequencies(node.body, locals, frequencies, order, nextOrder);
      return;
    case 'whileArrayComprehension':
      collectNameFrequencies(
        node.condition,
        locals,
        frequencies,
        order,
        nextOrder
      );
      collectNameFrequencies(node.body, locals, frequencies, order, nextOrder);
      return;
    case 'objectComprehension':
      collectNameFrequenciesBinding(
        node.binding,
        locals,
        frequencies,
        order,
        nextOrder
      );
      collectNameFrequencies(node.key, locals, frequencies, order, nextOrder);
      collectNameFrequencies(node.value, locals, frequencies, order, nextOrder);
      return;
    case 'whileObjectComprehension':
      collectNameFrequencies(
        node.condition,
        locals,
        frequencies,
        order,
        nextOrder
      );
      collectNameFrequencies(node.key, locals, frequencies, order, nextOrder);
      collectNameFrequencies(node.value, locals, frequencies, order, nextOrder);
      return;
    default:
      return;
  }
}

function collectNameFrequenciesBinding(
  binding: IRBindingOrExpr,
  locals: Set<string>,
  frequencies: Map<string, number>,
  order: Map<string, number>,
  nextOrder: { value: number }
) {
  if (binding.type === 'binding:valueIn') {
    bumpNameFrequency(binding.value, locals, frequencies, order, nextOrder);
    collectNameFrequencies(
      binding.source,
      locals,
      frequencies,
      order,
      nextOrder
    );
    return;
  }
  if (binding.type === 'binding:keyValueIn') {
    bumpNameFrequency(binding.key, locals, frequencies, order, nextOrder);
    bumpNameFrequency(binding.value, locals, frequencies, order, nextOrder);
    collectNameFrequencies(
      binding.source,
      locals,
      frequencies,
      order,
      nextOrder
    );
    return;
  }
  if (binding.type === 'binding:keyOf') {
    bumpNameFrequency(binding.key, locals, frequencies, order, nextOrder);
    collectNameFrequencies(
      binding.source,
      locals,
      frequencies,
      order,
      nextOrder
    );
    return;
  }
  collectNameFrequencies(binding.source, locals, frequencies, order, nextOrder);
}

function collectNameFrequenciesElse(
  elseBranch: IRConditionalElse,
  locals: Set<string>,
  frequencies: Map<string, number>,
  order: Map<string, number>,
  nextOrder: { value: number }
) {
  if (elseBranch.type === 'else') {
    for (const part of elseBranch.block)
      collectNameFrequencies(part, locals, frequencies, order, nextOrder);
    return;
  }
  collectNameFrequencies(
    elseBranch.condition,
    locals,
    frequencies,
    order,
    nextOrder
  );
  for (const part of elseBranch.thenBlock)
    collectNameFrequencies(part, locals, frequencies, order, nextOrder);
  if (elseBranch.elseBranch)
    collectNameFrequenciesElse(
      elseBranch.elseBranch,
      locals,
      frequencies,
      order,
      nextOrder
    );
}

function renameLocalNames(node: IRNode, map: Map<string, string>): IRNode {
  switch (node.type) {
    case 'identifier':
      return map.has(node.name)
        ? ({
            type: 'identifier',
            name: map.get(node.name) as string,
          } satisfies IRNode)
        : node;
    case 'program':
      return {
        type: 'program',
        body: node.body.map(part => renameLocalNames(part, map)),
      } satisfies IRNode;
    case 'group':
      return {
        type: 'group',
        expression: renameLocalNames(node.expression, map),
      } satisfies IRNode;
    case 'array':
      return {
        type: 'array',
        items: node.items.map(item => renameLocalNames(item, map)),
      } satisfies IRNode;
    case 'object':
      return {
        type: 'object',
        entries: node.entries.map(entry => ({
          key: renameLocalNames(entry.key, map),
          value: renameLocalNames(entry.value, map),
        })),
      } satisfies IRNode;
    case 'navigation':
      return {
        type: 'navigation',
        target: renameLocalNames(node.target, map),
        segments: node.segments.map(segment =>
          segment.type === 'static'
            ? segment
            : { type: 'dynamic', key: renameLocalNames(segment.key, map) }
        ),
      } satisfies IRNode;
    case 'call':
      return {
        type: 'call',
        callee: renameLocalNames(node.callee, map),
        args: node.args.map(arg => renameLocalNames(arg, map)),
      } satisfies IRNode;
    case 'unary':
      return {
        type: 'unary',
        op: node.op,
        value: renameLocalNames(node.value, map),
      } satisfies IRNode;
    case 'binary':
      return {
        type: 'binary',
        op: node.op,
        left: renameLocalNames(node.left, map),
        right: renameLocalNames(node.right, map),
      } satisfies IRNode;
    case 'range':
      return {
        type: 'range',
        from: renameLocalNames(node.from, map),
        to: renameLocalNames(node.to, map),
      } satisfies IRNode;
    case 'assign': {
      const place =
        node.place.type === 'identifier' && map.has(node.place.name)
          ? ({
              type: 'identifier',
              name: map.get(node.place.name) as string,
            } satisfies IRNode)
          : renameLocalNames(node.place, map);
      return {
        type: 'assign',
        op: node.op,
        place,
        value: renameLocalNames(node.value, map),
      } satisfies IRNode;
    }
    case 'conditional':
      return {
        type: 'conditional',
        head: node.head,
        condition: renameLocalNames(node.condition, map),
        thenBlock: node.thenBlock.map(part => renameLocalNames(part, map)),
        elseBranch: node.elseBranch
          ? renameLocalNamesElse(node.elseBranch, map)
          : undefined,
      } satisfies IRNode;
    case 'for':
      return {
        type: 'for',
        binding: renameLocalNamesBinding(node.binding, map),
        body: node.body.map(part => renameLocalNames(part, map)),
      } satisfies IRNode;
    case 'arrayComprehension':
      return {
        type: 'arrayComprehension',
        binding: renameLocalNamesBinding(node.binding, map),
        body: renameLocalNames(node.body, map),
      } satisfies IRNode;
    case 'whileArrayComprehension':
      return {
        type: 'whileArrayComprehension',
        condition: renameLocalNames(node.condition, map),
        body: renameLocalNames(node.body, map),
      } satisfies IRNode;
    case 'objectComprehension':
      return {
        type: 'objectComprehension',
        binding: renameLocalNamesBinding(node.binding, map),
        key: renameLocalNames(node.key, map),
        value: renameLocalNames(node.value, map),
      } satisfies IRNode;
    case 'whileObjectComprehension':
      return {
        type: 'whileObjectComprehension',
        condition: renameLocalNames(node.condition, map),
        key: renameLocalNames(node.key, map),
        value: renameLocalNames(node.value, map),
      } satisfies IRNode;
    default:
      return node;
  }
}

function renameLocalNamesBinding(
  binding: IRBindingOrExpr,
  map: Map<string, string>
): IRBindingOrExpr {
  const source = renameLocalNames(binding.source, map);
  switch (binding.type) {
    case 'binding:bareIn':
      return { type: 'binding:bareIn', source };
    case 'binding:bareOf':
      return { type: 'binding:bareOf', source };
    case 'binding:valueIn':
      return {
        type: 'binding:valueIn',
        value: map.get(binding.value) ?? binding.value,
        source,
      };
    case 'binding:keyValueIn':
      return {
        type: 'binding:keyValueIn',
        key: map.get(binding.key) ?? binding.key,
        value: map.get(binding.value) ?? binding.value,
        source,
      };
    case 'binding:keyOf':
      return {
        type: 'binding:keyOf',
        key: map.get(binding.key) ?? binding.key,
        source,
      };
  }
}

function renameLocalNamesElse(
  elseBranch: IRConditionalElse,
  map: Map<string, string>
): IRConditionalElse {
  if (elseBranch.type === 'else') {
    return {
      type: 'else',
      block: elseBranch.block.map(part => renameLocalNames(part, map)),
    } satisfies IRConditionalElse;
  }
  return {
    type: 'elseChain',
    head: elseBranch.head,
    condition: renameLocalNames(elseBranch.condition, map),
    thenBlock: elseBranch.thenBlock.map(part => renameLocalNames(part, map)),
    elseBranch: elseBranch.elseBranch
      ? renameLocalNamesElse(elseBranch.elseBranch, map)
      : undefined,
  } satisfies IRConditionalElse;
}

export function minifyLocalNamesIR(node: IRNode): IRNode {
  const locals = new Set<string>();
  collectLocalBindings(node, locals);
  if (locals.size === 0) return node;

  const frequencies = new Map<string, number>();
  const order = new Map<string, number>();
  collectNameFrequencies(node, locals, frequencies, order, { value: 0 });

  const ranked = Array.from(locals).sort((a, b) => {
    const freqA = frequencies.get(a) ?? 0;
    const freqB = frequencies.get(b) ?? 0;
    if (freqA !== freqB) return freqB - freqA;
    const orderA = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  const renameMap = new Map<string, string>();
  ranked.forEach((name, index) => {
    renameMap.set(name, encodeUint(index));
  });

  return renameLocalNames(node, renameMap);
}

export function compile(source: string, options?: CompileOptions): string {
  const ir = parseToIR(source);
  let lowered = options?.optimize ? optimizeIR(ir) : ir;
  if (options?.minifyNames) lowered = minifyLocalNamesIR(lowered);
  const domainMaps = options?.domainConfig
    ? domainRefsFromConfig(options.domainConfig)
    : undefined;
  return encodeIR(lowered, {
    ...domainMaps,
    dedupeValues: options?.dedupeValues,
    dedupeMinBytes: options?.dedupeMinBytes,
  });
}

type IRPostfixStep =
  | { kind: 'navStatic'; key: string }
  | { kind: 'navDynamic'; key: IRNode }
  | { kind: 'call'; args: IRNode[] };

function parseNumber(raw: string) {
  if (raw === 'nan') return NaN;
  if (raw === 'inf') return Infinity;
  if (raw === '-inf') return -Infinity;
  if (/^-?0x/i.test(raw)) return parseInt(raw, 16);
  if (/^-?0b/i.test(raw)) {
    const isNegative = raw.startsWith('-');
    const digits = raw.replace(/^-?0b/i, '');
    const value = parseInt(digits, 2);
    return isNegative ? -value : value;
  }
  return Number(raw);
}

function collectStructured(
  value: unknown,
  out: Array<IRNode | { key: IRNode; value: IRNode }>
) {
  if (Array.isArray(value)) {
    for (const part of value) collectStructured(part, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if ('type' in value || ('key' in value && 'value' in value)) {
    out.push(value as IRNode | { key: IRNode; value: IRNode });
  }
}

function normalizeList(
  value: unknown
): Array<IRNode | { key: IRNode; value: IRNode }> {
  const out: Array<IRNode | { key: IRNode; value: IRNode }> = [];
  collectStructured(value, out);
  return out;
}

function collectPostfixSteps(value: unknown, out: IRPostfixStep[]) {
  if (Array.isArray(value)) {
    for (const part of value) collectPostfixSteps(part, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if ('kind' in value) out.push(value as IRPostfixStep);
}

function normalizePostfixSteps(value: unknown): IRPostfixStep[] {
  const out: IRPostfixStep[] = [];
  collectPostfixSteps(value, out);
  return out;
}

function buildPostfix(base: IRNode, steps: IRPostfixStep[]) {
  let current = base;
  let pendingSegments: Extract<IRNode, { type: 'navigation' }>['segments'] = [];

  const flushSegments = () => {
    if (pendingSegments.length === 0) return;
    current = {
      type: 'navigation',
      target: current,
      segments: pendingSegments,
    } satisfies IRNode;
    pendingSegments = [];
  };

  for (const step of steps) {
    if (step.kind === 'navStatic') {
      pendingSegments.push({ type: 'static', key: step.key });
      continue;
    }
    if (step.kind === 'navDynamic') {
      pendingSegments.push({ type: 'dynamic', key: step.key });
      continue;
    }
    flushSegments();
    current = {
      type: 'call',
      callee: current,
      args: step.args,
    } satisfies IRNode;
  }

  flushSegments();
  return current;
}

type TODO = any;

semantics.addOperation('toIR', {
  // @ts-expect-error: TODO
  _iter(...children: TODO[]) {
    return children.map(child => child.toIR());
  },
  _terminal() {
    // @ts-expect-error: TODO
    return this.sourceString;
  },
  _nonterminal(...children: TODO[]) {
    if (children.length === 1 && children[0]) return children[0].toIR();
    return children.map(child => child.toIR());
  },

  Program(expressions) {
    const body = normalizeList(expressions.toIR()) as IRNode[];
    if (body.length === 1) return body[0];
    return { type: 'program', body } satisfies IRNode;
  },

  Block(expressions) {
    return normalizeList(expressions.toIR()) as IRNode[];
  },

  Elements(first, separatorsAndItems, maybeTrailingComma, maybeEmpty) {
    return normalizeList([
      first.toIR(),
      separatorsAndItems.toIR(),
      maybeTrailingComma.toIR(),
      maybeEmpty.toIR(),
    ]);
  },

  AssignExpr_assign(place, op, value) {
    return {
      type: 'assign',
      op: op.sourceString as Extract<IRNode, { type: 'assign' }>['op'],
      place: place.toIR(),
      value: value.toIR(),
    } satisfies IRNode;
  },

  ExistenceExpr_and(left, _and, right) {
    return {
      type: 'binary',
      op: 'and',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  ExistenceExpr_or(left, _or, right) {
    return {
      type: 'binary',
      op: 'or',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  ExistenceExpr_nor(left, _nor, right) {
    return {
      type: 'binary',
      op: 'nor',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },

  BitExpr_and(left, _op, right) {
    return {
      type: 'binary',
      op: 'bitAnd',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  BitExpr_xor(left, _op, right) {
    return {
      type: 'binary',
      op: 'bitXor',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  BitExpr_or(left, _op, right) {
    return {
      type: 'binary',
      op: 'bitOr',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },

  RangeExpr_range(left, _op, right) {
    return {
      type: 'range',
      from: left.toIR(),
      to: right.toIR(),
    } satisfies IRNode;
  },

  CompareExpr_binary(left, op, right) {
    const map: Record<string, Extract<IRNode, { type: 'binary' }>['op']> = {
      '==': 'eq',
      '!=': 'neq',
      '>': 'gt',
      '>=': 'gte',
      '<': 'lt',
      '<=': 'lte',
    };
    const mapped = map[op.sourceString];
    if (!mapped) throw new Error(`Unsupported compare op: ${op.sourceString}`);
    return {
      type: 'binary',
      op: mapped,
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },

  AddExpr_add(left, _op, right) {
    return {
      type: 'binary',
      op: 'add',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  AddExpr_sub(left, _op, right) {
    return {
      type: 'binary',
      op: 'sub',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },

  MulExpr_mul(left, _op, right) {
    return {
      type: 'binary',
      op: 'mul',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  MulExpr_div(left, _op, right) {
    return {
      type: 'binary',
      op: 'div',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },
  MulExpr_mod(left, _op, right) {
    return {
      type: 'binary',
      op: 'mod',
      left: left.toIR(),
      right: right.toIR(),
    } satisfies IRNode;
  },

  UnaryExpr_neg(_op, value) {
    const lowered = value.toIR() as IRNode;
    if (lowered.type === 'number') {
      const raw = lowered.raw.startsWith('-')
        ? lowered.raw.slice(1)
        : `-${lowered.raw}`;
      return { type: 'number', raw, value: -lowered.value } satisfies IRNode;
    }
    return { type: 'unary', op: 'neg', value: lowered } satisfies IRNode;
  },
  UnaryExpr_not(_op, value) {
    return { type: 'unary', op: 'not', value: value.toIR() } satisfies IRNode;
  },
  UnaryExpr_logicalNot(_not, value) {
    return {
      type: 'unary',
      op: 'logicalNot',
      value: value.toIR(),
    } satisfies IRNode;
  },
  UnaryExpr_delete(_del, place) {
    return {
      type: 'unary',
      op: 'delete',
      value: place.toIR(),
    } satisfies IRNode;
  },

  PostfixExpr_chain(base, tails) {
    return buildPostfix(base.toIR(), normalizePostfixSteps(tails.toIR()));
  },
  Place(base, tails) {
    return buildPostfix(base.toIR(), normalizePostfixSteps(tails.toIR()));
  },
  PlaceTail_navStatic(_dot, key) {
    return { kind: 'navStatic', key: key.sourceString } satisfies IRPostfixStep;
  },
  PlaceTail_navDynamic(_dotOpen, key, _close) {
    return { kind: 'navDynamic', key: key.toIR() } satisfies IRPostfixStep;
  },
  PostfixTail_navStatic(_dot, key) {
    return { kind: 'navStatic', key: key.sourceString } satisfies IRPostfixStep;
  },
  PostfixTail_navDynamic(_dotOpen, key, _close) {
    return { kind: 'navDynamic', key: key.toIR() } satisfies IRPostfixStep;
  },
  PostfixTail_callEmpty(_open, _close) {
    return { kind: 'call', args: [] } satisfies IRPostfixStep;
  },
  PostfixTail_call(_open, args, _close) {
    return {
      kind: 'call',
      args: normalizeList(args.toIR()) as IRNode[],
    } satisfies IRPostfixStep;
  },

  ConditionalExpr(head, condition, _do, thenBlock, elseBranch, _end) {
    const nextElse = elseBranch.children[0];
    return {
      type: 'conditional',
      head: head.toIR() as 'when' | 'unless',
      condition: condition.toIR(),
      thenBlock: thenBlock.toIR() as IRNode[],
      elseBranch: nextElse ? (nextElse.toIR() as IRConditionalElse) : undefined,
    } satisfies IRNode;
  },
  ConditionalHead(_kw) {
    return this.sourceString as 'when' | 'unless';
  },
  ConditionalElse_elseChain(
    _else,
    head,
    condition,
    _do,
    thenBlock,
    elseBranch
  ) {
    const nextElse = elseBranch.children[0];
    return {
      type: 'elseChain',
      head: head.toIR() as 'when' | 'unless',
      condition: condition.toIR(),
      thenBlock: thenBlock.toIR() as IRNode[],
      elseBranch: nextElse ? (nextElse.toIR() as IRConditionalElse) : undefined,
    } satisfies IRConditionalElse;
  },
  ConditionalElse_else(_else, block) {
    return {
      type: 'else',
      block: block.toIR() as IRNode[],
    } satisfies IRConditionalElse;
  },

  WhileExpr(_while, condition, _do, block, _end) {
    return {
      type: 'while',
      condition: condition.toIR(),
      body: block.toIR() as IRNode[],
    } satisfies IRNode;
  },

  ForExpr(_for, binding, _do, block, _end) {
    return {
      type: 'for',
      binding: binding.toIR() as IRBinding,
      body: block.toIR() as IRNode[],
    } satisfies IRNode;
  },

  Array_empty(_open, _close) {
    return { type: 'array', items: [] } satisfies IRNode;
  },
  Array_forComprehension(_open, body, _for, binding, _close) {
    return {
      type: 'arrayComprehension',
      binding: binding.toIR() as IRBinding,
      body: body.toIR(),
    } satisfies IRNode;
  },
  Array_whileComprehension(_open, body, _while, condition, _close) {
    return {
      type: 'whileArrayComprehension',
      condition: condition.toIR(),
      body: body.toIR(),
    } satisfies IRNode;
  },
  Array_inComprehension(_open, body, _in, source, _close) {
    return {
      type: 'arrayComprehension',
      binding: {
        type: 'binding:bareIn',
        source: source.toIR(),
      } satisfies IRBinding,
      body: body.toIR(),
    } satisfies IRNode;
  },
  Array_ofComprehension(_open, body, _of, source, _close) {
    return {
      type: 'arrayComprehension',
      binding: {
        type: 'binding:bareOf',
        source: source.toIR(),
      } satisfies IRBinding,
      body: body.toIR(),
    } satisfies IRNode;
  },
  Array_values(_open, items, _close) {
    return {
      type: 'array',
      items: normalizeList(items.toIR()) as IRNode[],
    } satisfies IRNode;
  },

  Object_empty(_open, _close) {
    return { type: 'object', entries: [] } satisfies IRNode;
  },
  Object_forComprehension(_open, key, _colon, value, _for, binding, _close) {
    return {
      type: 'objectComprehension',
      binding: binding.toIR() as IRBinding,
      key: key.toIR(),
      value: value.toIR(),
    } satisfies IRNode;
  },
  Object_whileComprehension(
    _open,
    key,
    _colon,
    value,
    _while,
    condition,
    _close
  ) {
    return {
      type: 'whileObjectComprehension',
      condition: condition.toIR(),
      key: key.toIR(),
      value: value.toIR(),
    } satisfies IRNode;
  },
  Object_inComprehension(_open, key, _colon, value, _in, source, _close) {
    return {
      type: 'objectComprehension',
      binding: {
        type: 'binding:bareIn',
        source: source.toIR(),
      } satisfies IRBinding,
      key: key.toIR(),
      value: value.toIR(),
    } satisfies IRNode;
  },
  Object_ofComprehension(_open, key, _colon, value, _of, source, _close) {
    return {
      type: 'objectComprehension',
      binding: {
        type: 'binding:bareOf',
        source: source.toIR(),
      } satisfies IRBinding,
      key: key.toIR(),
      value: value.toIR(),
    } satisfies IRNode;
  },
  Object_pairs(_open, pairs, _close) {
    return {
      type: 'object',
      entries: normalizeList(pairs.toIR()) as Array<{
        key: IRNode;
        value: IRNode;
      }>,
    } satisfies IRNode;
  },

  IterBinding_keyValueIn(key, _comma, value, _in, source) {
    return {
      type: 'binding:keyValueIn',
      key: key.sourceString,
      value: value.sourceString,
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBinding_valueIn(value, _in, source) {
    return {
      type: 'binding:valueIn',
      value: value.sourceString,
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBinding_keyOf(key, _of, source) {
    return {
      type: 'binding:keyOf',
      key: key.sourceString,
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBinding_bareIn(_in, source) {
    return {
      type: 'binding:bareIn',
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBinding_bareOf(_of, source) {
    return {
      type: 'binding:bareOf',
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBindingComprehension_keyValueIn(key, _comma, value, _in, source) {
    return {
      type: 'binding:keyValueIn',
      key: key.sourceString,
      value: value.sourceString,
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBindingComprehension_valueIn(value, _in, source) {
    return {
      type: 'binding:valueIn',
      value: value.sourceString,
      source: source.toIR(),
    } satisfies IRBinding;
  },
  IterBindingComprehension_keyOf(key, _of, source) {
    return {
      type: 'binding:keyOf',
      key: key.sourceString,
      source: source.toIR(),
    } satisfies IRBinding;
  },

  Pair(key, _colon, value) {
    return { key: key.toIR(), value: value.toIR() };
  },
  ObjKey_bare(key) {
    return { type: 'key', name: key.sourceString } satisfies IRNode;
  },
  ObjKey_number(num) {
    return num.toIR();
  },
  ObjKey_string(str) {
    return str.toIR();
  },
  ObjKey_computed(_open, expr, _close) {
    return expr.toIR();
  },

  BreakKw(_kw) {
    return { type: 'break' } satisfies IRNode;
  },
  ContinueKw(_kw) {
    return { type: 'continue' } satisfies IRNode;
  },
  SelfExpr_depth(_self, _at, depth) {
    const value = depth.toIR() as IRNode;
    if (
      value.type !== 'number' ||
      !Number.isInteger(value.value) ||
      value.value < 1
    ) {
      throw new Error('self depth must be a positive integer literal');
    }
    if (value.value === 1) return { type: 'self' } satisfies IRNode;
    return { type: 'selfDepth', depth: value.value } satisfies IRNode;
  },
  SelfExpr_plain(selfKw) {
    return selfKw.toIR();
  },
  SelfKw(_kw) {
    return { type: 'self' } satisfies IRNode;
  },
  TrueKw(_kw) {
    return { type: 'boolean', value: true } satisfies IRNode;
  },
  FalseKw(_kw) {
    return { type: 'boolean', value: false } satisfies IRNode;
  },
  NullKw(_kw) {
    return { type: 'null' } satisfies IRNode;
  },
  UndefinedKw(_kw) {
    return { type: 'undefined' } satisfies IRNode;
  },

  StringKw(_kw) {
    return { type: 'identifier', name: 'string' } satisfies IRNode;
  },
  NumberKw(_kw) {
    return { type: 'identifier', name: 'number' } satisfies IRNode;
  },
  ObjectKw(_kw) {
    return { type: 'identifier', name: 'object' } satisfies IRNode;
  },
  ArrayKw(_kw) {
    return { type: 'identifier', name: 'array' } satisfies IRNode;
  },
  BooleanKw(_kw) {
    return { type: 'identifier', name: 'boolean' } satisfies IRNode;
  },

  identifier(_a, _b) {
    return { type: 'identifier', name: this.sourceString } satisfies IRNode;
  },

  String(_value) {
    return { type: 'string', raw: this.sourceString } satisfies IRNode;
  },
  Number(_value) {
    return {
      type: 'number',
      raw: this.sourceString,
      value: parseNumber(this.sourceString),
    } satisfies IRNode;
  },

  PrimaryExpr_group(_open, expr, _close) {
    return { type: 'group', expression: expr.toIR() } satisfies IRNode;
  },
});

export default semantics;

export type { RexActionDict, RexSemantics } from './rex.ohm-bundle.js';
