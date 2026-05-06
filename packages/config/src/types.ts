/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * This file is generated from the vercel.json OpenAPI schema.
 * To modify, update scripts/generate-types.ts and re-run:
 *   pnpm generate-types
 *
 * Schema: https://openapi.vercel.sh/vercel.json
 */

export type Framework =
  | 'blitzjs'
  | 'nextjs'
  | 'gatsby'
  | 'remix'
  | 'react-router'
  | 'astro'
  | 'hexo'
  | 'eleventy'
  | 'docusaurus-2'
  | 'docusaurus'
  | 'preact'
  | 'solidstart-1'
  | 'solidstart'
  | 'dojo'
  | 'ember'
  | 'vue'
  | 'scully'
  | 'ionic-angular'
  | 'angular'
  | 'polymer'
  | 'svelte'
  | 'sveltekit'
  | 'sveltekit-1'
  | 'ionic-react'
  | 'create-react-app'
  | 'gridsome'
  | 'umijs'
  | 'sapper'
  | 'saber'
  | 'stencil'
  | 'nuxtjs'
  | 'redwoodjs'
  | 'hugo'
  | 'jekyll'
  | 'brunch'
  | 'middleman'
  | 'zola'
  | 'hydrogen'
  | 'vite'
  | 'tanstack-start'
  | 'vitepress'
  | 'vuepress'
  | 'parcel'
  | 'fastapi'
  | 'flask'
  | 'fasthtml'
  | 'django'
  | 'sanity-v3'
  | 'sanity'
  | 'storybook'
  | 'nitro'
  | 'hono'
  | 'express'
  | 'h3'
  | 'koa'
  | 'nestjs'
  | 'elysia'
  | 'fastify'
  | 'xmcp'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'node'
  | 'go'
  | 'services'
  | null;

export interface FunctionConfig {
  /**
   * A glob pattern to match files that should be excluded from your Serverless Function. If you’re using a Community Runtime, the behavior might vary.
   */
  excludeFiles?: string;
  /**
   * A glob pattern to match files that should be included in your Serverless Function. If you’re using a Community Runtime, the behavior might vary.
   */
  includeFiles?: string;
  /**
   * An integer defining how long your Serverless Function should be allowed to run on every request in seconds (between 1 and the maximum limit of your plan), or the string `'max'` to use the maximum duration allowed by your plan.
   */
  maxDuration?: number | 'max';
  /**
   * An integer defining the memory your Serverless Function should be provided with (between 128 and 10240).
   */
  memory?: number;
  /**
   * The npm package name of a Runtime, including its version
   */
  runtime?: string;
  /**
   * An array of regions this Serverless Function should be deployed to.
   */
  regions?: string[];
  /**
   * An array of passive regions this Serverless Function can fail over to during a lambda outage.
   */
  functionFailoverRegions?: string[];
  /**
   * A boolean that defines whether the Function supports cancellation (default: false)
   */
  supportsCancellation?: boolean;
  /**
   * An array of experimental triggers for this Serverless Function. Currently only supports queue triggers.
   */
  experimentalTriggers?: (
    | {
        /**
         * Event type pattern this trigger handles
         */
        type: 'queue/v1beta';
        /**
         * Name of the queue topic to consume from
         */
        topic: string;
        /**
         * Name of the consumer group for this trigger
         */
        consumer: string;
        /**
         * Maximum number of delivery attempts
         */
        maxDeliveries?: number;
        /**
         * Delay in seconds before retrying failed executions
         */
        retryAfterSeconds?: number;
        /**
         * Initial delay in seconds before first execution attempt
         */
        initialDelaySeconds?: number;
        /**
         * Maximum number of concurrent executions for this consumer
         */
        maxConcurrency?: number;
      }
    | {
        /**
         * Event type pattern this trigger handles
         */
        type: 'queue/v2beta';
        /**
         * Name of the queue topic to consume from
         */
        topic: string;
        /**
         * Maximum number of delivery attempts
         */
        maxDeliveries?: number;
        /**
         * Delay in seconds before retrying failed executions
         */
        retryAfterSeconds?: number;
        /**
         * Initial delay in seconds before first execution attempt
         */
        initialDelaySeconds?: number;
        /**
         * Maximum number of concurrent executions for this consumer
         */
        maxConcurrency?: number;
      }
  )[];
}

