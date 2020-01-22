import { parse as parsePath } from 'path';
import { Route, Source } from '@now/routing-utils';
import { Builder } from './types';
import { getIgnoreApiFilter, sortFiles } from './detect-builders';

function escapeName(name: string) {
  const special = '[]^$.|?*+()'.split('');

  for (const char of special) {
    name = name.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }

  return name;
}

function joinPath(...segments: string[]) {
  const joinedPath = segments.join('/');
  return joinedPath.replace(/\/{2,}/g, '/');
}

function concatArrayOfText(texts: string[]): string {
  if (texts.length <= 2) {
    return texts.join(' and ');
  }

  const last = texts.pop();
  return `${texts.join(', ')}, and ${last}`;
}

// Takes a filename or foldername, strips the extension
// gets the part between the "[]" brackets.
// It will return `null` if there are no brackets
// and therefore no segment.
function getSegmentName(segment: string): string | null {
  const { name } = parsePath(segment);

  if (name.startsWith('[') && name.endsWith(']')) {
    return name.slice(1, -1);
  }

  return null;
}

function createRouteFromPath(
  filePath: string,
  featHandleMiss: boolean,
  cleanUrls: boolean
): { route: Source; isDynamic: boolean } {
  const parts = filePath.split('/');

  let counter = 1;
  const query: string[] = [];
  let isDynamic = false;

  const srcParts = parts.map((segment, i): string => {
    const name = getSegmentName(segment);
    const isLast = i === parts.length - 1;

    if (name !== null) {
      // We can't use `URLSearchParams` because `$` would get escaped
      query.push(`${name}=$${counter++}`);
      isDynamic = true;
      return `([^/]+)`;
    } else if (isLast) {
      const { name: fileName, ext } = parsePath(segment);
      const isIndex = fileName === 'index';
      const prefix = isIndex ? '\\/' : '';

      const names = [
        isIndex ? prefix : `${fileName}\\/`,
        prefix + escapeName(fileName),
        featHandleMiss && cleanUrls
          ? ''
          : prefix + escapeName(fileName) + escapeName(ext),
      ].filter(Boolean);

      // Either filename with extension, filename without extension
      // or nothing when the filename is `index`.
      // When `cleanUrls: true` then do *not* add the filename with extension.
      return `(${names.join('|')})${isIndex ? '?' : ''}`;
    }

    return segment;
  });

  const { name: fileName, ext } = parsePath(filePath);
  const isIndex = fileName === 'index';
  const queryString = `${query.length ? '?' : ''}${query.join('&')}`;

  const src = isIndex
    ? `^/${srcParts.slice(0, -1).join('/')}${srcParts.slice(-1)[0]}$`
    : `^/${srcParts.join('/')}$`;

  let route: Source;
  if (featHandleMiss) {
    const extensionless = ext ? filePath.slice(0, -ext.length) : filePath;
    route = {
      src,
      dest: `/${extensionless}${queryString}`,
      check: true,
    };
  } else {
    route = {
      src,
      dest: `/${filePath}${queryString}`,
    };
  }
  return { route, isDynamic };
}

// Check if the path partially matches and has the same
// name for the path segment at the same position
function partiallyMatches(pathA: string, pathB: string): boolean {
  const partsA = pathA.split('/');
  const partsB = pathB.split('/');

  const long = partsA.length > partsB.length ? partsA : partsB;
  const short = long === partsA ? partsB : partsA;

  let index = 0;

  for (const segmentShort of short) {
    const segmentLong = long[index];

    const nameLong = getSegmentName(segmentLong);
    const nameShort = getSegmentName(segmentShort);

    // If there are no segments or the paths differ we
    // return as they are not matching
    if (segmentShort !== segmentLong && (!nameLong || !nameShort)) {
      return false;
    }

    if (nameLong !== nameShort) {
      return true;
    }

    index += 1;
  }

  return false;
}

