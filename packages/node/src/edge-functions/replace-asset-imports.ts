import type { Source } from 'webpack-sources';
import { ReplaceSource } from 'webpack-sources';
import { parse as parseLoose } from 'acorn-loose';
import { parse as strictParse } from 'acorn';
import { simple as simpleWalk } from 'acorn-walk';
import { ASSET_NAMESPACE } from './esbuild-plugin-asset-file-import';

/**
 * Replace all binary asset imports (`new URL(X, import.meta.hot)`)
 * with an `import` statement, which allows us to levearge esbuild plugins
 * to handle them.
 *
 * @example
 * ```ts
 * const url = new URL("./my-file.png", import.meta.url);
 *
 * // will be converted into:
 *
 * import __vc_url__1 from "blob:./my-file.png";
 * const url = __vc_url__1;
 * ```
 */
export function replaceAssetImports(source: Source): Source {
  const replacer = new ReplaceSource(source);
  const replacements = getReplacements(source.source().toString());

  let index = 0;
  for (const replacement of replacements) {
    const name = `__vc_url__${++index}`;
    replacer.insert(
      0,
      `import ${name} from ${JSON.stringify(
        `${ASSET_NAMESPACE}:${replacement.path}`
      )};`
    );
    replacer.replace(replacement.from, replacement.to, name);
  }
  return replacer;
}

type UrlImportReference = {
  /**
   * The string index this URL import starts at
   */
  from: number;
  /**
   * The string index this URL import ends at
   */
  to: number;
  /**
   * The path of the URL import
   */
  path: string;
};

/**
 * This function takes a JavaScript/TypeScript code and returns
 * an array of {@link UrlImportReference} objects, which represent the
 * locations of all the `new URL(X, import.meta.url)` statements
 * with their referenced paths.
 *
 * for the given code, it will mark the following locations as the
 * replacements. ^ will mark the start, $ will mark the end, and ~ will mark the path:
 *
 * ```typescript
 * const url = new URL("./my-file.png", import.meta.url);
 *             ^       ~~~~~~~~~~~~~~~                 $
 * ```
 */
function getReplacements(code: string): UrlImportReference[] {
  const replacements: UrlImportReference[] = [];
  const ast = parse(code);

  simpleWalk(ast, {
    NewExpression(node: any) {
      if (
        (node as any).callee?.name !== 'URL' ||
        (node.arguments?.length ?? 0) < 2
      ) {
        return;
      }

      const [request, base] = node.arguments;

      if (
        request.type !== 'Literal' ||
        base.property?.name !== 'url' ||
        base.object?.type !== 'MetaProperty'
      ) {
        return;
      }

      replacements.push({
        from: node.start,
        to: node.end - 1,
        path: String(request.value),
      });
    },
  });

  return replacements;
}

/**
 * This function tries to parse a strict JS code. If it fails for any reason,
 * like when the code is actually a TypeScript file, it will parse it with the loose-mode parser,
 * which is less correct but more compatible.
 */
function parse(source: string): ReturnType<typeof strictParse> {
  try {
    return strictParse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (e) {
    return parseLoose(source, { ecmaVersion: 'latest', sourceType: 'module' });
  }
}