export interface CronJob {
  schedule: string;
  path: string;
}

export interface ServiceQueueTopic {
  topic: string;
  retryAfterSeconds?: number;
  initialDelaySeconds?: number;
}

export interface GitDeploymentConfig {
  [branch: string]: boolean;
}

export interface GitConfig {
  /**
   * Specifies the branches that will not trigger an auto-deployment when committing to them. Any non specified branch is `true` by default.
   */
  deploymentEnabled?: boolean | GitDeploymentConfig;
  /**
   * If specified, the git repository will be exclusive to the specificed Team IDs. Teams that are not specified in the list will not be able to link new projects or create new deployments.
   * @private
   */
  exclusivity?: {
    /**
     * A list of allowed Team IDs.
     */
    teams?: string[];
  };
}

export interface GithubConfig {
  /**
   * When set to `false`, Vercel for GitHub will not deploy the given project regardless of the GitHub app being installed.
   */
  autoAlias?: boolean;
  /**
   * When set to `false`, Vercel for GitHub will always build pushes in sequence without cancelling a build for the most recent commit.
   */
  autoJobCancelation?: boolean;
  /**
   * When set to false, Vercel for GitHub will not apply the alias upon merge.
   */
  enabled?: boolean;
  /**
   * [deprecated] Please use the Project Settings in the dashboard instead: https://vercel.link/46vERTS When set to `true`, Vercel for GitHub will stop commenting on pull requests and commits.
   * @deprecated
   */
  silent?: boolean;
}

export interface ImageConfig {
  contentDispositionType?: 'inline' | 'attachment';
  contentSecurityPolicy?: string;
  dangerouslyAllowSVG?: boolean;
  domains?: string[];
  formats?: ('image/avif' | 'image/webp' | 'image/jpeg' | 'image/png')[];
  localPatterns?: {
    pathname?: string;
    search?: string;
  }[];
  minimumCacheTTL?: number;
  qualities?: number[];
  remotePatterns?: {
    protocol?: 'http' | 'https';
    hostname: string;
    port?: string;
    pathname?: string;
    search?: string;
  }[];
  sizes: number[];
}

/**
 * Value for condition matching - can be a string or an operator object
 */
export type MatchableValue =
  | string
  | {
      /**
       * Equal to
       */
      eq?: string | number;
      /**
       * Not equal
       */
      neq?: string;
      /**
       * In array
       */
      inc?: string[];
      /**
       * Not in array
       */
      ninc?: string[];
      /**
       * Starts with
       */
      pre?: string;
      /**
       * Ends with
       */
      suf?: string;
      /**
       * Regex
       */
      re?: string;
      /**
       * Greater than
       */
      gt?: number;
      /**
       * Greater than or equal to
       */
      gte?: number;
      /**
       * Less than
       */
      lt?: number;
      /**
       * Less than or equal to
       */
      lte?: number;
    };

/**
 * Condition for matching in redirects, rewrites, and headers
 */
export type Condition =
  | { type: 'host'; value: MatchableValue }
  | {
      type: 'header' | 'cookie' | 'query';
      key: string;
      value?: MatchableValue;
    };

/**
 * The object form of MatchableValue (excludes the plain string shorthand)
 */
export type MatchableValueObject = Exclude<MatchableValue, string>;

/**
 * HTTP header key/value pair
 */
export interface Header {
  key: string;
  value: string;
}

/**
 * Redirect definition matching vercel.json schema
 */
export interface Redirect {
  /**
   * A pattern that matches each incoming pathname (excluding querystring).
   */
  source: string;
  /**
   * A location destination defined as an absolute pathname or external URL.
   */
  destination: string;
  /**
   * A boolean to toggle between permanent and temporary redirect. When `true`, the status code is `308`. When `false` the status code is `307`.
   */
  permanent?: boolean;
  /**
   * An optional integer to define the status code of the redirect.
   * @private
   */
  statusCode?: number;
  /**
   * An array of requirements that are needed to match
   */
  has?: Condition[];
  /**
   * An array of requirements that are needed to match
   */
  missing?: Condition[];
  /**
   * An array of environment variable names that should be replaced at runtime in the destination
   */
  env?: string[];
}

