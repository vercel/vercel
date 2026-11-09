export const FILTER_DEPRECATION_WARNING =
  'OData support in --query is deprecated and will be removed soon. KQL will be the only supported filter syntax.';

/**
 * Whether a raw `--query` expression is written in OData rather than KQL.
 *
 * Quoted sections are stripped first: `path eq '/eq/1'` names the operator
 * inside its own value, and a filter is not OData for having said so.
 */
export function usesODataSyntax(filters: string[] | undefined): boolean {
  return (
    filters?.some(filter => {
      const unquoted = filter.replace(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/g, '');

      return (
        /\s(?:eq|ne|gt|ge|lt|le|in)\s/i.test(unquoted) ||
        /\b(?:contains|startswith|endswith)\s*\(/i.test(unquoted)
      );
    }) ?? false
  );
}
