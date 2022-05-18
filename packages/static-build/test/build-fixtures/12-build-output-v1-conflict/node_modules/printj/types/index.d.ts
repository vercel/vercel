/* index.d.ts (C) 2015-present SheetJS */
// TypeScript Version: 2.2

/** Version string */
export const version: string;

/** Generate formatted string from format and subsequent arguments */
export function sprintf(fmt: string, ...args: any[]): string;

/** Generate formatted string from format and array of variables */
export function vsprintf(fmt: string, args: any[]): string;
