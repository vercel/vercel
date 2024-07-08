export const systemEnvironmentVariables = (
  env: { [key: string]: string | undefined } = process.env
) => {
  /**
   * An indicator to show that System Environment Variables have been exposed to your project's Deployments.
   * @example "1"
   */
  const VERCEL = get(env, 'VERCEL');

  /**
   * An indicator that the code is running in a Continuous Integration environment.
   * @example "1"
   */
  const CI = get(env, 'CI');

  /**
   * The Environment that the app is deployed and running on.
   * @example "production"
   */
  const VERCEL_ENV = get(env, 'VERCEL_ENV');

  /**
   * The domain name of the generated deployment URL. The value does not include the protocol scheme https://.
   * NOTE: This Variable cannot be used in conjunction with Standard Deployment Protection.
   * @example "*.vercel.app"
   */
  const VERCEL_URL = get(env, 'VERCEL_URL');

  /**
   * The domain name of the generated Git branch URL. The value does not include the protocol scheme https://.
   * @example "*-git-*.vercel.app"
   */
  const VERCEL_BRANCH_URL = get(env, 'VERCEL_BRANCH_URL');

  /**
   * A production domain name of the project. This is useful to reliably generate links that point to production such as OG-image URLs.
   * The value does not include the protocol scheme https://.
   * @example "myproject.vercel.app"
   */
  const VERCEL_PROJECT_PRODUCTION_URL = get(
    env,
    'VERCEL_PROJECT_PRODUCTION_URL'
  );

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
  const VERCEL_REGION = get(env, 'VERCEL_REGION');

  /**
   * The unique identifier for the deployment, which can be used to implement Skew Protection.
   * @example "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3"
   */
  const VERCEL_DEPLOYMENT_ID = get(env, 'VERCEL_DEPLOYMENT_ID');

  /**
   * When Skew Protection is enabled in Project Settings, this value is set to 1.
   * @example "1"
   */
  const VERCEL_SKEW_PROTECTION_ENABLED = env.VERCEL_SKEW_PROTECTION_ENABLED;

  /**
   * The Protection Bypass for Automation value, if the secret has been generated in the project's Deployment Protection settings.
   */
  const VERCEL_AUTOMATION_BYPASS_SECRET = env.VERCEL_AUTOMATION_BYPASS_SECRET;

  /**
   * The Git Provider the deployment is triggered from.
   * @example "github"
   */
  const VERCEL_GIT_PROVIDER = get(env, 'VERCEL_GIT_PROVIDER');

  /**
   * The origin repository the deployment is triggered from.
   * @example "my-site"
   */
  const VERCEL_GIT_REPO_SLUG = get(env, 'VERCEL_GIT_REPO_SLUG');

  /**
   * The account that owns the repository the deployment is triggered from.
   * @example "acme"
   */
  const VERCEL_GIT_REPO_OWNER = get(env, 'VERCEL_GIT_REPO_OWNER');

  /**
   * The ID of the repository the deployment is triggered from.
   * @example "117716146"
   */
  const VERCEL_GIT_REPO_ID = get(env, 'VERCEL_GIT_REPO_ID');

  /**
   * The git branch of the commit the deployment was triggered by.
   * @example "improve-about-page"
   */
  const VERCEL_GIT_COMMIT_REF = get(env, 'VERCEL_GIT_COMMIT_REF');

  /**
   * The git SHA of the commit the deployment was triggered by.
   * @example "fa1eade47b73733d6312d5abfad33ce9e4068081"
   */
  const VERCEL_GIT_COMMIT_SHA = get(env, 'VERCEL_GIT_COMMIT_SHA');

  /**
   * The message attached to the commit the deployment was triggered by.
   * @example "Update about page"
   */
  const VERCEL_GIT_COMMIT_MESSAGE = get(env, 'VERCEL_GIT_COMMIT_MESSAGE');

  /**
   * The username attached to the author of the commit that the project was deployed by.
   * @example "johndoe"
   */
  const VERCEL_GIT_COMMIT_AUTHOR_LOGIN = env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN;

  /**
   * The name attached to the author of the commit that the project was deployed by.
   * @example "John Doe"
   */
  const VERCEL_GIT_COMMIT_AUTHOR_NAME = env.VERCEL_GIT_COMMIT_AUTHOR_NAME;

  /**
   * The git SHA of the last successful deployment for the project and branch.
   * NOTE: This Variable is only exposed when an Ignored Build Step is provided.
   * @example "fa1eade47b73733d6312d5abfad33ce9e4068080"
   */
  const VERCEL_GIT_PREVIOUS_SHA = get(env, 'VERCEL_GIT_PREVIOUS_SHA');

  /**
   * The pull request id the deployment was triggered by. If a deployment is created on a branch before a pull request is made, this value will be an empty string.
   * @example "23"
   */
  const VERCEL_GIT_PULL_REQUEST_ID = get(env, 'VERCEL_GIT_PULL_REQUEST_ID');

  return {
    VERCEL,
    CI,
    VERCEL_ENV,
    VERCEL_URL,
    VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_REGION,
    VERCEL_DEPLOYMENT_ID,
    VERCEL_SKEW_PROTECTION_ENABLED,
    VERCEL_AUTOMATION_BYPASS_SECRET,
    VERCEL_GIT_PROVIDER,
    VERCEL_GIT_REPO_SLUG,
    VERCEL_GIT_REPO_OWNER,
    VERCEL_GIT_REPO_ID,
    VERCEL_GIT_COMMIT_REF,
    VERCEL_GIT_COMMIT_SHA,
    VERCEL_GIT_COMMIT_MESSAGE,
    VERCEL_GIT_COMMIT_AUTHOR_LOGIN,
    VERCEL_GIT_COMMIT_AUTHOR_NAME,
    VERCEL_GIT_PREVIOUS_SHA,
    VERCEL_GIT_PULL_REQUEST_ID,
  };
};

const get = (
  env: { [key: string]: string | undefined },
  key: string
): string | undefined => {
  const value = env[key];
  return value === '' ? undefined : value;
};
