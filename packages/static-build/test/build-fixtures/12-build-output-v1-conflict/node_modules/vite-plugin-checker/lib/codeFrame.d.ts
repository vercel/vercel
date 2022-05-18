import ts from 'typescript';
import { SourceLocation } from '@babel/code-frame';

declare function createFrame({ source, location, }: {
    source: string;
    location: SourceLocation;
}): string;
declare function tsLocationToBabelLocation(tsLoc: Record<'start' | 'end', ts.LineAndCharacter /** 0-based */>): SourceLocation;

export { createFrame, tsLocationToBabelLocation };
