/**
 * This converts Superstatic configuration to Now.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */

import { Route } from './index';

interface SuperstaticRewrite {
  source: string;
  destination: string;
}

interface SuperstaticRedirect {
  source: string;
  destination: string;
  type?: number;
}

interface SuperstaticHeader {
  source: string;
  headers: SuperstaticHeaderKeyValue[];
}

interface SuperstaticHeaderKeyValue {
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

  const rewrites: Route[] = htmlFiles.map(o => ({
    src: o.clean,
    dest: o.html,
  }));

  const redirects: Route[] = htmlFiles.map(o => ({
    src: o.html,
    headers: { Location: o.clean },
    status: 301,
  }));
  return rewrites.concat(redirects);
}

export function convertRedirects(redirects: SuperstaticRedirect[]): Route[] {
  return redirects.map(r => {
    const { src, segments } = globToRegex(r.source);
    const loc = replaceSegments(segments, r.destination);
    return {
      src,
      headers: { Location: loc },
      status: r.type || 301,
    };
  });
}

export function convertRewrites(redirects: SuperstaticRewrite[]): Route[] {
  return redirects.map(r => {
    const { src, segments } = globToRegex(r.source);
    const dest = replaceSegments(segments, r.destination);
    return { src, dest };
  });
}

export function convertHeaders(headers: SuperstaticHeader[]): Route[] {
  return headers.map(h => {
    const { src, segments } = globToRegex(h.source);
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

function globToRegex(source: string): { src: string; segments: string[] } {
  const output: string[] = [];
  const segments: string[] = [];
  for (let part of source.split('/')) {
    part = replaceAtSymbolGroups(part);
    if (part === '**') {
      output.push('.*');
    } else if (part === '*') {
      output.push('[^/]+');
    } else if (part.startsWith(':')) {
      const segment = part.slice(1);
      output.push('(?<' + segment + '>[^/]+)');
      segments.push(segment);
    } else {
      output.push(part);
    }
  }
  return { src: output.join('/'), segments };
}

function replaceAtSymbolGroups(part = '') {
  return part.replace(/@\(/g, '(');
}

function replaceSegments(segments: string[], destination: string) {
  for (const s of segments) {
    const r = new RegExp(':' + s, 'g');
    destination = destination.replace(r, '$' + s);
  }
  return destination;
}
