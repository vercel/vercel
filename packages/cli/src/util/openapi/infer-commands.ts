import output from '../../output-manager';
import {
  help as renderHelp,
  type Command,
  type CommandArgument,
  type CommandOption,
} from '../../commands/help';
import { formatOutput } from '../../commands/api/request-builder';
import chalk from 'chalk';
import ms from 'ms';
import title from 'title';
import { homedir } from 'os';
import { isAbsolute, resolve as resolvePath } from 'path';
import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useEffect,
  useKeypress,
  useMemo,
  usePagination,
  usePrefix,
  useRef,
  useState,
} from '@inquirer/core';
import table from '../output/table';
import type Client from '../client';
import getTeamById from '../teams/get-team-by-id';
import getTeams from '../teams/get-teams';
import type {
  OpenApiCommandTag,
  OpenApiDisplayPropertiesByTagOperationStatus,
  OpenApiDisplayResponseShapeByTagOperationStatusProperty,
  OpenApiInputNamesByTagOperation,
  OpenApiOperationIdsByTag,
  OpenApiResponseStatusCodesByTagOperation,
} from './generated-command-dsl-types';
import { OpenApiCache } from './openapi-cache';
import { resolveEndpointByTagAndOperationId } from './resolve-by-tag-operation';
import type { BodyField, Parameter } from './types';
import { getLinkFromDir, getVercelDirectory } from '../projects/link';
import getUser from '../get-user';
import getProjectByIdOrName from '../projects/get-project-by-id-or-name';
import { APIError, ProjectNotFound } from '../errors-ts';
import stripAnsi from 'strip-ansi';

type OptionalRecord<K extends PropertyKey, V> = {
  [P in K]?: V;
};

const DISPLAY_PATH_SYMBOL = Symbol('inferredDisplayPath');
const DISPLAY_SCALAR_SYMBOL = Symbol('inferredDisplayScalar');

type DisplayScalarKind = 'string' | 'number' | 'boolean';

type DisplayBaseToken<Kind extends DisplayScalarKind> = {
  readonly [DISPLAY_PATH_SYMBOL]: readonly string[];
  readonly [DISPLAY_SCALAR_SYMBOL]: Kind;
};

export type DisplayStringToken = DisplayBaseToken<'string'>;
export type DisplayNumberToken = DisplayBaseToken<'number'>;
export type DisplayBooleanToken = DisplayBaseToken<'boolean'>;

export type DisplayScalarToken =
  | DisplayStringToken
  | DisplayNumberToken
  | DisplayBooleanToken;

export type DisplayColorName =
  | 'gray'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white';

export interface DisplayRelativeTimeValue {
  value: DisplayNumberInput;
  format: 'relativeTime';
}

export interface DisplayDurationValue {
  end: DisplayNumberInput;
  start: DisplayNumberInput;
  format: 'duration';
}

export interface DisplayCapitalizeValue {
  value: DisplayNestableValue;
  format: 'capitalize';
}

export interface DisplayScopeValue {
  format: 'scope';
}

export interface DisplayIconValue {
  format: 'icon';
  name: DisplayIconName;
}

export interface DisplayJoinValue {
  values: readonly DisplayNestableValue[];
  separator: string;
  format: 'join';
}

export interface DisplaySwitchValue {
  value: DisplayScalarToken;
  format: 'switch';
  cases: Record<string, DisplaySwitchCaseValue>;
  defaultCase: DisplaySwitchCaseValue;
}

export interface DisplayLinkValue {
  url: DisplayNestableValue;
  format: 'link';
  text?: DisplayNestableValue;
}

export interface DisplayConditionalValue {
  format: 'conditional';
  values: readonly DisplayNestableValue[];
}

export interface DisplayColorValue {
  value: DisplayNestableValue;
  format: 'color';
  color: DisplayColorName;
}

export type DisplayFormattedValue =
  | DisplayRelativeTimeValue
  | DisplayDurationValue
  | DisplayCapitalizeValue
  | DisplayScopeValue
  | DisplayIconValue
  | DisplayJoinValue
  | DisplayColorValue
  | DisplaySwitchValue
  | DisplayLinkValue
  | DisplayConditionalValue;

type DisplayLiteralValue = string | number | boolean;
export type DisplayIconName =
  | 'circle-fill'
  | 'warning'
  | 'info'
  | 'error'
  | 'check';

type DisplayInlineValue =
  | DisplayScalarToken
  | DisplayFormattedValue
  | DisplayLiteralValue;
type DisplayInlineValueList = readonly DisplayInlineValue[];
type DisplayNestableValue =
  | DisplayScalarToken
  | DisplayFormattedValue
  | DisplayLiteralValue
  | null
  | undefined;
type DisplayNumberInput = DisplayNestableValue;

type DisplaySwitchCaseValue = DisplayInlineValue | DisplayInlineValueList;

type DisplaySwitchCasesInput = {
  DEFAULT: DisplaySwitchCaseValue;
} & Record<string, DisplaySwitchCaseValue>;

type DisplayColorInput = DisplayNestableValue;

interface DisplayFieldRecord {
  [key: string]: DisplayFieldValue;
}

type DisplayFieldValue =
  | DisplayInlineValue
  | DisplayInlineValueList
  | DisplayFieldRecord;

type DisplayUnknownAccessor = DisplayScalarToken & {
  readonly [key: string]: DisplayUnknownAccessor;
  readonly [index: number]: DisplayUnknownAccessor;
};

type DisplayTypeAccessor<T> = unknown extends T
  ? DisplayUnknownAccessor
  : T extends string
    ? DisplayStringToken
    : T extends number
      ? DisplayNumberToken
      : T extends boolean
        ? DisplayBooleanToken
        : T extends readonly (infer Item)[]
          ? readonly DisplayTypeAccessor<Item>[]
          : T extends object
            ? {
                readonly [Key in keyof T]-?: DisplayTypeAccessor<T[Key]>;
              }
            : T extends null
              ? null
              : T extends undefined
                ? undefined
                : DisplayUnknownAccessor;

type DisplayPathTemplate = {
  type: 'path';
  path: readonly string[];
};

type DisplayRelativeTimeTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'relativeTime';
};

type DisplayDurationTemplate = {
  type: 'format';
  end: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  start: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'duration';
};

type DisplayCapitalizeTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'capitalize';
};

type DisplayScopeTemplate = {
  type: 'format';
  format: 'scope';
};

type DisplayIconTemplate = {
  type: 'format';
  format: 'icon';
  name: DisplayIconName;
};

type DisplayJoinTemplate = {
  type: 'format';
  values: readonly (
    | DisplayPathTemplate
    | DisplayFormatTemplate
    | DisplayLiteralTemplate
    | DisplayTemplateValue[]
  )[];
  separator: string;
  format: 'join';
};

type DisplayColorTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'color';
  color: DisplayColorName;
};

type DisplaySwitchTemplate = {
  type: 'format';
  value: DisplayPathTemplate;
  format: 'switch';
  cases: Record<string, DisplayTemplateValue>;
  defaultCase: DisplayTemplateValue;
};

type DisplayLinkTemplate = {
  type: 'format';
  url: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'link';
  text?: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
};

type DisplayConditionalTemplate = {
  type: 'format';
  format: 'conditional';
  values: readonly (
    | DisplayPathTemplate
    | DisplayFormatTemplate
    | DisplayLiteralTemplate
    | DisplayTemplateValue[]
  )[];
};

type DisplayLiteralTemplate = {
  type: 'literal';
  value: DisplayLiteralValue | null;
};

type DisplayFormatTemplate =
  | DisplayRelativeTimeTemplate
  | DisplayDurationTemplate
  | DisplayCapitalizeTemplate
  | DisplayScopeTemplate
  | DisplayIconTemplate
  | DisplayJoinTemplate
  | DisplayColorTemplate
  | DisplaySwitchTemplate
  | DisplayLinkTemplate
  | DisplayConditionalTemplate;

type DisplayTemplateValue =
  | DisplayPathTemplate
  | DisplayLiteralTemplate
  | DisplayFormatTemplate
  | { [key: string]: DisplayTemplateValue }
  | DisplayTemplateValue[];

const displayTemplateCache = new WeakMap<
  Function,
  DisplayTemplateValue | null
>();

export interface InferredCommandConfig {
  value?: string;
  aliases?: string[];
  arguments?: Record<string, InferredCommandParamConfig | undefined>;
  options?: Record<string, InferredCommandParamConfig | undefined>;
  examples?: InferredCommandExample[];
  display?: InferredCommandResponseDisplayByStatus;
}

type HttpStatusCode = `${1 | 2 | 3 | 4 | 5}${number}${number}`;

export type InferredCommandSuccessResponseDisplayConfig<
  DisplayProperty extends string | undefined = string | undefined,
  DisplayAccessor = DisplayUnknownAccessor,
> = {
  displayProperty?: DisplayProperty;
  fields: InferredCommandDisplayFieldsSelector<DisplayAccessor>;
  table?: boolean;
} & (
  | {
      json?: InferredCommandJsonSelector<DisplayAccessor>;
    }
  | {
      json: 'all';
    }
);

type InferredCommandDisplayFieldsSelector<DisplayAccessor> = {
  bivarianceHack(item: DisplayAccessor): Record<string, DisplayFieldValue>;
}['bivarianceHack'];

type InferredCommandJsonSelector<DisplayAccessor> = {
  bivarianceHack(item: DisplayAccessor): Record<string, unknown>;
}['bivarianceHack'];

export interface InferredCommandErrorResponseDisplayConfig {
  errorFields: string[];
}

export type InferredCommandResponseDisplayByStatus = Partial<{
  [StatusCode in HttpStatusCode]: StatusCode extends `2${string}`
    ? InferredCommandSuccessResponseDisplayConfig
    : InferredCommandErrorResponseDisplayConfig;
}>;

type InferredStatusCodeForOperation<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
> = Tag extends keyof OpenApiResponseStatusCodesByTagOperation
  ? OperationId extends keyof OpenApiResponseStatusCodesByTagOperation[Tag]
    ? Extract<
        OpenApiResponseStatusCodesByTagOperation[Tag][OperationId],
        string
      >
    : never
  : never;

type InferredDisplayPropertyForOperationStatus<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
  StatusCode extends string,
> = Tag extends keyof OpenApiDisplayPropertiesByTagOperationStatus
  ? OperationId extends keyof OpenApiDisplayPropertiesByTagOperationStatus[Tag]
    ? StatusCode extends keyof OpenApiDisplayPropertiesByTagOperationStatus[Tag][OperationId]
      ? Extract<
          OpenApiDisplayPropertiesByTagOperationStatus[Tag][OperationId][StatusCode],
          string
        >
      : never
    : never
  : never;

type InferredDisplayResponseShapeForOperationStatusProperty<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
  StatusCode extends string,
  Property extends string,
> = Tag extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty
  ? OperationId extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag]
    ? StatusCode extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag][OperationId]
      ? Property extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag][OperationId][StatusCode]
        ? OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag][OperationId][StatusCode][Property]
        : never
      : never
    : never
  : never;

type InferredDisplayResponsePropertyMapForOperationStatus<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
  StatusCode extends string,
> = Tag extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty
  ? OperationId extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag]
    ? StatusCode extends keyof OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag][OperationId]
      ? OpenApiDisplayResponseShapeByTagOperationStatusProperty[Tag][OperationId][StatusCode]
      : never
    : never
  : never;

type InferredDisplayResponseShapeForOperationStatus<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
  StatusCode extends string,
> =
  InferredDisplayResponsePropertyMapForOperationStatus<
    Tag,
    OperationId,
    StatusCode
  > extends infer PropertyMap
    ? [PropertyMap] extends [never]
      ? unknown
      : PropertyMap
    : unknown;

type DisplayFieldInputForShape<Shape> = Shape extends readonly (infer Item)[]
  ? Item
  : Shape;

type DisplayRootAccessorForShape<Shape> =
  DisplayFieldInputForShape<Shape> extends infer FieldInput
    ? FieldInput extends object
      ? {
          readonly [Key in keyof FieldInput]-?: DisplayUnknownAccessor;
        }
      : DisplayTypeAccessor<FieldInput>
    : DisplayUnknownAccessor;

type KnownInferredSuccessResponseDisplayConfig<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
  StatusCode extends string,
> =
  | (Omit<
      InferredCommandSuccessResponseDisplayConfig<
        undefined,
        DisplayRootAccessorForShape<
          InferredDisplayResponseShapeForOperationStatus<
            Tag,
            OperationId,
            StatusCode
          >
        >
      >,
      'displayProperty'
    > & {
      displayProperty?: never;
    })
  | (InferredDisplayPropertyForOperationStatus<
      Tag,
      OperationId,
      StatusCode
    > extends infer Property extends string
      ? {
          [CurrentProperty in Property]: Omit<
            InferredCommandSuccessResponseDisplayConfig<
              CurrentProperty,
              DisplayTypeAccessor<
                DisplayFieldInputForShape<
                  InferredDisplayResponseShapeForOperationStatusProperty<
                    Tag,
                    OperationId,
                    StatusCode,
                    CurrentProperty
                  >
                >
              >
            >,
            'displayProperty'
          > & {
            displayProperty: CurrentProperty;
          };
        }[Property]
      : never);

type KnownInferredCommandResponseDisplayByStatus<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
> = Partial<
  InferredStatusCodeForOperation<Tag, OperationId> extends never
    ? {}
    : {
        [StatusCode in InferredStatusCodeForOperation<
          Tag,
          OperationId
        >]: StatusCode extends `2${string}`
          ? KnownInferredSuccessResponseDisplayConfig<
              Tag,
              OperationId,
              StatusCode
            >
          : InferredCommandErrorResponseDisplayConfig;
      }
>;

export interface InferredTagConfig {
  name?: string;
  aliases?: string[];
}

export type InferredCommandParamFilter = 'deployments';

export interface InferredCommandParamConfig {
  required: boolean | 'project' | 'team';
  value?: string;
  filter?: InferredCommandParamFilter;
}

export interface InferredCommandExample {
  name: string;
  value: string;
}

