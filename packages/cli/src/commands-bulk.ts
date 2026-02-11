/**
 * This file re-exports all non-priority command handlers.
 * Priority commands (deploy, env, list, link, build, dev)
 * have their own entry points for faster loading via code splitting.
 */

// Non-priority commands - bundled together
export { default as alias } from './commands/alias';
export { default as api } from './commands/api';
export { default as bisect } from './commands/bisect';
export { default as blob } from './commands/blob';
export { default as cache } from './commands/cache';
export { default as certs } from './commands/certs';
export { default as curl } from './commands/curl';
export { default as dns } from './commands/dns';
export { default as domains } from './commands/domains';
export { default as events } from './commands/events';
export { default as flags } from './commands/flags';
export { default as git } from './commands/git';
export { default as guidance } from './commands/guidance';
export { default as httpstat } from './commands/httpstat';
export { default as init } from './commands/init';
export { default as inspect } from './commands/inspect';
export { default as install } from './commands/install';
export { default as integration } from './commands/integration';
export { default as integrationResource } from './commands/integration-resource';
export { default as login } from './commands/login';
export { default as logout } from './commands/logout';
export { default as logs } from './commands/logs';
export { default as mcp } from './commands/mcp';
export { default as microfrontends } from './commands/microfrontends';
export { default as open } from './commands/open';
export { default as project } from './commands/project';
export { default as promote } from './commands/promote';
export { default as pull } from './commands/pull';
export { default as redeploy } from './commands/redeploy';
export { default as redirects } from './commands/redirects';
export { default as remove } from './commands/remove';
export { default as rollback } from './commands/rollback';
export { default as rollingRelease } from './commands/rolling-release';
export { default as target } from './commands/target';
export { default as teams } from './commands/teams';
export { default as telemetry } from './commands/telemetry';
export { default as upgrade } from './commands/upgrade';
export { default as webhooks } from './commands/webhooks';
export { default as whoami } from './commands/whoami';
