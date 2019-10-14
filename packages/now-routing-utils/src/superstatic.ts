/**
 * This converts Superstatic configuration to Now.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */

import { Route } from './index';

export interface SuperstaticRewrite {
  source: string;
  destination: string;
}

export interface SuperstaticRedirect {
  source: string;
  destination: string;
  type?: number;
}

export interface SuperstaticHeader {
  source: string;
  headers: SuperstaticHeaderKeyValue[];
}

export interface SuperstaticHeaderKeyValue {
  key: string;
  value: string;
}

export function convertCleanUrls(filePaths: string[]): Route[] {
  const htmlFiles = filePaths
    .filter(f => f.endsWith('.html'))
    .map(f => ({
      html: f,
      clean: f.slice(0, -5),
    }));

  const redirects: Route[] = htmlFiles.map(o => ({
    src: o.html,
    headers: { Location: o.clean },
    status: 301,
    continue: true,
  }));

  const rewrites: Route[] = htmlFiles.map(o => ({
    src: o.clean,
    dest: o.html,
    continue: true,
  }));

  return redirects.concat(rewrites);
}

export function convertRedirects(redirects: SuperstaticRedirect[]): Route[] {
  return redirects.map(r => {
    const { src, segments } = globToRegex(r.source);
    const loc = replaceSegments(segments, r.destination);
    return {
      src,
      headers: { Location: loc },
      status: r.type || 301,
      continue: true,
    };
  });
}

export function convertRewrites(rewrites: SuperstaticRewrite[]): Route[] {
  return rewrites.map(r => {
    const { src, segments } = globToRegex(r.source);
    const dest = replaceSegments(segments, r.destination);
    return { src, dest, continue: true };
  });
}

export function convertHeaders(headers: SuperstaticHeader[]): Route[] {
  return headers.map(h => {
    const { src } = globToRegex(h.source);
    const obj: { [key: string]: string } = {};
    h.headers.forEach(kv => {
      obj[kv.key] = kv.value;
    });
    return {
      src,
      headers: obj,
      continue: true,
    };
  });
}

export function convertTrailingSlash(enable: boolean): Route[] {
  const routes: Route[] = [];
  if (enable) {
    routes.push({
      src: '^(.*[^\\/])$',
      headers: { Location: '$1/' },
      status: 301,
      continue: true,
    });
  } else {
    routes.push({
      src: '^(.*)\\/$',
      headers: { Location: '$1' },
      status: 301,
      continue: true,
    });
  }
  return routes;
}

function globToRegex(source: string): { src: string; segments: string[] } {
  const output: string[] = [];
  const segments: string[] = [];
  for (const part of source.split('/')) {
    if (part === '**') {
      output.push('.*');
    } else if (part === '*') {
      output.push('[^/]+');
    } else if (part.startsWith(':')) {
      const last = part.slice(-1);
      const end = ['*', '+', '?'].includes(last) ? -1 : part.length;
      const segment = part.slice(1, end);
      // TODO: how to handle suffix
      output.push('(?<' + segment + '>[^/]+)');
      segments.push(segment);
    } else {
      output.push(
        part
          .replace(/@\(/g, '(')
          .replace(/\./g, '\\.')
          .replace(/\*/g, '[^/]+')
      );
    }
  }
  return { src: output.join('/'), segments };
}

function replaceSegments(segments: string[], destination: string) {
  for (const s of segments) {
    const r = new RegExp(':' + s, 'g');
    destination = destination.replace(r, '$' + s);
  }
  return destination;
}