type InferredInputNamesForOperation<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
> = Tag extends keyof OpenApiInputNamesByTagOperation
  ? OperationId extends keyof OpenApiInputNamesByTagOperation[Tag]
    ? Extract<OpenApiInputNamesByTagOperation[Tag][OperationId], string>
    : never
  : never;

type KnownInferredCommandConfig<
  Tag extends OpenApiCommandTag,
  OperationId extends OpenApiOperationIdsByTag[Tag],
> = Omit<InferredCommandConfig, 'arguments' | 'options' | 'display'> & {
  display?: KnownInferredCommandResponseDisplayByStatus<Tag, OperationId>;
  arguments?: OptionalRecord<
    InferredInputNamesForOperation<Tag, OperationId>,
    InferredCommandParamConfig
  > &
    Record<string, InferredCommandParamConfig | undefined>;
  options?: OptionalRecord<
    InferredInputNamesForOperation<Tag, OperationId>,
    InferredCommandParamConfig
  > &
    Record<string, InferredCommandParamConfig | undefined>;
};

type KnownOperationsByTag<Tag extends OpenApiCommandTag> = {
  [OperationId in OpenApiOperationIdsByTag[Tag]]?: KnownInferredCommandConfig<
    Tag,
    OperationId
  >;
};

type KnownTagConfig<Tag extends OpenApiCommandTag> = InferredTagConfig &
  KnownOperationsByTag<Tag> &
  Record<string, unknown>;

type KnownInferredCommands = {
  [Tag in OpenApiCommandTag]?: KnownTagConfig<Tag>;
};

export type InferredCommands = KnownInferredCommands &
  Record<string, (InferredTagConfig & Record<string, unknown>) | undefined>;

export function inferCommands<const T extends InferredCommands>(
  commands: T
): T {
  return commands;
}

function getDisplaySwitchSelectorToken(
  value: unknown
): DisplayScalarToken | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const selector = getDisplaySwitchSelectorToken(entry);
      if (selector) {
        return selector;
      }
    }
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  if (isDisplayScalarToken(value)) {
    return value;
  }

  if (!isDisplayFormattedValue(value)) {
    return null;
  }

  if (value.format === 'relativeTime') {
    return getDisplaySwitchSelectorToken(value.value);
  }

  if (value.format === 'duration') {
    return (
      getDisplaySwitchSelectorToken(value.end) ??
      getDisplaySwitchSelectorToken(value.start)
    );
  }

  if (value.format === 'capitalize') {
    return getDisplaySwitchSelectorToken(value.value);
  }

  if (value.format === 'scope') {
    return null;
  }

  if (value.format === 'icon') {
    return null;
  }

  if (value.format === 'join') {
    for (const entry of value.values) {
      const selector = getDisplaySwitchSelectorToken(entry);
      if (selector) {
        return selector;
      }
    }
    return null;
  }

  if (value.format === 'color') {
    return getDisplaySwitchSelectorToken(value.value);
  }

  if (value.format === 'link') {
    if (value.text) {
      return getDisplaySwitchSelectorToken(value.text);
    }
    return getDisplaySwitchSelectorToken(value.url);
  }

  if (value.format === 'conditional') {
    for (const entry of value.values) {
      const selector = getDisplaySwitchSelectorToken(entry);
      if (selector) {
        return selector;
      }
    }
    return null;
  }

  return getDisplaySwitchSelectorToken(value.value);
}

function resolveDisplayIcon(name: DisplayIconName): string {
  switch (name) {
    case 'circle-fill':
      return '●';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    case 'error':
      return '🚫';
    case 'check':
      return '✓';
    default:
      return '●';
  }
}

function areDisplayScalarTokensEqual(
  a: DisplayScalarToken,
  b: DisplayScalarToken
): boolean {
  if (a[DISPLAY_SCALAR_SYMBOL] !== b[DISPLAY_SCALAR_SYMBOL]) {
    return false;
  }

  const aPath = a[DISPLAY_PATH_SYMBOL];
  const bPath = b[DISPLAY_PATH_SYMBOL];
  if (aPath.length !== bPath.length) {
    return false;
  }

  return aPath.every((segment, index) => segment === bPath[index]);
}

function resolveSwitchSelectorToken(
  cases: DisplaySwitchCasesInput
): DisplayScalarToken {
  const defaultSelector = getDisplaySwitchSelectorToken(cases.DEFAULT);
  let selectorToken = defaultSelector;

  for (const [caseName, caseValue] of Object.entries(cases)) {
    if (caseName === 'DEFAULT') {
      continue;
    }

    const caseSelector = getDisplaySwitchSelectorToken(caseValue);
    if (!caseSelector) {
      continue;
    }

    if (!selectorToken) {
      selectorToken = caseSelector;
      continue;
    }

    if (!areDisplayScalarTokensEqual(selectorToken, caseSelector)) {
      throw new Error(
        'util.switch cases must reference the same display token path'
      );
    }
  }

  if (!selectorToken) {
    throw new Error(
      'util.switch requires values derived from a display token and a DEFAULT branch'
    );
  }

  return selectorToken;
}

export const util = {
  relativeTime(value: DisplayNumberInput): DisplayRelativeTimeValue {
    return { value, format: 'relativeTime' };
  },
  capitalize(value: DisplayNestableValue): DisplayCapitalizeValue {
    return { value, format: 'capitalize' };
  },
  duration(
    end: DisplayNumberInput,
    start: DisplayNumberInput
  ): DisplayDurationValue {
    return { end, start, format: 'duration' };
  },
  scope(): DisplayScopeValue {
    return { format: 'scope' };
  },
  join(
    values: readonly DisplayNestableValue[],
    separator = ' '
  ): DisplayJoinValue {
    return { values, separator, format: 'join' };
  },
  multiline(values: readonly DisplayNestableValue[]): DisplayJoinValue {
    return { values, separator: '\n', format: 'join' };
  },
  icon(name: DisplayIconName): DisplayIconValue {
    return { format: 'icon', name };
  },
  link(
    url: DisplayNestableValue,
    text?: DisplayNestableValue
  ): DisplayLinkValue {
    if (text === undefined) {
      return { url, format: 'link' };
    }
    return { url, format: 'link', text };
  },
  conditional(
    ...values: [DisplayNestableValue, ...DisplayNestableValue[]]
  ): DisplayConditionalValue {
    return { format: 'conditional', values };
  },
  switch(cases: DisplaySwitchCasesInput): DisplaySwitchValue {
    const { DEFAULT: defaultCase, ...configuredCases } = cases;
    return {
      value: resolveSwitchSelectorToken(cases),
      format: 'switch',
      cases: configuredCases,
      defaultCase,
    };
  },
  color: {
    gray(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'gray' };
    },
    red(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'red' };
    },
    green(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'green' };
    },
    yellow(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'yellow' };
    },
    blue(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'blue' };
    },
    magenta(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'magenta' };
    },
    cyan(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'cyan' };
    },
    white(value: DisplayColorInput): DisplayColorValue {
      return { value, format: 'color', color: 'white' };
    },
  },
};

type ResolvedInferredCommand = {
  tag: string;
  tagName: string;
  tagAliases: string[];
  operationId: string;
  config: InferredCommandConfig;
};

type InferredOperationParamMetadata = {
  name: string;
  required: boolean;
  type: string | null;
  description: string | null;
};

type InferredOperationBodyFieldMetadata = {
  name: string;
  required: boolean;
  type: string | null;
  description: string | null;
};

type InferredOperationMetadata = {
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  params: {
    path: InferredOperationParamMetadata[];
    query: InferredOperationParamMetadata[];
    header: InferredOperationParamMetadata[];
    cookie: InferredOperationParamMetadata[];
  };
  bodyFields: InferredOperationBodyFieldMetadata[];
};

type RunInferredCommandOptions = {
  client?: Client;
  execute?: boolean;
  help?: boolean;
  columns?: number;
  dryRun?: boolean;
  cwd?: string;
  scope?: string;
  team?: string;
  api?: string;
  projectPromptMode?: ProjectPromptMode;
};

type ParamSurface = 'arguments' | 'options';
type ParameterLocation = 'path' | 'query' | 'header' | 'cookie' | 'bodyFields';

type ParsedCliInput = {
  positionals: string[];
  options: Record<string, string | boolean>;
};

type NormalizedParamDefinition = {
  inputKey: string;
  outputName: string;
  config: InferredCommandParamConfig;
  source: {
    location: ParameterLocation | null;
    name: string;
  };
};

type InferredCommandContext = {
  cwd: string;
  project: { id: string } | null;
  team: {
    value: string;
    source: '--scope' | '--team' | 'link' | 'current-team' | 'default-team';
  } | null;
};

type DisplayRenderContext = {
  scope: string | null;
  mode: 'terminal' | 'json';
};

type RequestPreview = {
  method: string | null;
  url: string | null;
  path: string | null;
  query: Record<string, string>;
  body: Record<string, string>;
};

type InferredDryRunPreview = {
  tag: string;
  operationId: string;
  matchedValue: string | null;
  context: InferredCommandContext;
  provided: {
    arguments: Record<string, string>;
    options: Record<string, string | boolean>;
    extraArguments: string[];
    extraOptions: Record<string, string | boolean>;
  };
  request: RequestPreview;
};

type TagOperationOverview = {
  operationId: string;
  value: string;
  aliases: string[];
  arguments: CommandArgument[];
};

type ResolvedTagConfig = {
  key: string;
  name: string;
  aliases: string[];
  operations: Record<string, InferredCommandConfig>;
};

type MissingRequiredInput = {
  surface: ParamSurface;
  definition: NormalizedParamDefinition;
  reason: string;
  hint: string;
};

type ProjectPromptMode = 'reactive-core' | 'legacy-search';
type ProjectPromptResult =
  | {
      kind: 'project';
      value: string;
      scopeId: string;
      scopeSlug: string;
    }
  | {
      kind: 'limited-scope';
      scope: ScopeAutocompleteChoice;
    };

type ScopeAutocompleteChoice = {
  id: string;
  slug: string;
  name: string;
  limited: boolean;
  samlEnforced: boolean;
};

type ProjectAutocompleteChoice = {
  id: string;
  name: string;
  updatedAt: number | null;
};

type InferredOperationDescriptionsByTag = Map<string, Map<string, string>>;

let inferredOperationDescriptionsByTagPromise:
  | Promise<InferredOperationDescriptionsByTag>
  | undefined;

function getDefaultOutputName(inputKey: string): string {
  const dotIndex = inputKey.lastIndexOf('.');
  return dotIndex === -1 ? inputKey : inputKey.slice(dotIndex + 1);
}

function normalizeOutputName(
  inputKey: string,
  valueOverride: string | undefined,
  surface: ParamSurface
): string {
  if (valueOverride) {
    return valueOverride;
  }

  const defaultOutputName = getDefaultOutputName(inputKey);
  if (defaultOutputName === 'teamId') {
    return surface === 'options' ? 'scope' : 'team';
  }

  return defaultOutputName;
}

function parseInputSource(inputKey: string): {
  location: ParameterLocation | null;
  name: string;
} {
  const dotIndex = inputKey.indexOf('.');
  if (dotIndex === -1) {
    return { location: null, name: inputKey };
  }

  const namespace = inputKey.slice(0, dotIndex);
  const name = inputKey.slice(dotIndex + 1);
  switch (namespace) {
    case 'path':
    case 'query':
    case 'header':
    case 'cookie':
    case 'bodyFields':
      return {
        location: namespace,
        name,
      };
    default:
      return {
        location: null,
        name: inputKey,
      };
  }
}

function normalizeParamDefinitions(
  configMap: Record<string, InferredCommandParamConfig | undefined> | undefined,
  surface: ParamSurface
): NormalizedParamDefinition[] {
  if (!configMap) {
    return [];
  }

  const definitions: NormalizedParamDefinition[] = [];
  for (const [inputKey, config] of Object.entries(configMap)) {
    if (!config) {
      continue;
    }

    definitions.push({
      inputKey,
      outputName: normalizeOutputName(inputKey, config.value, surface),
      config,
      source: parseInputSource(inputKey),
    });
  }

  return definitions;
}