/**
 * Rewrite definition matching vercel.json schema
 */
export interface Rewrite {
  /**
   * A pattern that matches each incoming pathname (excluding querystring).
   */
  source: string;
  /**
   * An absolute pathname to an existing resource or an external URL.
   */
  destination: string;
  /**
   * An array of requirements that are needed to match
   */
  has?: Condition[];
  /**
   * An array of requirements that are needed to match
   */
  missing?: Condition[];
  /**
   * An optional integer to override the status code of the response.
   */
  statusCode?: number;
  /**
   * An array of environment variable names that should be replaced at runtime in the destination
   */
  env?: string[];
  /**
   * When set to true (default), external rewrites will respect the Cache-Control header from the origin. When false, caching is disabled for this rewrite.
   */
  respectOriginCacheControl?: boolean;
}

/**
 * Header rule definition matching vercel.json schema
 */
export interface HeaderRule {
  /**
   * A pattern that matches each incoming pathname (excluding querystring)
   */
  source: string;
  /**
   * An array of key/value pairs representing each response header.
   */
  headers: Header[];
  /**
   * An array of requirements that are needed to match
   */
  has?: Condition[];
  /**
   * An array of requirements that are needed to match
   */
  missing?: Condition[];
}

/**
 * Union type for all routing helper outputs
 */
export type RouteType = Redirect | Rewrite | HeaderRule | any; // Route is internal to router

export interface WildcardDomain {
  domain: string;
  value: string;
}

export interface BuildConfig {
  env?: Record<string, string>;
}

export interface BuildItem {
  config?: Record<string, any>;
  src?: string;
  use: string;
}