// Counts how often a path occurs when all placeholders
// got resolved, so we can check if they have conflicts
function pathOccurrences(filePath: string, files: string[]): string[] {
  const getAbsolutePath = (unresolvedPath: string): string => {
    const { dir, name } = parsePath(unresolvedPath);
    const parts = joinPath(dir, name).split('/');
    return parts.map(part => part.replace(/\[.*\]/, '1')).join('/');
  };

  const currentAbsolutePath = getAbsolutePath(filePath);

  return files.reduce((prev: string[], file: string): string[] => {
    const absolutePath = getAbsolutePath(file);

    if (absolutePath === currentAbsolutePath) {
      prev.push(file);
    } else if (partiallyMatches(filePath, file)) {
      prev.push(file);
    }

    return prev;
  }, []);
}

// Checks if a placeholder with the same name is used
// multiple times inside the same path
function getConflictingSegment(filePath: string): string | null {
  const segments = new Set<string>();

  for (const segment of filePath.split('/')) {
    const name = getSegmentName(segment);

    if (name !== null && segments.has(name)) {
      return name;
    }

    if (name) {
      segments.add(name);
    }
  }

  return null;
}

function sortFilesBySegmentCount(fileA: string, fileB: string): number {
  const lengthA = fileA.split('/').length;
  const lengthB = fileB.split('/').length;

  if (lengthA > lengthB) {
    return -1;
  }

  if (lengthA < lengthB) {
    return 1;
  }

  // Paths that have the same segment length but
  // less placeholders are preferred
  const countSegments = (prev: number, segment: string) =>
    getSegmentName(segment) ? prev + 1 : 0;
  const segmentLengthA = fileA.split('/').reduce(countSegments, 0);
  const segmentLengthB = fileB.split('/').reduce(countSegments, 0);

  if (segmentLengthA > segmentLengthB) {
    return 1;
  }

  if (segmentLengthA < segmentLengthB) {
    return -1;
  }

  return 0;
}

interface ApiRoutesResult {
  defaultRoutes: Source[] | null;
  dynamicRoutes: Source[] | null;
  error: { [key: string]: string } | null;
}

interface RoutesResult {
  defaultRoutes: Route[] | null;
  redirectRoutes: Route[] | null;
  error: { [key: string]: string } | null;
}

async function detectApiRoutes(
  files: string[],
  builders: Builder[],
  featHandleMiss: boolean,
  cleanUrls: boolean
): Promise<ApiRoutesResult> {
  if (!files || files.length === 0) {
    return {
      defaultRoutes: null,
      dynamicRoutes: null,
      error: null,
    };
  }

  // The deepest routes need to be
  // the first ones to get handled
  const sortedFiles = files
    .filter(getIgnoreApiFilter(builders))
    .sort(sortFiles)
    .sort(sortFilesBySegmentCount);

  const defaultRoutes: Source[] = [];
  const dynamicRoutes: Source[] = [];

  for (const file of sortedFiles) {
    // We only consider every file in the api directory
    // as we will strip extensions as well as resolving "[segments]"
    if (
      !file.startsWith('api/') &&
      !builders.some(b => b.src === file && b.config && b.config.functions)
    ) {
      continue;
    }

    const conflictingSegment = getConflictingSegment(file);

    if (conflictingSegment) {
      return {
        defaultRoutes: null,
        dynamicRoutes: null,
        error: {
          code: 'conflicting_path_segment',
          message:
            `The segment "${conflictingSegment}" occurs more than ` +
            `one time in your path "${file}". Please make sure that ` +
            `every segment in a path is unique`,
        },
      };
    }

    const occurrences = pathOccurrences(file, sortedFiles).filter(
      name => name !== file
    );

    if (occurrences.length > 0) {
      const messagePaths = concatArrayOfText(
        occurrences.map(name => `"${name}"`)
      );

      return {
        defaultRoutes: null,
        dynamicRoutes: null,
        error: {
          code: 'conflicting_file_path',
          message:
            `Two or more files have conflicting paths or names. ` +
            `Please make sure path segments and filenames, without their extension, are unique. ` +
            `The path "${file}" has conflicts with ${messagePaths}`,
        },
      };
    }

    const out = createRouteFromPath(file, featHandleMiss, cleanUrls);
    if (out.isDynamic) {
      dynamicRoutes.push(out.route);
    }
    defaultRoutes.push(out.route);
  }

  return { defaultRoutes, dynamicRoutes, error: null };
}