function normalizeParamConfigs(
  configMap: Record<string, InferredCommandParamConfig | undefined> | undefined,
  surface: ParamSurface
): Record<string, InferredCommandParamConfig> | null {
  if (!configMap) {
    return null;
  }

  const normalized: Record<string, InferredCommandParamConfig> = {};
  for (const [inputKey, config] of Object.entries(configMap)) {
    if (!config) {
      continue;
    }

    const outputName = normalizeOutputName(inputKey, config.value, surface);
    normalized[outputName] = {
      ...config,
      value: outputName,
    };
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeOptionName(raw: string): string {
  if (raw === 'team' || raw === 'S') {
    return 'scope';
  }
  return raw;
}

function parseProvidedCliInput(tokens: string[]): ParsedCliInput {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (token === '--') {
      positionals.push(...tokens.slice(index + 1));
      break;
    }

    if (token.startsWith('--')) {
      const equalsIndex = token.indexOf('=');
      if (equalsIndex > -1) {
        const name = token.slice(2, equalsIndex);
        const value = token.slice(equalsIndex + 1);
        options[normalizeOptionName(name)] = value;
        continue;
      }

      const name = token.slice(2);
      const nextToken = tokens[index + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        options[normalizeOptionName(name)] = nextToken;
        index++;
      } else {
        options[normalizeOptionName(name)] = true;
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const name = token.slice(1);
      if (name.length === 1) {
        const nextToken = tokens[index + 1];
        if (nextToken && !nextToken.startsWith('-')) {
          options[normalizeOptionName(name)] = nextToken;
          index++;
        } else {
          options[normalizeOptionName(name)] = true;
        }
      } else {
        for (const shortName of name.split('')) {
          options[normalizeOptionName(shortName)] = true;
        }
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, options };
}

function expandHomeDirectory(pathValue: string): string {
  if (pathValue === '~') {
    return homedir();
  }
  if (pathValue.startsWith('~/')) {
    return `${homedir()}${pathValue.slice(1)}`;
  }
  return pathValue;
}

function resolveCommandCwd(cwdOverride: string | undefined): string {
  if (!cwdOverride) {
    return process.cwd();
  }

  const expandedPath = expandHomeDirectory(cwdOverride);
  return isAbsolute(expandedPath)
    ? expandedPath
    : resolvePath(process.cwd(), expandedPath);
}

async function resolveInferredContext(
  cwdOverride: string | undefined,
  scopeOverride: string | undefined,
  teamOverride: string | undefined,
  client?: Client
): Promise<InferredCommandContext> {
  const cwd = resolveCommandCwd(cwdOverride);

  let linkedProject: { projectId: string; orgId: string } | null = null;
  try {
    linkedProject = await getLinkFromDir<{ projectId: string; orgId: string }>(
      getVercelDirectory(cwd)
    );
  } catch {
    linkedProject = null;
  }

  const scopeValue = scopeOverride ?? teamOverride;
  let teamFromClient: InferredCommandContext['team'] = null;

  if (!scopeValue && !linkedProject?.orgId && client?.config.currentTeam) {
    teamFromClient = {
      value: client.config.currentTeam,
      source: 'current-team',
    };
  }

  if (!scopeValue && !linkedProject?.orgId && !teamFromClient && client) {
    try {
      const user = await getUser(client);
      if (user.version === 'northstar' && user.defaultTeamId) {
        teamFromClient = {
          value: user.defaultTeamId,
          source: 'default-team',
        };
      }
    } catch {
      // Best-effort fallback only; command execution can proceed without team context.
    }
  }

  const resolvedTeam: InferredCommandContext['team'] = scopeValue
    ? {
        value: scopeValue,
        source: (scopeOverride ? '--scope' : '--team') as '--scope' | '--team',
      }
    : linkedProject?.orgId
      ? {
          value: linkedProject.orgId,
          source: 'link' as const,
        }
      : teamFromClient;

  if (resolvedTeam?.value && client && resolvedTeam.value.startsWith('team_')) {
    try {
      const team = await getTeamById(client, resolvedTeam.value);
      if (team?.slug) {
        resolvedTeam.value = team.slug;
      }
    } catch {
      // If slug lookup fails, keep the original team identifier.
    }
  }

  return {
    cwd,
    project: linkedProject?.projectId
      ? {
          id: linkedProject.projectId,
        }
      : null,
    team: resolvedTeam,
  };
}

function normalizeApiBaseUrl(apiOverride: string | undefined): string {
  const fallback = 'https://api.vercel.com';
  if (!apiOverride) {
    return fallback;
  }

  try {
    return new URL(apiOverride).toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

function stringifyProvidedValue(value: string | boolean): string {
  return typeof value === 'string' ? value : String(value);
}

function stringifyPreviewCell(value: unknown): string {
  if (value === null || value === undefined) {
    return chalk.gray('--');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function renderSectionRows(rows: Array<[string, string]>): string {
  if (rows.length === 0) {
    return `  ${chalk.gray('(empty)')}  ${chalk.gray('--')}`;
  }

  const maxKeyLength = rows.reduce(
    (max, [key]) => Math.max(max, key.length),
    0
  );
  return rows
    .map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      return `  ${chalk.gray(paddedKey)}  ${value}`;
    })
    .join('\n');
}

function renderKeyValueSection(
  title: string,
  entries: Array<[string, unknown]>
): string {
  const rows: Array<[string, string]> =
    entries.length > 0
      ? entries.map(([key, value]) => [key, stringifyPreviewCell(value)])
      : [];
  return `${chalk.bold.cyan(`${title}:`)}\n${renderSectionRows(rows)}`;
}

function renderRecordSection(
  title: string,
  record: Record<string, unknown>
): string {
  const entries = Object.keys(record)
    .sort()
    .map(key => [key, record[key]] as [string, unknown]);
  return renderKeyValueSection(title, entries);
}

function renderListSection(title: string, values: string[]): string {
  if (values.length === 0) {
    return renderKeyValueSection(title, []);
  }
  const rows: Array<[string, string]> = values.map((value, index) => [
    String(index + 1),
    value,
  ]);
  return `${chalk.bold.cyan(`${title}:`)}\n${renderSectionRows(rows)}`;
}

function printDryRunPreview(preview: InferredDryRunPreview): void {
  const sections = [
    chalk.bold(
      `Inferred command dry run: ${preview.tag} ${preview.matchedValue ?? preview.operationId}`
    ),
    renderKeyValueSection('Request', [
      ['tag', preview.tag],
      ['operation', preview.operationId],
      [
        'method',
        preview.request.method ? chalk.green(preview.request.method) : null,
      ],
      ['path', preview.request.path],
    ]),
    renderKeyValueSection('Context', [
      ['cwd', preview.context.cwd],
      ['project', preview.context.project?.id ?? null],
      ['team', preview.context.team?.value ?? null],
      ['teamSource', preview.context.team?.source ?? null],
    ]),
    renderRecordSection('Provided Arguments', preview.provided.arguments),
    renderRecordSection('Provided Options', preview.provided.options),
    renderListSection('Extra Arguments', preview.provided.extraArguments),
    renderRecordSection('Extra Options', preview.provided.extraOptions),
    renderRecordSection('Request Query', preview.request.query),
    renderRecordSection('Request Body', preview.request.body),
  ];

  output.print(sections.join('\n\n'));
}

function isEnabledFlag(value: string | boolean | undefined): boolean {
  return value === true || value === '' || value === 'true';
}

function isJsonOutputRequested(
  parsedOptions: Record<string, string | boolean>
): boolean {
  if (isEnabledFlag(parsedOptions.json)) {
    return true;
  }

  return (
    typeof parsedOptions.format === 'string' &&
    parsedOptions.format.toLowerCase() === 'json'
  );
}

const OSC_HYPERLINK_PATTERN =
  /\u001b]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)(.*?)\u001b]8;;(?:\u0007|\u001b\\)/g;

function normalizeInferredJsonValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripAnsi(value.replace(OSC_HYPERLINK_PATTERN, '$1'));
  }

  if (Array.isArray(value)) {
    const normalizedItems = value.map(item => normalizeInferredJsonValue(item));
    const flatten = (items: unknown[]): unknown[] =>
      items.flatMap(item => (Array.isArray(item) ? flatten(item) : [item]));

    const flattenedItems = flatten(normalizedItems).filter(
      item => item !== null && item !== undefined
    );
    const isInlineScalarList = flattenedItems.every(
      item =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
    );
    if (isInlineScalarList) {
      return flattenedItems
        .map(item => String(item).trim())
        .filter(Boolean)
        .join(' ');
    }
    return normalizedItems.filter(item => item !== undefined);
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, [key, nestedValue]) => {
      acc[key] = normalizeInferredJsonValue(nestedValue);
      return acc;
    }, {});
  }

  return value;
}

function formatInferredJsonOutput(value: unknown, client: Client): string {
  return JSON.stringify(normalizeInferredJsonValue(value), null, 2);
}

function readValueAtPath(
  input: unknown,
  path: string | readonly string[]
): unknown {
  const segments = typeof path === 'string' ? path.split('.') : path;
  let current: unknown = input;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function isDisplayPathTemplate(value: unknown): value is DisplayPathTemplate {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'path' &&
    Array.isArray((value as { path?: unknown }).path)
  );
}

function isDisplayLiteralTemplate(
  value: unknown
): value is DisplayLiteralTemplate {
  if (
    !Boolean(value) ||
    typeof value !== 'object' ||
    (value as { type?: unknown }).type !== 'literal'
  ) {
    return false;
  }

  const literalValue = (value as { value?: unknown }).value;
  return (
    literalValue === null ||
    typeof literalValue === 'string' ||
    typeof literalValue === 'number' ||
    typeof literalValue === 'boolean'
  );
}

function isDisplayFormatTemplate(
  value: unknown
): value is DisplayFormatTemplate {
  const format = (value as { format?: unknown }).format;
  const formatValue = (value as { value?: unknown }).value;
  const isTemplateLeaf = (
    input: unknown
  ): input is
    | DisplayPathTemplate
    | DisplayFormatTemplate
    | DisplayLiteralTemplate =>
    isDisplayPathTemplate(input) ||
    isDisplayFormatTemplate(input) ||
    isDisplayLiteralTemplate(input);

  if (
    !Boolean(value) ||
    typeof value !== 'object' ||
    (value as { type?: unknown }).type !== 'format'
  ) {
    return false;
  }

  if (format === 'relativeTime') {
    return isTemplateLeaf(formatValue);
  }

  if (format === 'duration') {
    const endValue = (value as { end?: unknown }).end;
    const startValue = (value as { start?: unknown }).start;
    const isDurationValue = (input: unknown) => isTemplateLeaf(input);

    return isDurationValue(endValue) && isDurationValue(startValue);
  }

  if (format === 'color') {
    return (
      (value as { color?: unknown }).color !== undefined &&
      [
        'gray',
        'red',
        'green',
        'yellow',
        'blue',
        'magenta',
        'cyan',
        'white',
      ].includes(String((value as { color?: unknown }).color)) &&
      (isDisplayPathTemplate(formatValue) ||
        isDisplayFormatTemplate(formatValue) ||
        isDisplayLiteralTemplate(formatValue))
    );
  }

  if (format === 'switch') {
    const casesValue = (value as { cases?: unknown }).cases;
    const defaultCaseValue = (value as { defaultCase?: unknown }).defaultCase;

    if (
      !isDisplayPathTemplate(formatValue) ||
      typeof casesValue !== 'object' ||
      casesValue === null ||
      Array.isArray(casesValue) ||
      !(
        isTemplateLeaf(defaultCaseValue) ||
        (Array.isArray(defaultCaseValue) &&
          defaultCaseValue.every(entry => isTemplateLeaf(entry)))
      )
    ) {
      return false;
    }

    return Object.values(casesValue).every(
      caseTemplate =>
        isTemplateLeaf(caseTemplate) ||
        (Array.isArray(caseTemplate) &&
          caseTemplate.every(entry => isTemplateLeaf(entry)))
    );
  }

  if (format === 'capitalize') {
    return isTemplateLeaf(formatValue);
  }

  if (format === 'scope') {
    return true;
  }

  if (format === 'icon') {
    const name = (value as { name?: unknown }).name;
    return (
      typeof name === 'string' &&
      ['circle-fill', 'warning', 'info', 'error', 'check'].includes(name)
    );
  }

  if (format === 'join') {
    const values = (value as { values?: unknown }).values;
    const separator = (value as { separator?: unknown }).separator;
    if (!Array.isArray(values) || typeof separator !== 'string') {
      return false;
    }

    return values.every(
      entry =>
        isTemplateLeaf(entry) ||
        (Array.isArray(entry) && entry.every(nested => isTemplateLeaf(nested)))
    );
  }

  if (format === 'link') {
    const urlValue = (value as { url?: unknown }).url;
    const textValue = (value as { text?: unknown }).text;

    if (!isTemplateLeaf(urlValue)) {
      return false;
    }

    if (textValue === undefined) {
      return true;
    }

    return isTemplateLeaf(textValue);
  }

  if (format === 'conditional') {
    const values = (value as { values?: unknown }).values;
    if (!Array.isArray(values) || values.length === 0) {
      return false;
    }

    return values.every(
      entry =>
        isTemplateLeaf(entry) ||
        (Array.isArray(entry) && entry.every(nested => isTemplateLeaf(nested)))
    );
  }

  return false;
}

function isDisplayScalarToken(value: unknown): value is DisplayScalarToken {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const kind = (value as DisplayScalarToken)[DISPLAY_SCALAR_SYMBOL];
  return (
    (kind === 'string' || kind === 'number' || kind === 'boolean') &&
    Array.isArray((value as DisplayScalarToken)[DISPLAY_PATH_SYMBOL])
  );
}

