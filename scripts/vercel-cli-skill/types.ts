export type OptionTypeJson = 'string' | 'boolean' | 'number' | string[];

export interface GeneratedArgument {
  name: string;
  required: boolean;
  multiple: boolean;
}

export interface GeneratedOption {
  name: string;
  shorthand: string | null;
  argument: string | null;
  type: OptionTypeJson;
  description: string;
  deprecated: boolean;
  /** True when help omits the option because it has no description. */
  undocumented: boolean;
}

export interface GeneratedCommand {
  path: string[];
  canonicalPath: string;
  name: string;
  aliases: string[];
  description: string;
  hidden: boolean;
  default: boolean;
  arguments: GeneratedArgument[];
  options: GeneratedOption[];
  /** Global option names this command rejects (mirrors help output). */
  disabledGlobalOptions: string[];
  subcommands: string[];
}

export interface GeneratedManifest {
  commands: GeneratedCommand[];
  globalOptions: GeneratedOption[];
}

export interface ValidationExceptionEntry {
  path: string;
  reason: string;
}

export interface ValidationExceptions {
  invalidExamples: ValidationExceptionEntry[];
  delegatedFamilies: ValidationExceptionEntry[];
}
