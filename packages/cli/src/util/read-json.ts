import { CantParseJSON } from './errors-ts';

export default function readJSON<T>(
  jsonRaw: string
): T | undefined | CantParseJSON {
  if (!jsonRaw) {
    return;
  }

  try {
    return JSON.parse(jsonRaw);
  } catch (error: any) {
    return new CantParseJSON(error.message, jsonRaw);
  }
}