function isDisplaySwitchCaseValue(
  value: unknown
): value is DisplaySwitchCaseValue {
  if (Array.isArray(value)) {
    return value.every(entry => isDisplaySwitchCaseValue(entry));
  }
  return (
    isDisplayScalarToken(value) ||
    isDisplayFormattedValue(value) ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isDisplayNestableValue(value: unknown): value is DisplayNestableValue {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    isDisplayScalarToken(value) ||
    isDisplayFormattedValue(value)
  );
}

function isDisplayFormattedValue(
  value: unknown
): value is DisplayFormattedValue {
  const format = (value as { format?: unknown }).format;

  if (!value || typeof value !== 'object') {
    return false;
  }

  if (format === 'relativeTime') {
    const inner = (value as { value?: unknown }).value;
    return isDisplayNestableValue(inner);
  }

  if (format === 'duration') {
    const end = (value as { end?: unknown }).end;
    const start = (value as { start?: unknown }).start;
    const isDurationToken = (input: unknown) => isDisplayNestableValue(input);

    return isDurationToken(end) && isDurationToken(start);
  }

  if (format === 'capitalize') {
    const inner = (value as { value?: unknown }).value;
    return isDisplayNestableValue(inner);
  }

  if (format === 'scope') {
    return true;
  }

  if (format === 'icon') {
    const name = (value as { name?: unknown }).name;
    return (
      typeof name === 'string' &&
      ['circle-fill', 'warning', 'info', 'error', 'check'].includes(name)
    );
  }

  if (format === 'join') {
    const values = (value as { values?: unknown }).values;
    const separator = (value as { separator?: unknown }).separator;
    return (
      Array.isArray(values) &&
      typeof separator === 'string' &&
      values.every(entry => isDisplayNestableValue(entry))
    );
  }

  if (
    format === 'color' &&
    [
      'gray',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
    ].includes(String((value as { color?: unknown }).color))
  ) {
    const inner = (value as { value?: unknown }).value;
    return isDisplayNestableValue(inner);
  }

  if (format === 'switch') {
    const selector = (value as { value?: unknown }).value;
    const cases = (value as { cases?: unknown }).cases;
    const defaultCase = (value as { defaultCase?: unknown }).defaultCase;

    if (
      !isDisplayScalarToken(selector) ||
      typeof cases !== 'object' ||
      cases === null ||
      Array.isArray(cases) ||
      !isDisplaySwitchCaseValue(defaultCase)
    ) {
      return false;
    }

    return Object.values(cases).every(caseValue =>
      isDisplaySwitchCaseValue(caseValue)
    );
  }

  if (format === 'link') {
    const url = (value as { url?: unknown }).url;
    const text = (value as { text?: unknown }).text;

    if (!isDisplayNestableValue(url)) {
      return false;
    }

    if (text === undefined) {
      return true;
    }

    return isDisplayNestableValue(text);
  }

  if (format === 'conditional') {
    const values = (value as { values?: unknown }).values;
    return (
      Array.isArray(values) &&
      values.length > 0 &&
      values.every(entry => isDisplayNestableValue(entry))
    );
  }

  return false;
}

function toDisplayTemplate(value: unknown): DisplayTemplateValue | null {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return {
      type: 'literal',
      value: value ?? null,
    };
  }

  if (isDisplayScalarToken(value)) {
    return {
      type: 'path',
      path: value[DISPLAY_PATH_SYMBOL],
    };
  }

  if (isDisplayFormattedValue(value)) {
    if (value.format === 'conditional') {
      const valueTemplates = value.values.map(entry =>
        toDisplayTemplate(entry)
      );
      if (
        valueTemplates.some(
          template =>
            !template ||
            (!isDisplayPathTemplate(template) &&
              !isDisplayFormatTemplate(template) &&
              !isDisplayLiteralTemplate(template) &&
              !(
                Array.isArray(template) &&
                template.every(
                  nested =>
                    isDisplayPathTemplate(nested) ||
                    isDisplayFormatTemplate(nested) ||
                    isDisplayLiteralTemplate(nested)
                )
              ))
        )
      ) {
        return null;
      }

      return {
        type: 'format',
        format: 'conditional',
        values: valueTemplates as (
          | DisplayPathTemplate
          | DisplayFormatTemplate
          | DisplayLiteralTemplate
          | DisplayTemplateValue[]
        )[],
      };
    }

    if (value.format === 'relativeTime') {
      const innerTemplate = toDisplayTemplate(value.value);
      if (
        !innerTemplate ||
        (!isDisplayPathTemplate(innerTemplate) &&
          !isDisplayFormatTemplate(innerTemplate) &&
          !isDisplayLiteralTemplate(innerTemplate))
      ) {
        return null;
      }

      return {
        type: 'format',
        value: innerTemplate,
        format: 'relativeTime',
      };
    }

    if (value.format === 'duration') {
      const endTemplate = toDisplayTemplate(value.end);
      const startTemplate = toDisplayTemplate(value.start);
      const isValidDurationTemplate = (
        template: DisplayTemplateValue | null
      ): template is
        | DisplayPathTemplate
        | DisplayFormatTemplate
        | DisplayLiteralTemplate =>
        Boolean(template) &&
        (isDisplayPathTemplate(template) ||
          isDisplayFormatTemplate(template) ||
          (isDisplayLiteralTemplate(template) &&
            (template.value === null ||
              typeof template.value === 'number' ||
              typeof template.value === 'string' ||
              typeof template.value === 'boolean')));

      if (
        !isValidDurationTemplate(endTemplate) ||
        !isValidDurationTemplate(startTemplate)
      ) {
        return null;
      }

      return {
        type: 'format',
        end: endTemplate,
        start: startTemplate,
        format: 'duration',
      };
    }

    if (value.format === 'capitalize') {
      const innerTemplate = toDisplayTemplate(value.value);
      if (
        !innerTemplate ||
        (!isDisplayPathTemplate(innerTemplate) &&
          !isDisplayFormatTemplate(innerTemplate) &&
          !isDisplayLiteralTemplate(innerTemplate))
      ) {
        return null;
      }

      return {
        type: 'format',
        value: innerTemplate,
        format: 'capitalize',
      };
    }

    if (value.format === 'scope') {
      return {
        type: 'format',
        format: 'scope',
      };
    }

    if (value.format === 'join') {
      const valueTemplates = value.values.map(entry =>
        toDisplayTemplate(entry)
      );
      if (
        valueTemplates.some(
          template =>
            !template ||
            (!isDisplayPathTemplate(template) &&
              !isDisplayFormatTemplate(template) &&
              !isDisplayLiteralTemplate(template) &&
              !(
                Array.isArray(template) &&
                template.every(
                  nested =>
                    isDisplayPathTemplate(nested) ||
                    isDisplayFormatTemplate(nested) ||
                    isDisplayLiteralTemplate(nested)
                )
              ))
        )
      ) {
        return null;
      }

      return {
        type: 'format',
        values: valueTemplates as (
          | DisplayPathTemplate
          | DisplayFormatTemplate
          | DisplayLiteralTemplate
          | DisplayTemplateValue[]
        )[],
        separator: value.separator,
        format: 'join',
      };
    }

    if (value.format === 'link') {
      const urlTemplate = toDisplayTemplate(value.url);
      if (
        !urlTemplate ||
        (!isDisplayPathTemplate(urlTemplate) &&
          !isDisplayFormatTemplate(urlTemplate) &&
          !isDisplayLiteralTemplate(urlTemplate))
      ) {
        return null;
      }

      if (value.text === undefined) {
        return {
          type: 'format',
          url: urlTemplate,
          format: 'link',
        };
      }

      const textTemplate = toDisplayTemplate(value.text);
      if (
        !textTemplate ||
        (!isDisplayPathTemplate(textTemplate) &&
          !isDisplayFormatTemplate(textTemplate) &&
          !isDisplayLiteralTemplate(textTemplate))
      ) {
        return null;
      }

      return {
        type: 'format',
        url: urlTemplate,
        format: 'link',
        text: textTemplate,
      };
    }

    if (value.format === 'icon') {
      return {
        type: 'format',
        format: 'icon',
        name: value.name,
      };
    }

    const innerTemplate = toDisplayTemplate(value.value);
    if (!innerTemplate) {
      return null;
    }

    if (value.format === 'switch') {
      if (!isDisplayPathTemplate(innerTemplate)) {
        return null;
      }

      const defaultTemplate = toDisplayTemplate(value.defaultCase);
      if (!defaultTemplate) {
        return null;
      }

      const caseTemplates: Record<string, DisplayTemplateValue> = {};
      for (const [caseKey, caseValue] of Object.entries(value.cases)) {
        const caseTemplate = toDisplayTemplate(caseValue);
        if (!caseTemplate) {
          return null;
        }
        caseTemplates[caseKey] = caseTemplate;
      }

      return {
        type: 'format',
        value: innerTemplate,
        format: 'switch',
        cases: caseTemplates,
        defaultCase: defaultTemplate,
      };
    }

    if (value.format === 'color') {
      if (
        !isDisplayPathTemplate(innerTemplate) &&
        !isDisplayFormatTemplate(innerTemplate) &&
        !isDisplayLiteralTemplate(innerTemplate)
      ) {
        return null;
      }

      return {
        type: 'format',
        value: innerTemplate,
        format: 'color',
        color: value.color,
      };
    }

    if (!isDisplayPathTemplate(innerTemplate)) {
      return null;
    }

    return {
      type: 'format',
      value: innerTemplate,
      format: value.format,
    };
  }

  if (Array.isArray(value)) {
    const templates = value.map(item => toDisplayTemplate(item));
    if (templates.some(template => template === null)) {
      return null;
    }
    return templates as DisplayTemplateValue[];
  }

  if (typeof value === 'object' && value !== null) {
    const templateObject: Record<string, DisplayTemplateValue> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedTemplate = toDisplayTemplate(nestedValue);
      if (nestedTemplate === null) {
        return null;
      }
      templateObject[key] = nestedTemplate;
    }
    return templateObject;
  }

  return null;
}

function resolveDisplayTemplate(
  template: DisplayTemplateValue,
  payload: unknown,
  renderContext: DisplayRenderContext
): unknown {
  if (isDisplayLiteralTemplate(template)) {
    return template.value;
  }

  if (isDisplayPathTemplate(template)) {
    const value = readValueAtPath(payload, template.path);
    return value === undefined ? null : value;
  }

  if (isDisplayFormatTemplate(template)) {
    if (template.format === 'relativeTime') {
      const value = isDisplayPathTemplate(template.value)
        ? readValueAtPath(payload, template.value.path)
        : resolveDisplayTemplate(template.value, payload, renderContext);
      if (value === undefined || value === null) {
        return null;
      }

      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return String(value);
      }
      const diff = Date.now() - value;
      if (diff < 0) {
        return 'just now';
      }
      return ms(diff);
    }

    if (template.format === 'duration') {
      const endValue = isDisplayPathTemplate(template.end)
        ? readValueAtPath(payload, template.end.path)
        : isDisplayLiteralTemplate(template.end)
          ? template.end.value
          : resolveDisplayTemplate(template.end, payload, renderContext);
      const startValue = isDisplayPathTemplate(template.start)
        ? readValueAtPath(payload, template.start.path)
        : isDisplayLiteralTemplate(template.start)
          ? template.start.value
          : resolveDisplayTemplate(template.start, payload, renderContext);

      if (endValue === undefined || endValue === null) {
        return '?';
      }
      if (startValue === undefined || startValue === null) {
        return '?';
      }
      if (
        typeof endValue !== 'number' ||
        !Number.isFinite(endValue) ||
        typeof startValue !== 'number' ||
        !Number.isFinite(startValue)
      ) {
        return '?';
      }

      const durationValue = ms(endValue - startValue);
      return durationValue === '0ms' ? '--' : durationValue;
    }

    if (template.format === 'capitalize') {
      const value = isDisplayPathTemplate(template.value)
        ? readValueAtPath(payload, template.value.path)
        : resolveDisplayTemplate(template.value, payload, renderContext);
      if (value === undefined || value === null) {
        return null;
      }
      if (renderContext.mode === 'json') {
        return String(value);
      }
      return title(String(value).toLowerCase());
    }

    if (template.format === 'scope') {
      return renderContext.scope;
    }

    if (template.format === 'icon') {
      if (renderContext.mode === 'json') {
        return null;
      }
      return resolveDisplayIcon(template.name);
    }

    if (template.format === 'join') {
      const parts = template.values.flatMap(entry => {
        const resolved = resolveDisplayTemplate(entry, payload, renderContext);
        if (resolved === null || resolved === undefined) {
          return [];
        }

        if (Array.isArray(resolved)) {
          return resolved.map(value => String(value)).filter(Boolean);
        }

        return [String(resolved)];
      });

      if (parts.length === 0) {
        return null;
      }

      return parts.join(template.separator);
    }

    if (template.format === 'switch') {
      const selectorValue = readValueAtPath(payload, template.value.path);
      const caseKey =
        selectorValue === undefined || selectorValue === null
          ? null
          : String(selectorValue);
      const selectedTemplate =
        caseKey && Object.prototype.hasOwnProperty.call(template.cases, caseKey)
          ? template.cases[caseKey]
          : template.defaultCase;

      return resolveDisplayTemplate(selectedTemplate, payload, renderContext);
    }

    if (template.format === 'link') {
      const urlValue = isDisplayPathTemplate(template.url)
        ? readValueAtPath(payload, template.url.path)
        : isDisplayLiteralTemplate(template.url)
          ? template.url.value
          : resolveDisplayTemplate(template.url, payload, renderContext);
      if (urlValue === undefined || urlValue === null) {
        return null;
      }

      const rawUrl = String(urlValue);
      const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl)
        ? rawUrl
        : `https://${rawUrl}`;
      const textValue =
        template.text === undefined
          ? url
          : isDisplayPathTemplate(template.text)
            ? readValueAtPath(payload, template.text.path)
            : resolveDisplayTemplate(template.text, payload, renderContext);
      const text =
        textValue === undefined || textValue === null ? url : String(textValue);

      if (renderContext.mode === 'json') {
        return text;
      }

      return output.link(text, url, {
        color: false,
        fallback: () => text,
      });
    }

    if (template.format === 'conditional') {
      for (const entry of template.values) {
        const resolved = resolveDisplayTemplate(entry, payload, renderContext);
        if (resolved !== null && resolved !== undefined) {
          return resolved;
        }
      }
      return null;
    }

    const value = isDisplayPathTemplate(template.value)
      ? readValueAtPath(payload, template.value.path)
      : resolveDisplayTemplate(template.value, payload, renderContext);
    if (value === undefined || value === null) {
      return null;
    }

    const stringValue = String(value);
    if (renderContext.mode === 'json') {
      return stringValue;
    }
    switch (template.color) {
      case 'gray':
        return chalk.gray(stringValue);
      case 'red':
        return chalk.red(stringValue);
      case 'green':
        return chalk.green(stringValue);
      case 'yellow':
        return chalk.yellow(stringValue);
      case 'blue':
        return chalk.blue(stringValue);
      case 'magenta':
        return chalk.magenta(stringValue);
      case 'cyan':
        return chalk.cyan(stringValue);
      case 'white':
        return chalk.white(stringValue);
      default:
        return stringValue;
    }
  }

  if (Array.isArray(template)) {
    return template.map(entry =>
      resolveDisplayTemplate(entry, payload, renderContext)
    );
  }

  return Object.entries(template).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      acc[key] = resolveDisplayTemplate(value, payload, renderContext);
      return acc;
    },
    {}
  );
}

function createDisplayPathRecorder(
  path: readonly string[] = []
): DisplayUnknownAccessor {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === DISPLAY_PATH_SYMBOL) {
          return path;
        }
        if (prop === DISPLAY_SCALAR_SYMBOL) {
          return 'string';
        }
        if (typeof prop === 'symbol') {
          return undefined;
        }
        return createDisplayPathRecorder([...path, String(prop)]);
      },
    }
  ) as DisplayUnknownAccessor;
}

function getDisplayPropertyPayload(
  payload: unknown,
  displayProperty: string | undefined
): unknown {
  if (!displayProperty) {
    return payload;
  }
  const selected = readValueAtPath(payload, displayProperty);
  return selected === undefined ? payload : selected;
}

function buildDisplaySelectorTemplate(
  selector: (item: DisplayUnknownAccessor) => unknown
): DisplayTemplateValue | null {
  if (displayTemplateCache.has(selector)) {
    return displayTemplateCache.get(selector) ?? null;
  }

  let template: DisplayTemplateValue | null = null;
  try {
    const selection = selector(createDisplayPathRecorder());
    template = toDisplayTemplate(selection);
  } catch {
    template = null;
  }

  displayTemplateCache.set(selector, template);
  return template;
}

function applyDisplaySelector(
  payload: unknown,
  selector: (item: DisplayUnknownAccessor) => unknown,
  renderContext: DisplayRenderContext
): unknown {
  const template = buildDisplaySelectorTemplate(selector);
  if (!template) {
    return payload;
  }

  if (
    Array.isArray(payload) &&
    !Array.isArray(template) &&
    !isDisplayPathTemplate(template)
  ) {
    return payload.map(item =>
      resolveDisplayTemplate(template, item, renderContext)
    );
  }

  return resolveDisplayTemplate(template, payload, renderContext);
}

function applyDisplayFields(
  payload: unknown,
  fieldsSelector: InferredCommandSuccessResponseDisplayConfig['fields'],
  renderContext: DisplayRenderContext
): unknown {
  return applyDisplaySelector(
    payload,
    fieldsSelector as (item: DisplayUnknownAccessor) => unknown,
    renderContext
  );
}

function applyDisplayJson(
  body: unknown,
  displayProperty: string | undefined,
  fieldsSelector: InferredCommandSuccessResponseDisplayConfig['fields'],
  jsonSelector: InferredCommandSuccessResponseDisplayConfig['json'],
  renderContext: DisplayRenderContext
): unknown {
  if (jsonSelector === 'all') {
    return body;
  }

  const displayPayload = getDisplayPropertyPayload(body, displayProperty);
  if (typeof jsonSelector === 'function') {
    return applyDisplaySelector(
      displayPayload,
      jsonSelector as (item: DisplayUnknownAccessor) => unknown,
      renderContext
    );
  }

  return applyDisplayFields(displayPayload, fieldsSelector, renderContext);
}

function stringifyDisplayTableCell(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return value
      .map(entry => stringifyDisplayTableCell(entry))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatDisplayRowsAsTable(mapped: unknown): string | null {
  if (!Array.isArray(mapped) || mapped.length === 0) {
    return null;
  }

  const rows: Record<string, unknown>[] = mapped.map(item =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : ({ value: item } as Record<string, unknown>)
  );
  const columns = Object.keys(rows[0] ?? {});
  if (columns.length === 0) {
    return null;
  }

  const headers = columns.map(column => chalk.bold(chalk.cyan(column)));
  const bodyRows = rows.map(row =>
    columns.map(column => stringifyDisplayTableCell(row[column]))
  );

  return table([headers, ...bodyRows], { hsep: 3 });
}

function formatDisplayObjectAsCard(mapped: unknown): string | null {
  if (!mapped || Array.isArray(mapped) || typeof mapped !== 'object') {
    return null;
  }

  const isCardSectionObject = (
    value: unknown
  ): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const entries = Object.entries(mapped as Record<string, unknown>);
  if (entries.length === 0) {
    return null;
  }

  const sectionBlocks: string[] = [];
  const rootRows: Array<[string, string]> = [];

  for (const [key, value] of entries) {
    if (!isCardSectionObject(value)) {
      rootRows.push([key, stringifyDisplayTableCell(value)]);
      continue;
    }

    const sectionRows = Object.entries(value).map(
      ([nestedKey, nestedValue]) => [
        nestedKey,
        stringifyDisplayTableCell(nestedValue),
      ]
    ) as Array<[string, string]>;
    if (sectionRows.length === 0) {
      continue;
    }

    sectionBlocks.push(
      `${chalk.bold(key)}\n\n${renderSectionRows(sectionRows)}`
    );
  }

  if (sectionBlocks.length === 0) {
    return rootRows.length > 0 ? renderSectionRows(rootRows) : null;
  }

  if (rootRows.length > 0) {
    sectionBlocks.unshift(
      `${chalk.bold('General')}\n\n${renderSectionRows(rootRows)}`
    );
  }

  return sectionBlocks.join('\n\n');
}

function getDisplayForStatus(
  display: InferredCommandResponseDisplayByStatus | undefined,
  status: number
) {
  const statusKey = String(status) as HttpStatusCode;
  return display?.[statusKey];
}

function isSuccessDisplayConfig(
  value:
    | InferredCommandSuccessResponseDisplayConfig
    | InferredCommandErrorResponseDisplayConfig
    | undefined
): value is InferredCommandSuccessResponseDisplayConfig {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'fields' in value &&
    typeof (value as { fields?: unknown }).fields === 'function'
  );
}

async function executeInferredRequest(
  client: Client,
  request: RequestPreview,
  parsedOptions: Record<string, string | boolean>,
  display: InferredCommandResponseDisplayByStatus | undefined,
  context: InferredCommandContext
): Promise<number> {
  if (!request.url || !request.method) {
    output.error('Could not resolve inferred OpenAPI request.');
    return 1;
  }

  const method = request.method.toUpperCase();
  const hasBody =
    Object.keys(request.body).length > 0 &&
    method !== 'GET' &&
    method !== 'HEAD';

  if (isEnabledFlag(parsedOptions.verbose)) {
    output.debug(`Request: ${method} ${request.url}`);
    if (hasBody) {
      output.debug(`Body: ${JSON.stringify(request.body)}`);
    }
  }

  try {
    const confirmed = await client.confirmMutatingOperation(
      request.url,
      method
    );
    if (!confirmed) {
      return 1;
    }

    const response = await client.fetch(request.url, {
      method,
      body: hasBody ? request.body : undefined,
      headers: {},
      json: false,
    });

    if (isEnabledFlag(parsedOptions.include)) {
      client.stdout.write(`HTTP ${response.status} ${response.statusText}\n`);
      response.headers.forEach((value, key) => {
        client.stdout.write(`${key}: ${value}\n`);
      });
      client.stdout.write('\n');
    }

    if (isEnabledFlag(parsedOptions.silent)) {
      return 0;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      const rawOutput = isEnabledFlag(parsedOptions.raw);
      const jsonOutput = isJsonOutputRequested(parsedOptions);
      if (rawOutput) {
        client.stdout.write(`${formatOutput(body, { raw: false })}\n`);
        return 0;
      }

      const displayForStatus = getDisplayForStatus(display, response.status);
      if (isSuccessDisplayConfig(displayForStatus)) {
        const terminalRenderContext: DisplayRenderContext = {
          scope: context.team?.value ?? null,
          mode: 'terminal',
        };
        const jsonRenderContext: DisplayRenderContext = {
          scope: context.team?.value ?? null,
          mode: 'json',
        };
        if (jsonOutput) {
          const mappedJson = applyDisplayJson(
            body,
            displayForStatus.displayProperty,
            displayForStatus.fields,
            displayForStatus.json,
            jsonRenderContext
          );
          client.stdout.write(
            `${formatInferredJsonOutput(mappedJson, client)}\n`
          );
          return 0;
        }

        const displayPayload = getDisplayPropertyPayload(
          body,
          displayForStatus.displayProperty
        );
        const mapped = applyDisplayFields(
          displayPayload,
          displayForStatus.fields,
          terminalRenderContext
        );
        const tableOutput = formatDisplayRowsAsTable(mapped);
        if (tableOutput) {
          client.stdout.write(`\n${tableOutput}\n\n`);
          return 0;
        }

        const cardOutput = formatDisplayObjectAsCard(mapped);
        if (cardOutput) {
          client.stdout.write(`\n${cardOutput}\n\n`);
          return 0;
        }
        client.stdout.write(`${formatOutput(mapped, { raw: false })}\n`);
        return 0;
      }

      if (jsonOutput) {
        client.stdout.write(`${formatInferredJsonOutput(body, client)}\n`);
        return 0;
      }

      client.stdout.write(`${formatOutput(body, { raw: false })}\n`);
      return 0;
    }

    const body = await response.text();
    client.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
    return 0;
  } catch (error) {
    if (
      (isEnabledFlag(parsedOptions.raw) ||
        isJsonOutputRequested(parsedOptions)) &&
      error instanceof APIError
    ) {
      const errorPayload = {
        error: {
          status: error.status,
          code: error.code ?? null,
          message: error.serverMessage ?? error.message,
        },
      };
      client.stdout.write(
        `${formatInferredJsonOutput(errorPayload, client)}\n`
      );
      return 1;
    }
    output.prettyError(error);
    return 1;
  }
}

function stripHelpTokens(args: string[]): string[] {
  return args.filter(token => token !== '-h' && token !== '--help');
}

function getCommandValue(
  operationId: string,
  config: InferredCommandConfig
): string {
  return config.value ?? operationId;
}

function getCommandAliases(
  operationId: string,
  config: InferredCommandConfig
): string[] {
  const value = getCommandValue(operationId, config);
  return Array.from(
    new Set([
      ...(operationId === value ? [] : [operationId]),
      ...(config.aliases ?? []),
    ])
  ).filter(alias => alias !== value);
}

function isInferredCommandConfig(
  value: unknown
): value is InferredCommandConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toResolvedTagConfig(
  key: string,
  config: (InferredTagConfig & Record<string, unknown>) | undefined
): ResolvedTagConfig | null {
  if (!config) {
    return null;
  }

  const entries = Object.entries(config).filter(
    ([entryKey, entryValue]) =>
      entryKey !== 'name' &&
      entryKey !== 'aliases' &&
      isInferredCommandConfig(entryValue)
  );

  if (entries.length === 0) {
    return null;
  }

  return {
    key,
    name: config.name ?? key,
    aliases: config.aliases ?? [],
    operations: Object.fromEntries(entries) as Record<
      string,
      InferredCommandConfig
    >,
  };
}

function getResolvedTags(commands: InferredCommands): ResolvedTagConfig[] {
  return Object.entries(commands)
    .map(([key, config]) => toResolvedTagConfig(key, config))
    .filter((tag): tag is ResolvedTagConfig => Boolean(tag))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getConfiguredTags(commands: InferredCommands): ResolvedTagConfig[] {
  return getResolvedTags(commands);
}

function resolveTagConfig(
  commands: InferredCommands,
  tagToken: string
): ResolvedTagConfig | null {
  return (
    getResolvedTags(commands).find(
      tag =>
        tagToken === tag.name ||
        tagToken === tag.key ||
        tag.aliases.includes(tagToken)
    ) ?? null
  );
}

function getTagOperations(tag: ResolvedTagConfig): TagOperationOverview[] {
  return Object.entries(tag.operations)
    .filter(([_operationId, config]) => Boolean(config))
    .map(([operationId, config]) => ({
      operationId,
      value: getCommandValue(operationId, config),
      aliases: getCommandAliases(operationId, config),
      arguments: normalizeParamDefinitions(config.arguments, 'arguments').map(
        definition => ({
          name: definition.outputName,
          required: definition.config.required === true,
        })
      ),
    }))
    .sort((a, b) => a.operationId.localeCompare(b.operationId));
}

async function getInferredOperationDescriptionsByTag(): Promise<InferredOperationDescriptionsByTag> {
  if (inferredOperationDescriptionsByTagPromise) {
    return inferredOperationDescriptionsByTagPromise;
  }

  inferredOperationDescriptionsByTagPromise = (async () => {
    const openApi = new OpenApiCache();
    const loaded = await openApi.load();
    if (!loaded) {
      return new Map();
    }

    const descriptionsByTag: InferredOperationDescriptionsByTag = new Map();
    for (const endpoint of openApi.getEndpoints()) {
      const description =
        endpoint.summary?.trim() || endpoint.description?.trim() || '';
      if (!description) {
        continue;
      }

      for (const tag of endpoint.tags) {
        let descriptionsByOperation = descriptionsByTag.get(tag);
        if (!descriptionsByOperation) {
          descriptionsByOperation = new Map();
          descriptionsByTag.set(tag, descriptionsByOperation);
        }

        if (!descriptionsByOperation.has(endpoint.operationId)) {
          descriptionsByOperation.set(endpoint.operationId, description);
        }
      }
    }

    return descriptionsByTag;
  })().catch(() => new Map());

  return inferredOperationDescriptionsByTagPromise;
}

function toTagOperationRows(
  tag: ResolvedTagConfig,
  descriptionsByTag: InferredOperationDescriptionsByTag
): string[][] {
  const operations = getTagOperations(tag);
  const descriptionsByOperation =
    descriptionsByTag.get(tag.key) ??
    descriptionsByTag.get(tag.name) ??
    new Map();

  return operations.map((operation, index) => {
    const description =
      descriptionsByOperation.get(operation.operationId) ?? chalk.gray('—');
    return [index === 0 ? tag.name : '', operation.value, description];
  });
}

async function printTagsOverview(commands: InferredCommands): Promise<number> {
  const descriptionsByTag = await getInferredOperationDescriptionsByTag();
  const rows = [
    [
      chalk.bold(chalk.cyan('Tag')),
      chalk.bold(chalk.cyan('Operation')),
      chalk.bold(chalk.cyan('Description')),
    ],
    ...getConfiguredTags(commands).flatMap(tag =>
      toTagOperationRows(tag, descriptionsByTag)
    ),
  ];
  const tableOutput = table(rows, { hsep: 3 }).replace(/^/gm, '  ');

  output.print(`${chalk.bold('Inferred OpenAPI tags')}\n\n${tableOutput}\n`);
  return 0;
}

async function printTagOperationsOverview(
  tag: ResolvedTagConfig,
  columns: number
): Promise<number> {
  const operations = getTagOperations(tag);
  const descriptionsByTag = await getInferredOperationDescriptionsByTag();
  const descriptionsByOperation =
    descriptionsByTag.get(tag.key) ??
    descriptionsByTag.get(tag.name) ??
    new Map();
  const subcommands: Command[] = operations.map(operation => ({
    name: operation.value,
    aliases: operation.aliases,
    description: descriptionsByOperation.get(operation.operationId) ?? '',
    arguments: operation.arguments,
    options: [],
    examples: [],
  }));

  const command: Command = {
    name: tag.name,
    aliases: [
      tag.key,
      ...tag.aliases.filter(alias => alias !== tag.key && alias !== tag.name),
    ].filter(alias => alias !== tag.name),
    description: `Inferred OpenAPI operations for "${tag.name}"`,
    arguments: [],
    subcommands,
    options: [],
    examples: [],
  };

  output.print(renderHelp(command, { columns }));
  return 0;
}

function buildRequestPreview(
  metadata: InferredOperationMetadata | null,
  argumentDefinitions: NormalizedParamDefinition[],
  optionDefinitions: NormalizedParamDefinition[],
  providedArguments: Record<string, string>,
  providedOptions: Record<string, string | boolean>,
  context: InferredCommandContext,
  apiOverride: string | undefined
): RequestPreview {
  if (!metadata) {
    return {
      method: null,
      url: null,
      path: null,
      query: {},
      body: {},
    };
  }

  const pathValues: Record<string, string> = {};
  const queryValues: Record<string, string> = {};
  const bodyValues: Record<string, string> = {};

  const assignValue = (
    definition: NormalizedParamDefinition,
    providedValue: string | boolean | undefined
  ) => {
    const value = resolveDefinitionValue(definition, providedValue, context);

    if (value === undefined || definition.source.location === null) {
      return;
    }

    const stringValue = stringifyProvidedValue(value);
    if (definition.source.location === 'path') {
      pathValues[definition.source.name] = stringValue;
      return;
    }
    if (definition.source.location === 'query') {
      queryValues[definition.source.name] = stringValue;
      return;
    }
    if (definition.source.location === 'bodyFields') {
      bodyValues[definition.source.name] = stringValue;
    }
  };

  for (const definition of argumentDefinitions) {
    assignValue(definition, providedArguments[definition.outputName]);
  }
  for (const definition of optionDefinitions) {
    assignValue(definition, providedOptions[definition.outputName]);
  }

  const path = metadata.path.replace(/\{([^}]+)\}/g, (full, token) => {
    const replacement = pathValues[token];
    return replacement ? encodeURIComponent(replacement) : full;
  });

  const query = Object.keys(queryValues)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = queryValues[key];
      return acc;
    }, {});

  const queryString = new URLSearchParams(query).toString();
  const url = `${normalizeApiBaseUrl(apiOverride)}${path}${queryString ? `?${queryString}` : ''}`;

  return {
    method: metadata.method,
    url,
    path,
    query,
    body: bodyValues,
  };
}

