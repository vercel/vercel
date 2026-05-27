// --- Firewall Condition Types ---

export type FirewallConditionType =
  | 'path'
  | 'method'
  | 'host'
  | 'ip_address'
  | 'header'
  | 'query'
  | 'cookie'
  | 'user_agent'
  | 'route'
  | 'raw_path'
  | 'server_action'
  | 'protocol'
  | 'region'
  | 'environment'
  | 'geo_continent'
  | 'geo_country'
  | 'geo_country_region'
  | 'geo_city'
  | 'geo_as_number'
  | 'ja3_digest'
  | 'ja4_digest'
  | 'rate_limit_api_id'
  | 'bot_name'
  | 'bot_category';

export type FirewallConditionOp =
  | 'eq'
  | 'neq'
  | 'inc'
  | 'ninc'
  | 'ex'
  | 'nex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 're'
  | 'sub'
  | 'pre'
  | 'suf';

export interface FirewallCondition {
  type: FirewallConditionType;
  op: FirewallConditionOp;
  neg?: boolean;
  key?: string;
  value: string | number | string[];
}

export interface FirewallConditionGroup {
  conditions: FirewallCondition[];
}

// --- Firewall Action Types ---

export interface FirewallRateLimitConfig {
  algo: 'fixed_window' | 'token_bucket';
  window: number | string;
  limit: number | string;
  keys: string[];
  action: 'challenge' | 'deny' | 'log' | 'rate_limit';
}

export interface FirewallRedirectConfig {
  location: string;
  permanent: boolean;
}

export type FirewallMitigateActionType =
  | 'log'
  | 'deny'
  | 'challenge'
  | 'bypass'
  | 'rate_limit'
  | 'redirect';

export interface FirewallMitigateAction {
  action: FirewallMitigateActionType;
  rateLimit?: FirewallRateLimitConfig | null;
  redirect?: FirewallRedirectConfig | null;
  actionDuration?: string | null;
  attributes?: 'ip_address';
  logHeaders?: '*' | string[];
}

export interface FirewallRuleAction {
  mitigate?: FirewallMitigateAction;
}

// --- Firewall Rule ---

export interface FirewallRule {
  name: string;
  description?: string;
  active: boolean;
  conditionGroup: FirewallConditionGroup[];
  action: FirewallRuleAction;
}

// --- ConditionExpr: composable condition builder ---

export class ConditionExpr {
  private groups: FirewallCondition[][];

  constructor(condition: FirewallCondition) {
    this.groups = [[condition]];
  }

  private static fromGroups(groups: FirewallCondition[][]): ConditionExpr {
    const expr = Object.create(ConditionExpr.prototype) as ConditionExpr;
    expr.groups = groups;
    return expr;
  }

  /** AND: appends other's groups as new groups */
  and(other: ConditionExpr): ConditionExpr {
    return ConditionExpr.fromGroups([
      ...this.groups.map(g => [...g]),
      ...other.groups.map(g => [...g]),
    ]);
  }

  /** OR: merges other's conditions into the last group */
  or(other: ConditionExpr): ConditionExpr {
    const newGroups = this.groups.map(g => [...g]);
    const lastGroup = newGroups[newGroups.length - 1];
    for (const group of other.groups) {
      lastGroup.push(...group);
    }
    return ConditionExpr.fromGroups(newGroups);
  }

  toConditionGroups(): FirewallConditionGroup[] {
    return this.groups.map(conditions => ({ conditions: [...conditions] }));
  }
}

// --- Matcher factories ---

interface KeylessOperators {
  Is(value: string | number): ConditionExpr;
  Not(value: string | number): ConditionExpr;
  In(values: string[]): ConditionExpr;
  NotIn(values: string[]): ConditionExpr;
  StartsWith(value: string): ConditionExpr;
  EndsWith(value: string): ConditionExpr;
  Contains(value: string): ConditionExpr;
  Matches(value: string): ConditionExpr;
  Exists(): ConditionExpr;
  NotExists(): ConditionExpr;
  Gt(value: number): ConditionExpr;
  Gte(value: number): ConditionExpr;
  Lt(value: number): ConditionExpr;
  Lte(value: number): ConditionExpr;
}

