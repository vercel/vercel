declare const process:
  | { readonly env?: Readonly<Record<string, string | undefined>> }
  | undefined;

export function readNonEmptyEnv(name: string): string | undefined {
  const value =
    typeof process === 'undefined' ? undefined : process.env?.[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}