function shouldPromptForMissingInputs(client: Client): boolean {
  return client.stdin.isTTY === true && !client.nonInteractive;
}

async function loadScopeAutocompleteChoices(
  client: Client
): Promise<ScopeAutocompleteChoice[]> {
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  const personalAccountChoices: ScopeAutocompleteChoice[] =
    user.version === 'northstar'
      ? []
      : [
          {
            id: user.id,
            slug: user.username,
            name: user.name || user.username,
            limited: false,
            samlEnforced: false,
          },
        ];

  const teamChoices = teams
    .sort(team => (team.id === user.defaultTeamId ? -1 : 1))
    .map<ScopeAutocompleteChoice>(team => ({
      id: team.id,
      slug: team.slug,
      name: team.name || team.slug,
      limited: team.limited === true,
      samlEnforced:
        team.saml?.connection?.state === 'active' &&
        team.saml?.enforced === true,
    }));

  return [...personalAccountChoices, ...teamChoices];
}

function getScopeHintForPrompt(
  context: InferredCommandContext,
  providedArguments: Record<string, string>,
  providedOptions: Record<string, string | boolean>
): string | null {
  const optionScope = providedOptions.scope;
  if (typeof optionScope === 'string' && optionScope.trim()) {
    return optionScope.trim();
  }

  const argumentScope = providedArguments.team;
  if (typeof argumentScope === 'string' && argumentScope.trim()) {
    return argumentScope.trim();
  }

  return context.team?.value ?? null;
}

async function loadProjectAutocompleteChoices(
  client: Client,
  scopeHint: string | null,
  accountId: string | undefined,
  limit: number
): Promise<ProjectAutocompleteChoice[]> {
  const mapProjectChoices = (
    projects: Array<{
      id: string;
      name: string;
      updatedAt?: number;
    }>
  ): ProjectAutocompleteChoice[] =>
    projects.map(project => ({
      id: project.id,
      name: project.name,
      updatedAt:
        typeof project.updatedAt === 'number' ? project.updatedAt : null,
    }));

  const dashboardQuery = new URLSearchParams({ limit: String(limit) });
  if (scopeHint && !accountId) {
    dashboardQuery.set('teamId', scopeHint);
  }

  try {
    const dashboardResponse = await client.fetch<{
      projects: Array<{
        id: string;
        name: string;
        updatedAt?: number;
      }>;
    }>(`/v2/dashboard/projects?${dashboardQuery.toString()}`, {
      accountId,
    });
    return mapProjectChoices(dashboardResponse.projects);
  } catch {
    // Fall back to the public projects endpoint if dashboard endpoint is unavailable.
  }

  const projectsQuery = new URLSearchParams({ limit: String(limit) });
  if (scopeHint && !accountId) {
    projectsQuery.set('teamId', scopeHint);
  }

  const response = await client.fetch<{
    projects: Array<{
      id: string;
      name: string;
      updatedAt?: number;
    }>;
    pagination: { next: number | null };
  }>(`/v9/projects?${projectsQuery.toString()}`, {
    accountId,
  });

  return mapProjectChoices(response.projects);
}

const PROJECT_PROMPT_PAGE_SIZE = 7;
const PROJECT_LOADING_PLACEHOLDER_COUNT = PROJECT_PROMPT_PAGE_SIZE + 1;
const PROJECT_INITIAL_LOAD_LIMIT = 10;
const PROJECT_BACKFILL_LOAD_LIMIT = 100;

function mergeProjectChoices(
  currentChoices: ProjectAutocompleteChoice[],
  incomingChoices: ProjectAutocompleteChoice[]
): ProjectAutocompleteChoice[] {
  const mergedChoices: ProjectAutocompleteChoice[] = [];
  const seen = new Set<string>();

  for (const choice of incomingChoices) {
    if (seen.has(choice.id)) {
      continue;
    }
    seen.add(choice.id);
    mergedChoices.push(choice);
  }

  for (const choice of currentChoices) {
    if (seen.has(choice.id)) {
      continue;
    }
    seen.add(choice.id);
    mergedChoices.push(choice);
  }

  return mergedChoices;
}

function buildProjectLoadingChoices(): Array<{
  label: string;
  description?: string;
}> {
  return Array.from(
    { length: PROJECT_LOADING_PLACEHOLDER_COUNT },
    (_, index) => ({
      label:
        index === 0
          ? chalk.dim('Loading recent projects...')
          : chalk.dim('...'),
      description:
        index === 0
          ? chalk.dim('Fetching recent results and full search index')
          : undefined,
    })
  );
}

type ProjectPromptRow =
  | { kind: 'loading'; label: string; description?: string }
  | { kind: 'choice'; choice: ProjectAutocompleteChoice };

type ProjectAutocompletePromptConfig = {
  messageBase: string;
  scopes: ScopeAutocompleteChoice[];
  initialScopeIndex: number;
  pageSize: number;
  placeholderCount: number;
  loadInitialChoices: (
    scope: ScopeAutocompleteChoice
  ) => Promise<ProjectAutocompleteChoice[]>;
  loadBackfillChoices: (
    scope: ScopeAutocompleteChoice
  ) => Promise<ProjectAutocompleteChoice[]>;
};

const projectAutocompletePrompt = createPrompt<
  ProjectPromptResult,
  ProjectAutocompletePromptConfig
>((config, done) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [active, setActive] = useState(0);
  const [scopeIndex, setScopeIndex] = useState(config.initialScopeIndex);
  const [allChoices, setAllChoices] = useState<ProjectAutocompleteChoice[]>([]);
  const allChoicesRef = useRef<ProjectAutocompleteChoice[]>([]);
  const [initialChoicesLoaded, setInitialChoicesLoaded] = useState(false);
  const fetchSequenceRef = useRef(0);
  const activeScope = config.scopes[scopeIndex] ?? config.scopes[0];

  const prefix = usePrefix({
    status: initialChoicesLoaded ? 'idle' : 'loading',
  });

  const filteredChoices = useMemo(
    () =>
      allChoices.filter(choice =>
        matchesProjectTerm(choice, searchTerm || undefined)
      ),
    [allChoices, searchTerm]
  );

  const rows = useMemo<ProjectPromptRow[]>(
    () =>
      initialChoicesLoaded
        ? filteredChoices.map(choice => ({ kind: 'choice', choice }))
        : buildProjectLoadingChoices()
            .slice(0, config.placeholderCount)
            .map(choice => ({ kind: 'loading', ...choice })),
    [config.placeholderCount, filteredChoices, initialChoicesLoaded]
  );

  useEffect(() => {
    if (!activeScope) {
      return () => {};
    }

    const sequence = fetchSequenceRef.current + 1;
    fetchSequenceRef.current = sequence;
    let cancelled = false;
    allChoicesRef.current = [];
    setAllChoices([]);
    setInitialChoicesLoaded(false);
    setActive(0);

    if (activeScope.limited) {
      setInitialChoicesLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    void config
      .loadInitialChoices(activeScope)
      .then(choices => {
        if (cancelled || sequence !== fetchSequenceRef.current) {
          return;
        }
        const mergedChoices = mergeProjectChoices(
          allChoicesRef.current,
          choices
        );
        allChoicesRef.current = mergedChoices;
        setAllChoices(mergedChoices);
        setInitialChoicesLoaded(true);
      })
      .catch(() => {
        if (!cancelled && sequence === fetchSequenceRef.current) {
          setInitialChoicesLoaded(true);
        }
      });

    void config
      .loadBackfillChoices(activeScope)
      .then(choices => {
        if (cancelled || sequence !== fetchSequenceRef.current) {
          return;
        }
        const mergedChoices = mergeProjectChoices(
          allChoicesRef.current,
          choices
        );
        allChoicesRef.current = mergedChoices;
        setAllChoices(mergedChoices);
      })
      .catch(() => {
        // best-effort backfill
      });

    return () => {
      cancelled = true;
    };
  }, [scopeIndex]);

  useEffect(() => {
    if (active < rows.length) {
      return;
    }
    setActive(Math.max(rows.length - 1, 0));
  }, [active, rows.length]);

  useKeypress((key, rl) => {
    if (isEnterKey(key)) {
      if (activeScope?.limited) {
        done({ kind: 'limited-scope', scope: activeScope });
        return;
      }

      const activeRow = rows[active];
      if (activeRow?.kind === 'choice') {
        done({
          kind: 'project',
          value: activeRow.choice.name,
          scopeId: activeScope.id,
          scopeSlug: activeScope.slug,
        });
        return;
      }

      const trimmed = searchTerm.trim();
      if (trimmed) {
        done({
          kind: 'project',
          value: trimmed,
          scopeId: activeScope.id,
          scopeSlug: activeScope.slug,
        });
      }
      return;
    }

    if (
      (key.name === 'left' || key.name === 'right') &&
      config.scopes.length > 1
    ) {
      const offset = key.name === 'left' ? -1 : 1;
      const nextScopeIndex =
        (scopeIndex + offset + config.scopes.length) % config.scopes.length;
      setScopeIndex(nextScopeIndex);
      setSearchTerm('');
      rl.clearLine(0);
      return;
    }

    if (!initialChoicesLoaded) {
      setSearchTerm(rl.line);
      return;
    }

    if (isUpKey(key) || isDownKey(key)) {
      rl.clearLine(0);
      if (filteredChoices.length === 0) {
        return;
      }

      const offset = isUpKey(key) ? -1 : 1;
      setActive(
        Math.min(Math.max(active + offset, 0), filteredChoices.length - 1)
      );
      return;
    }

    setSearchTerm(rl.line);
    setActive(0);
  });

  const page = usePagination({
    items: rows,
    active,
    pageSize: config.pageSize,
    loop: false,
    renderItem({ item, isActive }) {
      if (item.kind === 'loading') {
        return `${item.label} ${chalk.dim('Loading')}`;
      }

      const cursor = isActive ? '❯' : ' ';
      return `${cursor} ${item.choice.name}`;
    },
  });

  const header = [
    prefix,
    `${config.messageBase} (${activeScope?.slug ?? 'current-scope'}):`,
    chalk.cyan(searchTerm),
  ]
    .filter(Boolean)
    .join(' ')
    .trimEnd();
  const emptyMessage =
    initialChoicesLoaded && filteredChoices.length === 0 && searchTerm.trim()
      ? chalk.red('No results found')
      : undefined;
  const limitedScopeMessage = activeScope?.limited
    ? chalk.yellow(
        'Must authenticate to continue with this scope. Press Enter.'
      )
    : undefined;
  const helpLine = activeScope?.limited
    ? chalk.dim('(Use left/right to switch scope, Enter to authenticate)')
    : chalk.dim('(Use up/down to navigate, left/right to switch scope)');

  const body = [limitedScopeMessage ?? emptyMessage ?? page, helpLine]
    .filter(Boolean)
    .join('\n')
    .trimEnd();

  return [header, body];
});

function matchesProjectTerm(
  choice: ProjectAutocompleteChoice,
  term: string | undefined
): boolean {
  if (!term) {
    return true;
  }

  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) {
    return true;
  }

  return [choice.name, choice.id]
    .join(' ')
    .toLowerCase()
    .includes(normalizedTerm);
}

function formatProjectDescription(project: ProjectAutocompleteChoice): string {
  if (typeof project.updatedAt !== 'number') {
    return project.id;
  }

  return `${project.id} · ${ms(Math.max(Date.now() - project.updatedAt, 0), {
    long: true,
  })} ago`;
}

type DeploymentFilterChoice = {
  id: string;
  readyState: string | null;
  createdAt: number | null;
};

const DEPLOYMENT_FILTER_LIMIT = 100;

function sortDeploymentFilterChoices(
  left: DeploymentFilterChoice,
  right: DeploymentFilterChoice
): number {
  return (right.createdAt ?? 0) - (left.createdAt ?? 0);
}

function matchesDeploymentFilterTerm(
  choice: DeploymentFilterChoice,
  term: string | undefined
): boolean {
  if (!term) {
    return true;
  }

  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) {
    return true;
  }

  return choice.id.toLowerCase().includes(normalizedTerm);
}

