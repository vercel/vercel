import { Rewrite, Route } from '@vercel/routing-utils';

export interface FrameworkDetectionItem {
  /**
   * A file path to detect.
   * If specified, "matchPackage" cannot be specified.
   * @example "some-framework.config.json"
   */
  path?: string;
  /**
   * A matcher for the entire file.
   * If specified, "matchPackage" cannot be specified.
   * @example "\"(dev)?(d|D)ependencies\":\\s*{[^}]*\"next\":\\s*\".+?\"[^}]*}"
   */
  matchContent?: string;
  /**
   * A matcher for a package specifically found in a "package.json" file.
   * If specified, "path" and "matchContext" cannot be specified.
   * If specified in multiple detectors, the first one will be used to resolve the framework version.
   * @example "\"(dev)?(d|D)ependencies\":\\s*{[^}]*\"next\":\\s*\".+?\"[^}]*}"
   */
  matchPackage?: string;
}

export interface SettingPlaceholder {
  /**
   * A placeholder value for when the framework has not a predefined one
   * @example "`npm run build` or `next build`"
   */
  placeholder: string;
}

export interface SettingValue {
  /**
   * A predefined setting for the detected framework.
   * @example "next dev --port $PORT"
   */
  value: string | null;
  /**
   * Placeholder text that may be shown in the UI when
   * the user is configuring this setting value.
   * @example "`npm run build` or `next build`"
   */
  placeholder?: string;
  /**
   * When set to `true`, then the builder will not
   * invoke the equivalent script in `package.json`,
   * and instead will invoke the command specified in
   * configuration setting directly. When this
   * configuration is enabled, `value` must be a string.
   */
  ignorePackageJsonScript?: boolean;
}

export type Setting = SettingValue | SettingPlaceholder;

export type Redirect = Rewrite & {
  statusCode?: number;
  permanent?: boolean;
};

/**
 * Framework detection information.
 */
export interface Framework {
  /**
   * Name of the framework
   * @example "Next.js"
   */
  name: string;
  /**
   * A unique identifier for the framework
   * @example "nextjs"
   */
  slug: string | null;
  /**
   * A URL to the logo of the framework
   * @example "https://api-frameworks.vercel.sh/framework-logos/next.svg"
   */
  logo: string;
  /**
   * An additional URL to the logo of the framework optimized for dark mode
   * @example "https://api-frameworks.vercel.sh/framework-logos/next-dark.svg"
   */
  darkModeLogo?: string;
  /**
   * A URL to a screenshot of the demo
   * @example "https://assets.vercel.com/image/upload/v1647366075/front/import/nextjs.png"
   */
  screenshot?: string;
  /**
   * A URL to a deployed example of the framework
   * @example "https://nextjs-template.vercel.app"
   */
  demo?: string;
  /**
   * A marketing tagline for the framework
   * @example "Next.js makes you productive with React instantly — whether you want to build static or dynamic sites."
   */
  tagline?: string;
  /**
   * A URL to the official website of the framework
   * @example "https://nextjs.org"
   */
  website?: string;
  /**
   * Short description of the framework
   * @example "A Next.js app and a Serverless Function API."
   */
  description: string;
  /**
   * A ponderated value to sort matching frameworks
   * @example 1
   */
  sort?: number;
  /**
   * The environment variable prefix used to inline values into the browser bundle.
   * @example "NEXT_PUBLIC_"
   */
  envPrefix?: string;
  /**
   * Runtime configuration required to run the framework in Vercel
   */
  useRuntime?: {
    /**
     * Runtime source
     * @example "package.json"
     */
    src: string;
    /**
     * Runtime
     * @example "@vercel/next"
     */
    use: string;
  };
  /**
   * Names of runtimes which will not be used for zero-config
   * matches within the "api" directory.
   */
  ignoreRuntimes?: string[];
  /**
   * If `true`, then root-level middleware will not be enabled
   * for this framework. Defaults to `false`.
   */
  disableRootMiddleware?: boolean;
  /**
   * Detectors used to find out the framework
   */
  detectors?: {
    /**
     * Collection of detectors that must be matched for the framework
     * to be detected.
     */
    every?: FrameworkDetectionItem[];
    /**
     * Collection of detectors where one match triggers the framework
     * to be detected.
     */
    some?: FrameworkDetectionItem[];
  };
  settings: {
    /**
     * Default Install Command or a placeholder
     */
    installCommand: Setting;
    /**
     * Default Build Command or a placeholder
     */
    buildCommand: SettingValue;
    /**
     * Default Development Command or a placeholder
     */
    devCommand: SettingValue;
    /**
     * Default Output Directory
     */
    outputDirectory: Setting;
  };
  /**
   * A list of recommended integrations for the framework
   */
  recommendedIntegrations?: {
    /**
     * Id of the recommended integration
     * @example "oac_5lUsiANun1DEzgLg0NZx5Es3"
     */
    id: string;
    /**
     * Dependencies of the recommended integration
     * @example ["next-plugin-sentry", "next-sentry-source-maps"]
     */
    dependencies: string[];
  }[];
  /**
   * Name of a dependency in `package.json` to detect this framework.
   * @example "hexo"
   * @deprecated use `detectors` instead (new frameworks should not use this prop)
   */
  dependency?: string;
  /**
   * Function that returns the name of the directory that the framework outputs
   * its STATIC build results to. In some cases this is read from a configuration file.
   */
  getOutputDirName: (dirPrefix: string) => Promise<string>;
  /**
   * An array (or a function that returns an array) of default `Route` rules that
   * the framework uses.
   * @example [{ handle: 'filesystem' }, { src: '.*', status: 404, dest: '404.html' }]
   */
  defaultRoutes?: Route[] | ((dirPrefix: string) => Promise<Route[]>);
  /**
   * A glob string of files to cache for future deployments.
   * @example ".cache/**"
   */
  cachePattern?: string;
  /**
   * The default version of the framework command that is available within the
   * build image. Usually an environment variable can be set to override this.
   * @example "0.13.0"
   */
  defaultVersion?: string;
  /**
   * Slug of another framework preset in which this framework supersedes.
   */
  supersedes?: string;
}