export type KeylessMatcher = ((value: string) => ConditionExpr) &
  KeylessOperators;

export interface KeyedOperators {
  Is(value: string | number): ConditionExpr;
  Not(value: string | number): ConditionExpr;
  In(values: string[]): ConditionExpr;
  NotIn(values: string[]): ConditionExpr;
  StartsWith(value: string): ConditionExpr;
  EndsWith(value: string): ConditionExpr;
  Contains(value: string): ConditionExpr;
  Matches(value: string): ConditionExpr;
  Exists(): ConditionExpr;
  NotExists(): ConditionExpr;
  Gt(value: number): ConditionExpr;
  Gte(value: number): ConditionExpr;
  Lt(value: number): ConditionExpr;
  Lte(value: number): ConditionExpr;
}

export type KeyedMatcher = (key: string) => KeyedOperators;

function cond(
  type: FirewallConditionType,
  op: FirewallConditionOp,
  value: string | number | string[],
  key?: string
): ConditionExpr {
  const condition: FirewallCondition = { type, op, value };
  if (key !== undefined) condition.key = key;
  return new ConditionExpr(condition);
}

function createKeylessMatcher(type: FirewallConditionType): KeylessMatcher {
  const fn = ((value: string) => cond(type, 're', value)) as KeylessMatcher;

  fn.Is = (value: string | number) => cond(type, 'eq', value);
  fn.Not = (value: string | number) => cond(type, 'neq', value);
  fn.In = (values: string[]) => cond(type, 'inc', values);
  fn.NotIn = (values: string[]) => cond(type, 'ninc', values);
  fn.StartsWith = (value: string) => cond(type, 'pre', value);
  fn.EndsWith = (value: string) => cond(type, 'suf', value);
  fn.Contains = (value: string) => cond(type, 'sub', value);
  fn.Matches = (value: string) => cond(type, 're', value);
  fn.Exists = () => cond(type, 'ex', '');
  fn.NotExists = () => cond(type, 'nex', '');
  fn.Gt = (value: number) => cond(type, 'gt', value);
  fn.Gte = (value: number) => cond(type, 'gte', value);
  fn.Lt = (value: number) => cond(type, 'lt', value);
  fn.Lte = (value: number) => cond(type, 'lte', value);

  return fn;
}

function createKeyedMatcher(type: FirewallConditionType): KeyedMatcher {
  return (key: string): KeyedOperators => ({
    Is: (value: string | number) => cond(type, 'eq', value, key),
    Not: (value: string | number) => cond(type, 'neq', value, key),
    In: (values: string[]) => cond(type, 'inc', values, key),
    NotIn: (values: string[]) => cond(type, 'ninc', values, key),
    StartsWith: (value: string) => cond(type, 'pre', value, key),
    EndsWith: (value: string) => cond(type, 'suf', value, key),
    Contains: (value: string) => cond(type, 'sub', value, key),
    Matches: (value: string) => cond(type, 're', value, key),
    Exists: () => cond(type, 'ex', '', key),
    NotExists: () => cond(type, 'nex', '', key),
    Gt: (value: number) => cond(type, 'gt', value, key),
    Gte: (value: number) => cond(type, 'gte', value, key),
    Lt: (value: number) => cond(type, 'lt', value, key),
    Lte: (value: number) => cond(type, 'lte', value, key),
  });
}

// --- Matcher namespace ---

export const match = {
  // Keyless matchers
  path: createKeylessMatcher('path'),
  method: createKeylessMatcher('method'),
  host: createKeylessMatcher('host'),
  ipAddress: createKeylessMatcher('ip_address'),
  userAgent: createKeylessMatcher('user_agent'),
  rawPath: createKeylessMatcher('raw_path'),
  serverAction: createKeylessMatcher('server_action'),
  protocol: createKeylessMatcher('protocol'),
  region: createKeylessMatcher('region'),
  environment: createKeylessMatcher('environment'),
  route: createKeylessMatcher('route'),
  ja3Digest: createKeylessMatcher('ja3_digest'),
  ja4Digest: createKeylessMatcher('ja4_digest'),
  rateLimitApiId: createKeylessMatcher('rate_limit_api_id'),
  botName: createKeylessMatcher('bot_name'),
  botCategory: createKeylessMatcher('bot_category'),

  // Geo aliases
  continent: createKeylessMatcher('geo_continent'),
  country: createKeylessMatcher('geo_country'),
  countryRegion: createKeylessMatcher('geo_country_region'),
  city: createKeylessMatcher('geo_city'),
  asn: createKeylessMatcher('geo_as_number'),

  // Keyed matchers
  header: createKeyedMatcher('header'),
  query: createKeyedMatcher('query'),
  cookie: createKeyedMatcher('cookie'),
};