function formatDeploymentFilterDescription(
  deployment: DeploymentFilterChoice
): string {
  const parts: string[] = [];
  if (typeof deployment.createdAt === 'number') {
    parts.push(
      chalk.gray(
        `${ms(Math.max(Date.now() - deployment.createdAt, 0), {
          long: true,
        })} ago`
      )
    );
  }

  if (deployment.readyState) {
    const normalizedState = deployment.readyState.toUpperCase();
    const prettyState = title(normalizedState.replace(/_/g, ' ').toLowerCase());
    if (
      normalizedState === 'BUILDING' ||
      normalizedState === 'DEPLOYING' ||
      normalizedState === 'ANALYZING' ||
      normalizedState === 'INITIALIZING'
    ) {
      parts.push(chalk.yellow(prettyState));
    } else if (normalizedState === 'READY') {
      parts.push(chalk.green(prettyState));
    } else if (normalizedState === 'ERROR') {
      parts.push(chalk.red(prettyState));
    } else if (normalizedState === 'CANCELED') {
      parts.push(chalk.gray(prettyState));
    } else if (normalizedState === 'QUEUED') {
      parts.push(chalk.white(prettyState));
    } else {
      parts.push(prettyState);
    }
  }

  return parts.join(' · ');
}

function formatDeploymentFilterLabel(
  deployment: DeploymentFilterChoice
): string {
  return deployment.id;
}

async function loadDeploymentFilterChoices(
  client: Client,
  context: InferredCommandContext,
  providedOptions: Record<string, string | boolean>,
  projectFilter: string
): Promise<DeploymentFilterChoice[]> {
  const teamScope =
    typeof providedOptions.scope === 'string' && providedOptions.scope.trim()
      ? providedOptions.scope.trim()
      : context.team?.value;

  const fetchDeployments = async (params: {
    teamId?: string;
    projectId?: string;
    app?: string;
    limit: number;
  }): Promise<DeploymentFilterChoice[]> => {
    const query = new URLSearchParams({
      limit: String(params.limit),
    });
    if (params.teamId) {
      query.set('teamId', params.teamId);
    }
    if (params.projectId) {
      query.set('projectId', params.projectId);
    }
    if (params.app) {
      query.set('app', params.app);
    }

    const response = await client.fetch<{
      deployments: Array<{
        id?: string;
        uid?: string;
        readyState?: string;
        state?: string;
        createdAt?: number;
      }>;
    }>(`/v6/deployments?${query.toString()}`);

    return response.deployments
      .map(deployment => {
        const id = deployment.id ?? deployment.uid;
        if (!id) {
          return null;
        }

        return {
          id,
          readyState:
            typeof deployment.readyState === 'string'
              ? deployment.readyState
              : typeof deployment.state === 'string'
                ? deployment.state
                : null,
          createdAt:
            typeof deployment.createdAt === 'number'
              ? deployment.createdAt
              : null,
        };
      })
      .filter((deployment): deployment is DeploymentFilterChoice =>
        Boolean(deployment)
      )
      .sort(sortDeploymentFilterChoices);
  };

  const useProjectId = projectFilter.startsWith('prj_');
  return fetchDeployments({
    teamId: teamScope,
    projectId: useProjectId ? projectFilter : undefined,
    app: useProjectId ? undefined : projectFilter,
    limit: DEPLOYMENT_FILTER_LIMIT,
  });
}

async function promptForDeploymentValue(
  client: Client,
  context: InferredCommandContext,
  providedOptions: Record<string, string | boolean>,
  projectFilter: string
): Promise<string> {
  const choicesPromise = loadDeploymentFilterChoices(
    client,
    context,
    providedOptions,
    projectFilter
  ).catch(() => []);
  const choices = await choicesPromise;
  const scopeLabel =
    typeof providedOptions.scope === 'string' && providedOptions.scope.trim()
      ? providedOptions.scope.trim()
      : context.team?.value;
  const projectLabel = projectFilter;
  const promptContext = [scopeLabel, projectLabel].filter(Boolean).join('/');

  if (choices.length === 0) {
    const manualValue = await client.input.text({
      message: 'Enter deployment id:',
      validate: value =>
        value.trim().length > 0 ? true : 'Deployment id cannot be empty.',
    });
    return manualValue.trim();
  }

  const selected = await client.input.search<string>({
    message: promptContext
      ? `Select deployment (${promptContext}):`
      : 'Select deployment:',
    pageSize: PROJECT_PROMPT_PAGE_SIZE,
    source: async term => {
      const deployments = await choicesPromise;
      return deployments
        .filter(choice => matchesDeploymentFilterTerm(choice, term))
        .slice(0, 40)
        .map(choice => ({
          name: `${formatDeploymentFilterLabel(choice)} ${formatDeploymentFilterDescription(choice)}`.trim(),
          value: choice.id,
        }));
    },
  });

  return selected.trim();
}

async function promptForProjectValue(
  client: Client,
  scopeHint: string | null,
  promptMode: ProjectPromptMode
): Promise<{ value: string; scopeSlug: string } | null> {
  let scopeChoicesPromise: Promise<ScopeAutocompleteChoice[]> | undefined;
  const getScopeChoices = async () => {
    if (!scopeChoicesPromise) {
      scopeChoicesPromise = loadScopeAutocompleteChoices(client).catch(
        () => []
      );
    }
    return scopeChoicesPromise;
  };

  const matchedScope = scopeHint
    ? (await getScopeChoices()).find(
        scopeChoice =>
          scopeChoice.id === scopeHint ||
          scopeChoice.slug === scopeHint ||
          scopeChoice.name === scopeHint
      )
    : undefined;
  const loadedScopes = await getScopeChoices();
  const availableScopes =
    loadedScopes.length > 0
      ? loadedScopes
      : [
          {
            id: matchedScope?.id ?? scopeHint ?? '',
            slug: matchedScope?.slug ?? scopeHint ?? 'current-scope',
            name: matchedScope?.name ?? scopeHint ?? 'Current Scope',
            limited: false,
            samlEnforced: false,
          },
        ];
  const initialScopeIndex = Math.max(
    availableScopes.findIndex(
      scopeChoice =>
        scopeChoice.id === (matchedScope?.id ?? scopeHint) ||
        scopeChoice.slug === (matchedScope?.slug ?? scopeHint)
    ),
    0
  );

  const loadInitialChoices = (scope: ScopeAutocompleteChoice) =>
    loadProjectAutocompleteChoices(
      client,
      scope.slug,
      scope.id || undefined,
      PROJECT_INITIAL_LOAD_LIMIT
    ).catch(() => []);
  const loadBackfillChoices = (scope: ScopeAutocompleteChoice) =>
    loadProjectAutocompleteChoices(
      client,
      scope.slug,
      scope.id || undefined,
      PROJECT_BACKFILL_LOAD_LIMIT
    ).catch(() => []);

  const fallbackInitialChoices = loadInitialChoices(
    availableScopes[initialScopeIndex]
  );
  const fallbackBackfillChoices = loadBackfillChoices(
    availableScopes[initialScopeIndex]
  );

  const fallbackLoadMergedChoices = async () =>
    mergeProjectChoices(
      await fallbackInitialChoices,
      await fallbackBackfillChoices
    );

  while (true) {
    if (promptMode === 'legacy-search') {
      const selected = await client.input.search<string>({
        message: `Select project (${availableScopes[initialScopeIndex]?.slug ?? scopeHint ?? 'current-scope'}):`,
        pageSize: PROJECT_PROMPT_PAGE_SIZE,
        source: async term => {
          const projectChoices = await fallbackLoadMergedChoices();
          const filteredChoices = projectChoices.filter(choice =>
            matchesProjectTerm(choice, term)
          );
          return filteredChoices.slice(0, 40).map(choice => ({
            name: `${choice.name}`,
            value: choice.name,
            description: formatProjectDescription(choice),
          }));
        },
      });

      const selectedValue = selected.trim();
      if (!selectedValue) {
        continue;
      }

      try {
        const project = await getProjectByIdOrName(
          client,
          selectedValue,
          availableScopes[initialScopeIndex]?.id || undefined
        );
        if (!(project instanceof ProjectNotFound)) {
          return {
            value: selectedValue,
            scopeSlug:
              availableScopes[initialScopeIndex]?.slug ??
              scopeHint ??
              'current-scope',
          };
        }
      } catch {
        return {
          value: selectedValue,
          scopeSlug:
            availableScopes[initialScopeIndex]?.slug ??
            scopeHint ??
            'current-scope',
        };
      }

      output.error(
        `Project "${selectedValue}" not found. Try another project.`
      );
      await fallbackLoadMergedChoices();
      continue;
    }

    const selected = await projectAutocompletePrompt(
      {
        messageBase: 'Select project',
        scopes: availableScopes,
        initialScopeIndex,
        pageSize: PROJECT_PROMPT_PAGE_SIZE,
        placeholderCount: PROJECT_LOADING_PLACEHOLDER_COUNT,
        loadInitialChoices,
        loadBackfillChoices,
      },
      {
        input: client.stdin,
        output: client.stderr,
      }
    );

    if (selected.kind === 'limited-scope') {
      await client.reauthenticate({
        teamId: selected.scope.id,
        scope: selected.scope.slug,
        enforced: selected.scope.samlEnforced,
      });
      return null;
    }

    const selectedValue = selected.value.trim();
    if (!selectedValue) {
      continue;
    }

    try {
      const project = await getProjectByIdOrName(
        client,
        selectedValue,
        selected.scopeId || undefined
      );
      if (!(project instanceof ProjectNotFound)) {
        return { value: selectedValue, scopeSlug: selected.scopeSlug };
      }
    } catch {
      // Fall through to manual acceptance for API failures.
      return { value: selectedValue, scopeSlug: selected.scopeSlug };
    }

    output.error(`Project "${selectedValue}" not found. Try another project.`);
  }
}

async function promptForMissingRequiredInputs(
  client: Client,
  missingInputs: MissingRequiredInput[],
  context: InferredCommandContext,
  providedArguments: Record<string, string>,
  providedOptions: Record<string, string | boolean>,
  projectPromptMode: ProjectPromptMode
): Promise<'completed' | 'restart_required'> {
  const getPriority = (input: MissingRequiredInput): number => {
    if (input.definition.config.required === 'project') {
      return 0;
    }
    return 1;
  };

  const sortedMissingInputs = [...missingInputs].sort(
    (left, right) => getPriority(left) - getPriority(right)
  );

  for (const input of sortedMissingInputs) {
    const name =
      input.surface === 'options'
        ? `--${input.definition.outputName}`
        : input.definition.outputName;
    const required = input.definition.config.required;
    let trimmedValue = '';
    if (input.definition.config.filter === 'deployments') {
      let deploymentProjectFilter =
        typeof providedOptions.projectId === 'string' &&
        providedOptions.projectId.trim()
          ? providedOptions.projectId.trim()
          : context.project?.id;

      if (!deploymentProjectFilter) {
        const promptedProject = await promptForProjectValue(
          client,
          getScopeHintForPrompt(context, providedArguments, providedOptions),
          projectPromptMode
        );
        if (promptedProject === null) {
          output.log(
            `Authentication completed. Re-run the command to continue with the selected scope.`
          );
          return 'restart_required';
        }
        deploymentProjectFilter = promptedProject.value;
        providedOptions.scope = promptedProject.scopeSlug;
        providedOptions.projectId = promptedProject.value;
      }

      trimmedValue = await promptForDeploymentValue(
        client,
        context,
        providedOptions,
        deploymentProjectFilter
      );
    } else if (required === 'project') {
      const promptedProject = await promptForProjectValue(
        client,
        getScopeHintForPrompt(context, providedArguments, providedOptions),
        projectPromptMode
      );
      if (promptedProject === null) {
        output.log(
          `Authentication completed. Re-run the command to continue with the selected scope.`
        );
        return 'restart_required';
      }
      trimmedValue = promptedProject.value;
      providedOptions.scope = promptedProject.scopeSlug;
    } else {
      const label = chalk.cyan(name);
      const value = await client.input.text({
        message: `Enter value for ${label}:`,
        validate: rawValue =>
          rawValue.trim().length > 0 ? true : `${name} cannot be empty.`,
      });
      trimmedValue = value.trim();
    }

    if (input.surface === 'arguments') {
      providedArguments[input.definition.outputName] = trimmedValue;
      continue;
    }
    providedOptions[input.definition.outputName] = trimmedValue;
  }

  return 'completed';
}

function resolveDefinitionValue(
  definition: NormalizedParamDefinition,
  providedValue: string | boolean | undefined,
  context: InferredCommandContext
): string | boolean | undefined {
  const implicitTeamValue =
    definition.source.location === 'query' &&
    definition.source.name === 'teamId'
      ? context.team?.value
      : undefined;
  return (
    providedValue ??
    (definition.config.required === 'project'
      ? context.project?.id
      : definition.config.required === 'team'
        ? context.team?.value
        : implicitTeamValue)
  );
}

function collectMissingRequiredInputs(
  argumentDefinitions: NormalizedParamDefinition[],
  optionDefinitions: NormalizedParamDefinition[],
  providedArguments: Record<string, string>,
  providedOptions: Record<string, string | boolean>,
  context: InferredCommandContext,
  metadata: InferredOperationMetadata | null
): MissingRequiredInput[] {
  const missing: MissingRequiredInput[] = [];

  const isDefinitionInMetadata = (definition: NormalizedParamDefinition) => {
    if (!metadata || !definition.source.location) {
      return true;
    }

    switch (definition.source.location) {
      case 'path':
      case 'query':
      case 'header':
      case 'cookie':
        return metadata.params[definition.source.location].some(
          param => param.name === definition.source.name
        );
      case 'bodyFields':
        return metadata.bodyFields.some(
          field => field.name === definition.source.name
        );
      default:
        return true;
    }
  };

  const checkDefinition = (
    surface: ParamSurface,
    definition: NormalizedParamDefinition,
    providedValue: string | boolean | undefined
  ) => {
    if (
      definition.config.required !== true &&
      definition.config.required !== 'project' &&
      definition.config.required !== 'team'
    ) {
      return;
    }

    if (!isDefinitionInMetadata(definition)) {
      return;
    }

    const resolvedValue = resolveDefinitionValue(
      definition,
      providedValue,
      context
    );
    if (resolvedValue !== undefined) {
      return;
    }

    const outputName = definition.outputName;
    if (definition.config.required === true) {
      missing.push({
        surface,
        definition,
        reason: 'Required input is missing.',
        hint:
          surface === 'options'
            ? `Provide --${outputName} <value>.`
            : `Provide ${outputName} as a positional argument.`,
      });
      return;
    }

    if (definition.config.required === 'project') {
      missing.push({
        surface,
        definition,
        reason: 'Could not infer a project from the current context.',
        hint:
          surface === 'options'
            ? `Provide --${outputName} <value> or run from a linked project directory.`
            : `Provide ${outputName} explicitly or run from a linked project directory.`,
      });
      return;
    }

    missing.push({
      surface,
      definition,
      reason: 'Could not infer a team/scope from the current context.',
      hint:
        surface === 'options'
          ? outputName === 'scope'
            ? 'Provide --scope <team>.'
            : `Provide --${outputName} <value> or pass --scope <team>.`
          : `Provide ${outputName} explicitly or pass --scope <team>.`,
    });
  };

  for (const definition of argumentDefinitions) {
    checkDefinition(
      'arguments',
      definition,
      providedArguments[definition.outputName]
    );
  }
  for (const definition of optionDefinitions) {
    checkDefinition(
      'options',
      definition,
      providedOptions[definition.outputName]
    );
  }

  return missing;
}

