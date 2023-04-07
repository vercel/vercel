import { MatchRegex, RegexReplace, ParsePath } from './resolver';
import querystring from 'querystring';
import crypto from 'crypto';

export const hash_func = (content: string) =>
  crypto.createHash('md5').update(content).digest('hex');

export const encode_query = (query: Record<string, string | string[]>) => {
  return querystring.stringify(query);
};

export const match_regex: MatchRegex = (
  regexString,
  testString,
  caseSensitive?: boolean
) => {
  const matches = testString.match(
    new RegExp(regexString, caseSensitive ? 'i' : undefined)
  );

  if (!matches) {
    return null;
  }
  const normalized: Record<string, string> = {};

  for (let i = 1; i < matches?.length || 0; i++) {
    normalized[i] = matches[i];
  }

  if (matches.groups) {
    for (const key of Object.keys(matches.groups)) {
      normalized[key] = matches.groups[key];
    }
  }
  return normalized;
};

export const parse_path: ParsePath = urlPath => {
  const parsed = new URL(urlPath, 'http://n');

  if (parsed.hostname === 'n') {
    return {
      pathname: parsed.pathname,
      hash: parsed.hash,
      query: Object.fromEntries(parsed.searchParams),
    };
  }
  return {
    scheme: parsed.protocol.substring(0, parsed.protocol.length - 1),
    host: parsed.host,
    port: parsed.port ? Number(parsed.port) : undefined,
    pathname: parsed.pathname,
    hash: parsed.hash,
    query: Object.fromEntries(parsed.searchParams),
  };
};

export const regex_replace: RegexReplace = (regexString, original, replace) =>
  original.replace(new RegExp(regexString, 'g'), replace);

export const get_cache = (cache_obj: any) => ({
  get(key: string) {
    return cache_obj[key];
  },
  set(key: string, data: any) {
    cache_obj[key] = data;
  },
});
