declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /**
       * An indicator to show that System Environment Variables have been exposed to your project's Deployments.
       * @example "1"
       */
      VERCEL: string;

      /**
       * An indicator that the code is running in a Continuous Integration environment.
       * @example "1"
       */
      CI: string;

      /**
       * The Environment that the app is deployed and running on.
       * @example "production"
       */
      VERCEL_ENV: 'production' | 'preview' | 'development';

      /**
       * The domain name of the generated deployment URL. The value does not include the protocol scheme https://.
       * NOTE: This Variable cannot be used in conjunction with Standard Deployment Protection.
       * @example "*.vercel.app"
       */
      VERCEL_URL: string;

      /**
       * The domain name of the generated Git branch URL. The value does not include the protocol scheme https://.
       * @example "*-git-*.vercel.app"
       */
      VERCEL_BRANCH_URL: string;

      /**
       * A production domain name of the project. This is useful to reliably generate links that point to production such as OG-image URLs.
       * The value does not include the protocol scheme https://.
       * @example "myproject.vercel.app"
       */
      VERCEL_PROJECT_PRODUCTION_URL: string;

      /**
       * The ID of the Region where the app is running.
       *
       * Possible values:
       * - arn1 (Stockholm, Sweden)
       * - bom1 (Mumbai, India)
       * - cdg1 (Paris, France)
       * - cle1 (Cleveland, USA)
       * - cpt1 (Cape Town, South Africa)
       * - dub1 (Dublin, Ireland)
       * - fra1 (Frankfurt, Germany)
       * - gru1 (São Paulo, Brazil)
       * - hkg1 (Hong Kong)
       * - hnd1 (Tokyo, Japan)
       * - iad1 (Washington, D.C., USA)
       * - icn1 (Seoul, South Korea)
       * - kix1 (Osaka, Japan)
       * - lhr1 (London, United Kingdom)
       * - pdx1 (Portland, USA)
       * - sfo1 (San Francisco, USA)
       * - sin1 (Singapore)
       * - syd1 (Sydney, Australia)
       * - dev1 (Development Region)
       *
       * @example "iad1"
       */
      VERCEL_REGION:
        | 'arn1'
        | 'bom1'
        | 'cdg1'
        | 'cle1'
        | 'cpt1'
        | 'dub1'
        | 'fra1'
        | 'gru1'
        | 'hkg1'
        | 'hnd1'
        | 'iad1'
        | 'icn1'
        | 'kix1'
        | 'lhr1'
        | 'pdx1'
        | 'sfo1'
        | 'sin1'
        | 'syd1'
        | 'dev1';

      /**
       * The unique identifier for the deployment, which can be used to implement Skew Protection.
       * @example "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3"
       */
      VERCEL_DEPLOYMENT_ID: string;

      /**
       * When Skew Protection is enabled in Project Settings, this value is set to 1.
       * @example "1"
       */
      VERCEL_SKEW_PROTECTION_ENABLED: string;

      /**
       * The Protection Bypass for Automation value, if the secret has been generated in the project's Deployment Protection settings.
       */
      VERCEL_AUTOMATION_BYPASS_SECRET: string;

      /**
       * The Git Provider the deployment is triggered from.
       * @example "github"
       */
      VERCEL_GIT_PROVIDER: string;

      /**
       * The origin repository the deployment is triggered from.
       * @example "my-site"
       */
      VERCEL_GIT_REPO_SLUG: string;

      /**
       * The account that owns the repository the deployment is triggered from.
       * @example "acme"
       */
      VERCEL_GIT_REPO_OWNER: string;

      /**
       * The ID of the repository the deployment is triggered from.
       * @example "117716146"
       */
      VERCEL_GIT_REPO_ID: string;

      /**
       * The git branch of the commit the deployment was triggered by.
       * @example "improve-about-page"
       */
      VERCEL_GIT_COMMIT_REF: string;

      /**
       * The git SHA of the commit the deployment was triggered by.
       * @example "fa1eade47b73733d6312d5abfad33ce9e4068081"
       */
      VERCEL_GIT_COMMIT_SHA: string;

      /**
       * The message attached to the commit the deployment was triggered by.
       * @example "Update about page"
       */
      VERCEL_GIT_COMMIT_MESSAGE: string;

      /**
       * The username attached to the author of the commit that the project was deployed by.
       * @example "johndoe"
       */
      VERCEL_GIT_COMMIT_AUTHOR_LOGIN: string;

      /**
       * The name attached to the author of the commit that the project was deployed by.
       * @example "John Doe"
       */
      VERCEL_GIT_COMMIT_AUTHOR_NAME: string;

      /**
       * The git SHA of the last successful deployment for the project and branch.
       * NOTE: This Variable is only exposed when an Ignored Build Step is provided.
       * @example "fa1eade47b73733d6312d5abfad33ce9e4068080"
       */
      VERCEL_GIT_PREVIOUS_SHA: string;

      /**
       * The pull request id the deployment was triggered by. If a deployment is created on a branch before a pull request is made, this value will be an empty string.
       * @example "23"
       */
      VERCEL_GIT_PULL_REQUEST_ID: string;
    }
  }
}

/**
 * Extends the lifetime of the request handler for the lifetime of the given {@link Promise}
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil
 *
 * @param promise The promise to wait for.
 * @example
 *
 * ```
 * import { waitUntil } from '@vercel/functions';
 *
 * export function GET(request) {
 *   waitUntil(fetch('https://vercel.com'));
 *   return new Response('OK');
 * }
 * ```
 */
export function waitUntil(promise: Promise<unknown>): void;
