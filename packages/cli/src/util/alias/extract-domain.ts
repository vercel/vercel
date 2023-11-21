import isWildcardAlias from './is-wildcard-alias.js';

export default function extractDomain(alias: string) {
  return isWildcardAlias(alias) ? alias.slice(2) : alias;
}