function getPublicBuilder(builders: Builder[]): Builder | null {
  const builder = builders.find(
    builder =>
      builder.use === '@now/static' &&
      /^.*\/\*\*\/\*$/.test(builder.src) &&
      builder.config &&
      builder.config.zeroConfig === true
  );

  return builder || null;
}

export function detectOutputDirectory(builders: Builder[]): string | null {
  // TODO: We eventually want to save the output directory to
  // builder.config.outputDirectory so it is only detected once
  const publicBuilder = getPublicBuilder(builders);
  return publicBuilder ? publicBuilder.src.replace('/**/*', '') : null;
}

export function detectApiDirectory(builders: Builder[]): string | null {
  // TODO: We eventually want to save the api directory to
  // builder.config.apiDirectory so it is only detected once
  const isZeroConfig = builders.some(b => b.config && b.config.zeroConfig);
  return isZeroConfig ? 'api' : null;
}

export async function detectRoutes(
  files: string[],
  builders: Builder[],
  featHandleMiss = false,
  cleanUrls = false,
  trailingSlash?: boolean
): Promise<RoutesResult> {
  const result = await detectApiRoutes(
    files,
    builders,
    featHandleMiss,
    cleanUrls
  );
  const { dynamicRoutes, defaultRoutes: allRoutes, error } = result;
  if (error) {
    return { defaultRoutes: null, redirectRoutes: null, error };
  }
  const directory = detectOutputDirectory(builders);
  const defaultRoutes: Route[] = [];
  const redirectRoutes: Route[] = [];
  if (allRoutes && allRoutes.length > 0) {
    const hasApiRoutes = allRoutes.some(
      r => r.dest && r.dest.startsWith('/api/')
    );
    if (featHandleMiss) {
      defaultRoutes.push({ handle: 'miss' });
      const extSet = new Set(
        builders
          .filter(b => b.src && b.src.startsWith('api/'))
          .map(b => parsePath(b.src).ext)
          .filter(Boolean)
      );
      if (extSet.size > 0) {
        const exts = Array.from(extSet)
          .map(ext => ext.slice(1))
          .join('|');
        const extGroup = `(?:\\.(?:${exts}))`;
        if (cleanUrls) {
          redirectRoutes.push({
            src: `^/(api(?:.+)?)/index${extGroup}?/?$`,
            headers: { Location: trailingSlash ? '/$1/' : '/$1' },
            status: 308,
          });
          redirectRoutes.push({
            src: `^/api/(.+)${extGroup}/?$`,
            headers: { Location: trailingSlash ? '/api/$1/' : '/api/$1' },
            status: 308,
          });
        } else {
          defaultRoutes.push({
            src: `^/api/(.+)${extGroup}$`,
            dest: '/api/$1',
            check: true,
          });
        }
      }
      if (dynamicRoutes) {
        defaultRoutes.push(...dynamicRoutes);
      }
      if (hasApiRoutes) {
        defaultRoutes.push({
          src: '^/api(/.*)?$',
          status: 404,
          continue: true,
        });
      }
    } else {
      defaultRoutes.push(...allRoutes);
      if (hasApiRoutes) {
        defaultRoutes.push({
          status: 404,
          src: '^/api(/.*)?$',
        });
      }
    }
  }

  if (!featHandleMiss && directory) {
    defaultRoutes.push({
      src: '/(.*)',
      dest: `/${directory}/$1`,
    });
  }

  return { defaultRoutes, redirectRoutes, error };
}