export interface VercelConfig {
  /**
   * Aliases that will get assigned when the deployment is `READY` and the target is `production`. The client needs to make a `GET` request to its API to ensure the assignment
   */
  alias?: string | string[];
  /**
   * An object containing another object with information to be passed to the Build Process
   * @deprecated
   */
  build?: BuildConfig;
  /**
   * A list of build descriptions whose src references valid source files.
   * @deprecated
   */
  builds?: BuildItem[];
  /**
   * When set to `true`, all HTML files and Serverless Functions will have their extension removed. When visiting a path that ends with the extension, a 308 response will redirect the client to the extensionless path.
   */
  cleanUrls?: boolean;
  /**
   * An object containing the deployment's environment variable names and values. Secrets can be referenced by prefixing the value with `@`
   * @deprecated
   */
  env?: Record<string, string>;
  /**
   * An array of the passive regions the deployment's Serverless Functions should be deployed to that can be failed over to during a lambda outage
   */
  passiveRegions?: string[];
  /**
   * Same as passiveRegions. An array of the passive regions the deployment's Serverless Functions should be deployed to so we can failover to these regions on lambda outages
   */
  functionFailoverRegions?: string[];
  /**
   * An object describing custom options for your Serverless Functions. Each key must be glob pattern that matches the paths of the Serverless Functions you would like to customize (like `api/*.js` or `api/test.js`).
   */
  functions?: Record<string, FunctionConfig>;
  git?: GitConfig;
  /**
   * @private
   */
  github?: GithubConfig;
  /**
   * A list of header definitions.
   */
  headers?: HeaderRule[];
  images?: ImageConfig;
  /**
   * A name for the deployment
   */
  name?: string;
  /**
   * Whether a deployment's source and logs are available publicly
   */
  public?: boolean;
  /**
   * A list of redirect definitions.
   */
  redirects?: Redirect[];
  /**
   * The path to a file containing bulk redirects; supports JSON, JSONL, and CSV
   */
  bulkRedirectsPath?: string | null;
  /**
   * An array of the regions the deployment's Serverless Functions should be deployed to
   */
  regions?: string[];
  /**
   * A list of rewrite definitions.
   */
  rewrites?: Rewrite[];
  /**
   * A list of routes objects used to rewrite paths to point towards other internal or external paths
   */
  routes?: RouteType[];
  /**
   * This property determines the scope (user or team) under which the project will be deployed by Vercel CLI.
   * @private
   */
  scope?: string;
  /**
   * When `false`, visiting a path that ends with a forward slash will respond with a `308` status code and redirect to the path without the trailing slash.
   */
  trailingSlash?: boolean;
  /**
   * @private
   */
  version?: number;
  /**
   * @private
   */
  wildcard?: WildcardDomain[];
  /**
   * The build command for this project. When `null` is used this value will be automatically detected
   */
  buildCommand?: string | null;
  ignoreCommand?: string | null;
  /**
   * The dev command for this project. When `null` is used this value will be automatically detected
   */
  devCommand?: string | null;
  /**
   * The framework that is being used for this project. When `null` is used no framework is selected
   */
  framework?: Framework;
  /**
   * The install command for this project. When `null` is used this value will be automatically detected
   */
  installCommand?: string | null;
  /**
   * The output directory of the project. When `null` is used this value will be automatically detected
   */
  outputDirectory?: string | null;
  /**
   * An array of cron jobs that should be created for production Deployments.
   */
  crons?: CronJob[];
  /**
   * An array of projectIds to associate with the current project.
   */
  relatedProjects?: string[];
  /**
   * Enables Fluid compute for the project. It's enabled by default for new projects.
   */
  fluid?: boolean;
  /**
   * Enables Bun for the project and specifies the version to use.
   */
  bunVersion?: string;
  /**
   * Enables configuration of multiple services in a single deployment. Map of service name to service configuration.
   * @private
   */
  experimentalServices?: Record<
    string,
    {
      /**
       * Service type: web, worker, or job. Defaults to web.
       */
      type?: 'web' | 'cron' | 'worker' | 'job';
      /**
       * Trigger for job services.
       */
      trigger?: 'queue' | 'schedule' | 'workflow';
      /**
       * Path to the service's root directory relative to the project root.
       * Should contain a manifest file (package.json, pyproject.toml, etc.).
       * Defaults to ".".
       */
      root?: string;
      /**
       * Entry file for the service, relative to the service root directory.
       */
      entrypoint?: string;
      /**
       * Path to the directory containing the service manifest file (package.json, pyproject.toml, etc.). Defaults to "." (project root).
       * @deprecated Use `root` instead.
       */
      workspace?: string;
      /**
       * Preferred routing config alias for routePrefix/subdomain.
       */
      mount?:
        | string
        | {
            path?: string;
            subdomain?: string;
          };
      /**
       * URL prefix for routing (web services only).
       */
      routePrefix?: string;
      /**
       * Subdomain for host-based routing (web services only).
       */
      subdomain?: string;
      /**
       * Framework to use.
       */
      framework?: string;
      /**
       * Builder to use, e.g. @vercel/node, @vercel/python.
       */
      builder?: string;
      /**
       * Specific lambda runtime to use, e.g. nodejs24.x, python3.14.
       */
      runtime?: string;
      /**
       * Build command for the service.
       */
      buildCommand?: string;
      /**
       * Install command for the service.
       */
      installCommand?: string;
      /**
       * Memory allocation in MB (128-10240).
       */
      memory?: number;
      /**
       * Max duration in seconds (1-900).
       */
      maxDuration?: number;
      /**
       * Files to include in bundle.
       */
      includeFiles?: string | string[];
      /**
       * Files to exclude from bundle.
       */
      excludeFiles?: string | string[];
      /**
       * Cron schedule expression(s) (e.g., "0 0 * * *"). Required for schedule-triggered job services.
       */
      schedule?: string;
      /**
       * Topic names or queue topic configs for worker and queue-triggered job services.
       */
      topics?: string[] | ServiceQueueTopic[];
      /**
       * Custom prefix to use to inject service URL env vars.
       */
      envPrefix?: string;
    }
  >;
  /**
   * Enables grouping of services. Map of service group name to an array of service names belonging to that group.
   * @private
   */
  experimentalServiceGroups?: Record<string, string[]>;
}

/**
 * Runtime placeholder for VercelConfig to allow named imports.
 */
export const VercelConfig = {};
