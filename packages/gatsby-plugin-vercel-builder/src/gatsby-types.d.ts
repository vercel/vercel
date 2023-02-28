// copied from 'gatsby/dist/redux/types'

declare type SystemPath = string;
declare type Identifier = string;
declare type PageMode = 'SSG' | 'DSG' | 'SSR';
type TrailingSlash = 'always' | 'never' | 'ignore' | 'legacy';

interface IGraphQLTypegenOptions {
  typesOutputPath: string;
  generateOnBuild: boolean;
}

export interface IRedirect {
  fromPath: string;
  toPath: string;
  isPermanent?: boolean;
  redirectInBrowser?: boolean;
  ignoreCase: boolean;
  [key: string]: any;
}

export interface IGatsbyPage {
  internalComponentName: string;
  path: string;
  matchPath: undefined | string;
  component: SystemPath;
  componentChunkName: string;
  isCreatedByStatefulCreatePages: boolean;
  context: Record<string, unknown>;
  updatedAt: number;
  pluginCreator___NODE: Identifier;
  pluginCreatorId: Identifier;
  componentPath: SystemPath;
  ownerNodeId: Identifier;
  manifestId?: string;
  defer?: boolean;
  /**
   * INTERNAL. Do not use `page.mode`, it can be removed at any time
   * `page.mode` is currently reliable only in engines and `onPostBuild` hook
   * (in develop it is dynamic and can change at any time)
   * TODO: remove, see comments in utils/page-mode:materializePageMode
   *
   * @internal
   */
  mode: PageMode;
}

export interface IGatsbyFunction {
  /** The route in the browser to access the function **/
  functionRoute: string;
  /** The absolute path to the original function **/
  originalAbsoluteFilePath: string;
  /** The relative path to the original function **/
  originalRelativeFilePath: string;
  /** The relative path to the compiled function (always ends with .js) **/
  relativeCompiledFilePath: string;
  /** The absolute path to the compiled function (doesn't transfer across machines) **/
  absoluteCompiledFilePath: string;
  /** The matchPath regex created by path-to-regexp. Only created if the function is dynamic. **/
  matchPath: string | undefined;
  /** The plugin that owns this function route **/
  pluginName: string;
}

export interface IGatsbyConfig {
  plugins?: Array<{
    resolve: string;
    options: {
      [key: string]: unknown;
    };
  }>;
  siteMetadata?: {
    title?: string;
    author?: string;
    description?: string;
    siteUrl?: string;
    [key: string]: unknown;
  };
  polyfill?: boolean;
  developMiddleware?: any;
  proxy?: any;
  partytownProxiedURLs?: Array<string>;
  pathPrefix?: string;
  assetPrefix?: string;
  mapping?: Record<string, string>;
  jsxRuntime?: 'classic' | 'automatic';
  jsxImportSource?: string;
  trailingSlash?: TrailingSlash;
  graphqlTypegen?: IGraphQLTypegenOptions;
}