// --- Action builder ---

class ActionBuilder {
  private _name: string;
  private _description?: string;
  private _active: boolean;
  private _conditionGroups: FirewallConditionGroup[];

  constructor(
    name: string,
    description: string | undefined,
    active: boolean,
    conditionGroups: FirewallConditionGroup[]
  ) {
    this._name = name;
    this._description = description;
    this._active = active;
    this._conditionGroups = conditionGroups;
  }

  private finalize(action: FirewallRuleAction): FirewallRule {
    const rule: FirewallRule = {
      name: this._name,
      active: this._active,
      conditionGroup: this._conditionGroups,
      action,
    };
    if (this._description) rule.description = this._description;
    return rule;
  }

  block(opts?: { duration?: string }): FirewallRule {
    return this.finalize({
      mitigate: {
        action: 'deny',
        ...(opts?.duration && { actionDuration: opts.duration }),
      },
    });
  }

  challenge(opts?: { duration?: string }): FirewallRule {
    return this.finalize({
      mitigate: {
        action: 'challenge',
        ...(opts?.duration && { actionDuration: opts.duration }),
      },
    });
  }

  log(opts?: { headers?: '*' | string[] }): FirewallRule {
    return this.finalize({
      mitigate: {
        action: 'log',
        ...(opts?.headers && { logHeaders: opts.headers }),
      },
    });
  }

  bypass(): FirewallRule {
    return this.finalize({
      mitigate: { action: 'bypass' },
    });
  }

  rateLimit(config: {
    algo?: 'fixed_window' | 'token_bucket';
    window: number | string;
    limit: number | string;
    keys: string[];
    action?: 'challenge' | 'deny' | 'log';
  }): FirewallRule {
    return this.finalize({
      mitigate: {
        action: 'rate_limit',
        rateLimit: {
          algo: config.algo ?? 'fixed_window',
          window: config.window,
          limit: config.limit,
          keys: config.keys,
          action: config.action ?? 'deny',
        },
      },
    });
  }

  redirect(location: string, opts?: { permanent?: boolean }): FirewallRule {
    return this.finalize({
      mitigate: {
        action: 'redirect',
        redirect: {
          location,
          permanent: opts?.permanent ?? false,
        },
      },
    });
  }
}

// --- Rule builder with conditions (exposes .then) ---

class RuleBuilderWithConditions {
  private _name: string;
  private _description?: string;
  private _active: boolean;
  private _conditionGroups: FirewallConditionGroup[];

  constructor(
    name: string,
    description: string | undefined,
    active: boolean,
    conditionGroups: FirewallConditionGroup[]
  ) {
    this._name = name;
    this._description = description;
    this._active = active;
    this._conditionGroups = conditionGroups;
  }

  // biome-ignore lint/suspicious/noThenProperty: intentional fluent API design (.then.block(), .then.challenge(), etc.)
  get then(): ActionBuilder {
    return new ActionBuilder(
      this._name,
      this._description,
      this._active,
      this._conditionGroups
    );
  }
}

// --- Rule builder ---

class RuleBuilder {
  private _name: string;
  private _description?: string;
  private _active: boolean = true;

  constructor(name: string) {
    this._name = name;
  }

  description(desc: string): this {
    this._description = desc;
    return this;
  }

  active(active: boolean): this {
    this._active = active;
    return this;
  }

  when(expr: ConditionExpr): RuleBuilderWithConditions {
    return new RuleBuilderWithConditions(
      this._name,
      this._description,
      this._active,
      expr.toConditionGroups()
    );
  }
}

// --- Firewall class ---

export class Firewall {
  rule(name: string): RuleBuilder {
    return new RuleBuilder(name);
  }
}

export function createFirewall(): Firewall {
  return new Firewall();
}