function printMissingRequiredInputs(
  missingInputs: MissingRequiredInput[]
): void {
  const rows: Array<[string, string]> = missingInputs.map(input => [
    input.surface === 'options'
      ? `--${input.definition.outputName}`
      : input.definition.outputName,
    `${getRequiredHint(input.definition.config.required)} ${input.reason} ${input.hint}`,
  ]);

  output.error('Missing required inputs for inferred command.');
  output.print(
    `${chalk.bold.cyan('Missing inputs')}\n${renderSectionRows(rows)}\n`
  );
}

function getRequiredHint(
  required: InferredCommandParamConfig['required']
): string {
  if (required === true) {
    return 'Required';
  }
  if (required === 'project') {
    return 'Required if project context is missing';
  }
  if (required === 'team') {
    return 'Required if team context is missing';
  }
  return 'Optional';
}

function getArgumentInferenceHint(
  required: InferredCommandParamConfig['required']
): string | null {
  if (required === 'project') {
    return 'Inferred from the current project context when available.';
  }
  if (required === 'team') {
    return 'Inferred from the current scope/team context when available.';
  }
  return null;
}

function getArgumentHelpDescription(
  required: InferredCommandParamConfig['required']
): string {
  const base = getRequiredHint(required);
  const inferenceHint = getArgumentInferenceHint(required);
  return inferenceHint ? `${base}. ${inferenceHint}` : base;
}

function toHelpOption(
  name: string,
  config: InferredCommandParamConfig
): CommandOption {
  const descriptionParts = [getRequiredHint(config.required)];

  return {
    name,
    shorthand: null,
    type: String,
    deprecated: false,
    description: descriptionParts.join(' '),
  };
}

function buildHelpOptions(
  normalizedOptions: Record<string, InferredCommandParamConfig>
): CommandOption[] {
  return Object.entries(normalizedOptions).map(([name, config]) =>
    toHelpOption(name, config)
  );
}

function printInferredCommandHelp(
  resolved: ResolvedInferredCommand,
  cliArgs: string[],
  metadata: InferredOperationMetadata | null,
  columns: number
): number {
  const commandName =
    cliArgs[1] ?? getCommandValue(resolved.operationId, resolved.config);
  const normalizedArguments =
    normalizeParamConfigs(resolved.config.arguments, 'arguments') ?? {};
  const normalizedOptions =
    normalizeParamConfigs(resolved.config.options, 'options') ?? {};
  const aliases = Array.from(
    new Set(
      [
        resolved.operationId,
        resolved.config.value,
        ...(resolved.config.aliases ?? []),
      ].filter(Boolean)
    )
  ).filter(name => name !== commandName) as string[];

  const command: Command = {
    name: commandName,
    aliases,
    description:
      metadata?.summary ||
      metadata?.description ||
      `Inferred OpenAPI command for operation "${resolved.operationId}".`,
    arguments: Object.entries(normalizedArguments).map(([name, config]) => ({
      name,
      required: config.required === true,
      description: getArgumentHelpDescription(config.required),
    })),
    options: buildHelpOptions(normalizedOptions),
    examples: resolved.config.examples ?? [],
  };

  const parent: Command = {
    name: resolved.tagName,
    aliases: resolved.tagAliases.filter(alias => alias !== resolved.tagName),
    description: `OpenAPI tag "${resolved.tagName}"`,
    arguments: [],
    options: [],
    examples: [],
  };

  output.print(
    renderHelp(command, {
      parent,
      columns,
    })
  );
  return 0;
}

export function resolveInferredCommand(
  commands: InferredCommands,
  cliArgs: string[]
): ResolvedInferredCommand | null {
  const [tagToken, operationToken] = cliArgs;
  if (!tagToken || !operationToken) {
    return null;
  }

  const tag = resolveTagConfig(commands, tagToken);
  if (!tag) {
    return null;
  }

  const directMatch = tag.operations[operationToken];
  if (directMatch) {
    return {
      tag: tag.key,
      tagName: tag.name,
      tagAliases: [tag.key, ...tag.aliases].filter(alias => alias !== tag.name),
      operationId: operationToken,
      config: directMatch,
    };
  }

  for (const [operationId, config] of Object.entries(tag.operations)) {
    if (!config) {
      continue;
    }

    const operationValue = getCommandValue(operationId, config);
    const operationAliases = getCommandAliases(operationId, config);
    if (
      operationValue === operationToken ||
      operationAliases.includes(operationToken)
    ) {
      return {
        tag: tag.key,
        tagName: tag.name,
        tagAliases: [tag.key, ...tag.aliases].filter(
          alias => alias !== tag.name
        ),
        operationId,
        config,
      };
    }
  }

  return null;
}

function serializeParameter(param: Parameter): InferredOperationParamMetadata {
  return {
    name: param.name,
    required: Boolean(param.required),
    type: param.schema?.type ?? null,
    description: param.description ?? null,
  };
}

function serializeBodyField(
  field: BodyField
): InferredOperationBodyFieldMetadata {
  return {
    name: field.name,
    required: field.required,
    type: field.type ?? null,
    description: field.description ?? null,
  };
}

async function getInferredOperationMetadata(
  tag: string,
  operationId: string
): Promise<InferredOperationMetadata | null> {
  const openApi = new OpenApiCache();
  const loaded = await openApi.load();
  if (!loaded) {
    return null;
  }

  const endpoints = openApi.getEndpoints();
  const resolved = resolveEndpointByTagAndOperationId(
    endpoints,
    tag,
    operationId
  );
  if (!resolved.ok) {
    return null;
  }

  const endpoint = resolved.endpoint;
  const params = {
    path: endpoint.parameters
      .filter(param => param.in === 'path')
      .map(serializeParameter),
    query: endpoint.parameters
      .filter(param => param.in === 'query')
      .map(serializeParameter),
    header: endpoint.parameters
      .filter(param => param.in === 'header')
      .map(serializeParameter),
    cookie: endpoint.parameters
      .filter(param => param.in === 'cookie')
      .map(serializeParameter),
  };

  return {
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary || null,
    description: endpoint.description || null,
    params,
    bodyFields: openApi.getBodyFields(endpoint).map(serializeBodyField),
  };
}

/**
 * Return an exit code when a DSL-inferred command is handled.
 * Returns `null` when command routing should continue as normal.
 */
export async function runInferredCommand(
  commands: InferredCommands,
  cliArgs: string[],
  options: RunInferredCommandOptions = {}
): Promise<number | null> {
  const helpRequested =
    options.help === true ||
    cliArgs.includes('-h') ||
    cliArgs.includes('--help');
  const commandArgs = stripHelpTokens(cliArgs);
  const [tagToken, operationToken] = commandArgs;

  if (options.execute === false && !helpRequested) {
    return null;
  }

  if (!tagToken) {
    if (helpRequested) {
      return await printTagsOverview(commands);
    }
    return null;
  }

  const resolvedTag = resolveTagConfig(commands, tagToken);
  const operationsForTag = resolvedTag ? getTagOperations(resolvedTag) : [];
  if (!operationToken) {
    if (resolvedTag && operationsForTag.length > 0) {
      return await printTagOperationsOverview(
        resolvedTag,
        options.columns ?? 80
      );
    }
    if (helpRequested) {
      return await printTagsOverview(commands);
    }
    return null;
  }

  const resolved = resolveInferredCommand(commands, commandArgs);
  if (!resolved) {
    if (helpRequested && resolvedTag && operationsForTag.length > 0) {
      return await printTagOperationsOverview(
        resolvedTag,
        options.columns ?? 80
      );
    }
    return null;
  }

  const metadata = await getInferredOperationMetadata(
    resolved.tag,
    resolved.operationId
  );

  if (helpRequested) {
    return printInferredCommandHelp(
      resolved,
      commandArgs,
      metadata,
      options.columns ?? 80
    );
  }

  const argumentDefinitions = normalizeParamDefinitions(
    resolved.config.arguments,
    'arguments'
  );
  const optionDefinitions = normalizeParamDefinitions(
    resolved.config.options,
    'options'
  );
  const knownOptionNames = new Set(
    optionDefinitions.map(def => def.outputName)
  );
  const parsedInput = parseProvidedCliInput(commandArgs.slice(2));
  const parsedOptions = {
    ...parsedInput.options,
  };
  if (options.scope) {
    parsedOptions.scope = options.scope;
  }
  if (options.team && !options.scope) {
    parsedOptions.scope = options.team;
  }
  if (options.cwd) {
    parsedOptions.cwd = options.cwd;
  }
  if (options.api) {
    parsedOptions.api = options.api;
  }
  if (options.dryRun === true) {
    parsedOptions['dry-run'] = true;
  }

  const providedArguments = argumentDefinitions.reduce<Record<string, string>>(
    (acc, definition, index) => {
      const value = parsedInput.positionals[index];
      if (value !== undefined) {
        acc[definition.outputName] = value;
      }
      return acc;
    },
    {}
  );

  const providedOptions = optionDefinitions.reduce<
    Record<string, string | boolean>
  >((acc, definition) => {
    const value = parsedOptions[definition.outputName];
    if (value !== undefined) {
      acc[definition.outputName] = value;
    }
    return acc;
  }, {});

  const extraOptions = Object.entries(parsedOptions).reduce<
    Record<string, string | boolean>
  >((acc, [name, value]) => {
    if (!knownOptionNames.has(name) && name !== 'dry-run') {
      acc[name] = value;
    }
    return acc;
  }, {});

  let context = await resolveInferredContext(
    typeof parsedOptions.cwd === 'string' ? parsedOptions.cwd : undefined,
    typeof parsedOptions.scope === 'string' ? parsedOptions.scope : undefined,
    typeof parsedOptions.team === 'string' ? parsedOptions.team : undefined,
    options.client
  );

  if (options.client) {
    let missingRequiredInputs = collectMissingRequiredInputs(
      argumentDefinitions,
      optionDefinitions,
      providedArguments,
      providedOptions,
      context,
      metadata
    );

    if (
      missingRequiredInputs.length > 0 &&
      shouldPromptForMissingInputs(options.client)
    ) {
      const promptResult = await promptForMissingRequiredInputs(
        options.client,
        missingRequiredInputs,
        context,
        providedArguments,
        providedOptions,
        options.projectPromptMode ?? 'reactive-core'
      );
      if (promptResult === 'restart_required') {
        return 1;
      }
      for (const definition of optionDefinitions) {
        const value = providedOptions[definition.outputName];
        if (value !== undefined) {
          parsedOptions[definition.outputName] = value;
        }
      }
      if (typeof providedOptions.scope === 'string') {
        parsedOptions.scope = providedOptions.scope;
      }
      context = await resolveInferredContext(
        typeof parsedOptions.cwd === 'string' ? parsedOptions.cwd : undefined,
        typeof parsedOptions.scope === 'string'
          ? parsedOptions.scope
          : undefined,
        typeof parsedOptions.team === 'string' ? parsedOptions.team : undefined,
        options.client
      );
      missingRequiredInputs = collectMissingRequiredInputs(
        argumentDefinitions,
        optionDefinitions,
        providedArguments,
        providedOptions,
        context,
        metadata
      );
    }

    if (missingRequiredInputs.length > 0) {
      printMissingRequiredInputs(missingRequiredInputs);
      return 1;
    }
  }

  const request = buildRequestPreview(
    metadata,
    argumentDefinitions,
    optionDefinitions,
    providedArguments,
    providedOptions,
    context,
    typeof parsedOptions.api === 'string' ? parsedOptions.api : undefined
  );

  const dryRunFlag = parsedOptions['dry-run'];
  const isDryRun =
    options.dryRun === true ||
    dryRunFlag === true ||
    dryRunFlag === 'true' ||
    dryRunFlag === '';

  if (isDryRun) {
    printDryRunPreview({
      tag: resolved.tag,
      operationId: resolved.operationId,
      matchedValue:
        resolved.operationId === commandArgs[1]
          ? null
          : (commandArgs[1] ?? null),
      context,
      provided: {
        arguments: providedArguments,
        options: providedOptions,
        extraArguments: parsedInput.positionals.slice(
          argumentDefinitions.length
        ),
        extraOptions,
      },
      request,
    });
    return 0;
  }

  if (options.client) {
    return executeInferredRequest(
      options.client,
      request,
      parsedOptions,
      resolved.config.display,
      context
    );
  }

  output.print(
    JSON.stringify(
      {
        tag: resolved.tag,
        operationId: resolved.operationId,
        value: getCommandValue(resolved.operationId, resolved.config),
        matchedValue:
          resolved.operationId === commandArgs[1]
            ? null
            : (commandArgs[1] ?? null),
        context,
        provided: {
          arguments: providedArguments,
          options: providedOptions,
          extraArguments: parsedInput.positionals.slice(
            argumentDefinitions.length
          ),
          extraOptions,
        },
        request,
      },
      null,
      2
    )
  );
  return 0;
}
