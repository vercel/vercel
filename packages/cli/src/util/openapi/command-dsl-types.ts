import type {
  OpenApiCommandTag,
  OpenApiDisplayPropertiesByTagOperationStatus,
  OpenApiDisplayResponseShapeByTagOperationStatusProperty,
  OpenApiInputNamesByTagOperation,
  OpenApiOperationIdsByTag,
  OpenApiResponseStatusCodesByTagOperation,
} from './generated-command-dsl-types';

type OptionalRecord<K extends PropertyKey, V> = {
  [P in K]?: V;
};

export const DISPLAY_PATH_SYMBOL = Symbol('inferredDisplayPath');
export const DISPLAY_SCALAR_SYMBOL = Symbol('inferredDisplayScalar');

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

export interface DisplayDateValue {
  value: DisplayNestableValue;
  format: 'date';
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
  | DisplayDateValue
  | DisplayDurationValue
  | DisplayCapitalizeValue
  | DisplayScopeValue
  | DisplayIconValue
  | DisplayJoinValue
  | DisplayColorValue
  | DisplaySwitchValue
  | DisplayLinkValue
  | DisplayConditionalValue;

export type DisplayLiteralValue = string | number | boolean;
export type DisplayIconName =
  | 'circle-fill'
  | 'warning'
  | 'info'
  | 'error'
  | 'check';

export type DisplayInlineValue =
  | DisplayScalarToken
  | DisplayFormattedValue
  | DisplayLiteralValue;
export type DisplayInlineValueList = readonly DisplayInlineValue[];
export type DisplayNestableValue =
  | DisplayScalarToken
  | DisplayFormattedValue
  | DisplayLiteralValue
  | null
  | undefined;
export type DisplayNumberInput = DisplayNestableValue;

export type DisplaySwitchCaseValue =
  | DisplayInlineValue
  | DisplayInlineValueList;

export type DisplaySwitchCasesInput = {
  DEFAULT: DisplaySwitchCaseValue;
} & Record<string, DisplaySwitchCaseValue>;

export type DisplayColorInput = DisplayNestableValue;

export interface DisplayFieldRecord {
  [key: string]: DisplayFieldValue;
}

export type DisplayFieldValue =
  | DisplayInlineValue
  | DisplayInlineValueList
  | DisplayFieldRecord;

export type DisplayUnknownAccessor = DisplayScalarToken & {
  readonly [key: string]: DisplayUnknownAccessor;
  readonly [index: number]: DisplayUnknownAccessor;
};

export type DisplayTypeAccessor<T> = unknown extends T
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

export type DisplayPathTemplate = {
  type: 'path';
  path: readonly string[];
};

export type DisplayRelativeTimeTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'relativeTime';
};

export type DisplayDateTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'date';
};

export type DisplayDurationTemplate = {
  type: 'format';
  end: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  start: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'duration';
};

export type DisplayCapitalizeTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'capitalize';
};

export type DisplayScopeTemplate = {
  type: 'format';
  format: 'scope';
};

export type DisplayIconTemplate = {
  type: 'format';
  format: 'icon';
  name: DisplayIconName;
};

export type DisplayJoinTemplate = {
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

export type DisplayColorTemplate = {
  type: 'format';
  value: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'color';
  color: DisplayColorName;
};

export type DisplaySwitchTemplate = {
  type: 'format';
  value: DisplayPathTemplate;
  format: 'switch';
  cases: Record<string, DisplayTemplateValue>;
  defaultCase: DisplayTemplateValue;
};

export type DisplayLinkTemplate = {
  type: 'format';
  url: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
  format: 'link';
  text?: DisplayPathTemplate | DisplayFormatTemplate | DisplayLiteralTemplate;
};

export type DisplayConditionalTemplate = {
  type: 'format';
  format: 'conditional';
  values: readonly (
    | DisplayPathTemplate
    | DisplayFormatTemplate
    | DisplayLiteralTemplate
    | DisplayTemplateValue[]
  )[];
};

export type DisplayLiteralTemplate = {
  type: 'literal';
  value: DisplayLiteralValue | null;
};

export type DisplayFormatTemplate =
  | DisplayRelativeTimeTemplate
  | DisplayDateTemplate
  | DisplayDurationTemplate
  | DisplayCapitalizeTemplate
  | DisplayScopeTemplate
  | DisplayIconTemplate
  | DisplayJoinTemplate
  | DisplayColorTemplate
  | DisplaySwitchTemplate
  | DisplayLinkTemplate
  | DisplayConditionalTemplate;

export type DisplayTemplateValue =
  | DisplayPathTemplate
  | DisplayLiteralTemplate
  | DisplayFormatTemplate
  | { [key: string]: DisplayTemplateValue }
  | DisplayTemplateValue[];

export interface InferredCommandConfig {
  value?: string;
  aliases?: string[];
  arguments?: Record<string, InferredCommandArgumentConfig | undefined>;
  options?: Record<string, InferredCommandOptionConfig | undefined>;
  examples?: InferredCommandExample[];
  display?: InferredCommandResponseDisplayByStatus;
}

export type HttpStatusCode = `${1 | 2 | 3 | 4 | 5}${number}${number}`;

export type InferredCommandSuccessResponseDisplayConfig<
  DisplayProperty extends string | undefined = string | undefined,
  DisplayAccessor = DisplayUnknownAccessor,
> = {
  displayProperty?: DisplayProperty;
  fields: InferredCommandDisplayFieldsSelector<DisplayAccessor>;
  table?: boolean;
  pagination?: boolean | { nextPath?: string };
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

export interface InferredCommandParamConfigBase {
  value?: string;
  filter?: InferredCommandParamFilter;
  inferFrom?: 'project' | 'team';
  defaultValue?: string | boolean;
  omitWhenOption?: string;
}

export interface InferredCommandArgumentConfig
  extends InferredCommandParamConfigBase {
  required?: boolean;
}

export interface InferredCommandOptionConfig
  extends InferredCommandParamConfigBase {
  required?: never;
}

export type InferredCommandParamConfig =
  | InferredCommandArgumentConfig
  | InferredCommandOptionConfig;

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
    InferredCommandArgumentConfig
  > &
    Record<string, InferredCommandArgumentConfig | undefined>;
  options?: OptionalRecord<
    InferredInputNamesForOperation<Tag, OperationId>,
    InferredCommandOptionConfig
  > &
    Record<string, InferredCommandOptionConfig | undefined>;
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
