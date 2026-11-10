/** JSON types kept local so Connect does not require an AI SDK dependency. */
export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonObject
  | readonly JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };
