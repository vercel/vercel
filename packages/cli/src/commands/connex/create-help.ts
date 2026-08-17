import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import type { Command } from '../help';
import { packageName } from '../../util/pkg-name';
import { globalCommandOptions } from '../../util/arg-common';
import {
  connexMarkdownToPlainText,
  createPathBadge,
  describeCredentialFields,
  fetchConnexServiceInfo,
  wrapPlain,
  type ConnexConnectionMethod,
  type ConnexServiceInfo,
  type ConnexServiceTarget,
} from '../../util/connex/connection-methods';

const COMMAND = 'connect create';

/**
 * Prints service-specific help for `connect create <service>`: the connection
 * methods the registry publishes, what each one needs, and a runnable example
 * per method. Returns false when there is nothing service-specific to add, so
 * the caller prints static help instead.
 *
 * Every failure path — no argument, unknown service, no auth, network error —
 * returns false rather than throwing. `--help` must not start depending on a
 * working connection to the API.
 */
export async function printCreateDynamicHelp(
  client: Client,
  service: string | undefined,
  baseCommand: Command,
  printHelp: (command: Command) => void
): Promise<boolean> {
  if (!service) {
    return false;
  }

  let serviceInfo: ConnexServiceInfo | undefined;
  try {
    serviceInfo = await fetchConnexServiceInfo(client, service);
  } catch (err: unknown) {
    output.debug(`Failed to fetch service info for dynamic help: ${err}`);
    // `create` repairs an unusable team through `selectConnexTeam`; help can't,
    // because it must not prompt. The registry is provider facts — only
    // stealth gating is team-scoped, and that gate can only ever hide a
    // service — so an unscoped read still documents the service honestly.
    try {
      serviceInfo = await fetchConnexServiceInfo(client, service, {
        useCurrentTeam: false,
      });
    } catch (retryErr: unknown) {
      output.debug(`Failed to fetch service info without a team: ${retryErr}`);
      return false;
    }
  }

  const methods = serviceInfo?.connectionMethods ?? [];
  if (methods.length === 0) {
    return false;
  }

  const serviceName = serviceInfo?.name ?? service;
  const targets = serviceInfo?.targets ?? [];
  const width = Math.max(40, Math.min(client.stderr.columns || 80, 100));

  // `create --help` is the command reference; `create <service> --help`
  // answers a different question, so it keeps the synopsis and description
  // and drops the flag reference rather than burying the service behind it.
  // Both option blocks render as nothing once their lists are empty.
  printHelp({
    ...baseCommand,
    options: [],
    disabledGlobalOptions: globalCommandOptions.map(option => option.name),
    examples: [],
  });

  if (targets.length > 1) {
    output.print(formatTargets(serviceName, targets, width));
  }
  output.print(formatMethods(serviceName, methods, targets, width));
  output.print(formatExamples(service, methods));

  return true;
}

function formatTargets(
  serviceName: string,
  targets: ConnexServiceTarget[],
  width: number
): string {
  const lines: string[] = [
    '',
    `  ${chalk.dim(`${serviceName} products:`)}`,
    '',
  ];

  for (const target of targets) {
    lines.push(`    ${chalk.bold(target.target)}  ${target.label}`);
    for (const line of describeLines(
      target.description,
      target.docsUrl,
      width
    )) {
      lines.push(line);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatMethods(
  serviceName: string,
  methods: ConnexConnectionMethod[],
  targets: ConnexServiceTarget[],
  width: number
): string {
  const lines: string[] = [
    '',
    `  ${chalk.dim(`Connection methods for ${serviceName}:`)}`,
    '',
  ];

  for (const method of methods) {
    const badge = createPathBadge(method);
    lines.push(
      `    ${chalk.bold(method.connectionMethod)}  ${method.label}${
        badge ? chalk.dim(` — ${badge}`) : ''
      }`
    );

    for (const line of describeLines(method.description, undefined, width)) {
      lines.push(line);
    }

    const connectsTo = (method.targets ?? [])
      .map(slug => targets.find(t => t.target === slug)?.label ?? slug)
      .join(', ');
    if (connectsTo && targets.length > 1) {
      lines.push(indented(`Connects to: ${connectsTo}`));
    }

    const registerUrl = method.settingsUrl ?? method.docUrl;
    if (registerUrl && method.create.manual) {
      lines.push(indented(`Get credentials at ${chalk.cyan(registerUrl)}`));
    }

    for (const field of method.templateFields ?? []) {
      const detail = field.default
        ? `default: ${field.default}`
        : field.placeholder
          ? `e.g. ${field.placeholder}`
          : undefined;
      lines.push(
        indented(
          `--param ${field.key}=<value>  ${chalk.dim(
            detail ? `${field.label} · ${detail}` : field.label
          )}`
        )
      );
    }

    if (method.instructions) {
      for (const line of wrapPlain(
        connexMarkdownToPlainText(method.instructions),
        width - 6
      )) {
        lines.push(indented(chalk.dim(line)));
      }
    }

    const credentials = method.create.manual
      ? describeCredentialFields(method)
      : undefined;
    if (credentials) {
      // A method offering both paths takes credentials only if you opt out of
      // the automatic one, so don't present --data as its requirement.
      const prefix =
        method.create.managed === true ? 'Or bring your own: --data' : '--data';
      lines.push(indented(`${prefix} with ${chalk.dim(credentials)}`));
    }

    lines.push('');
  }

  return lines.join('\n');
}

function formatExamples(
  service: string,
  methods: ConnexConnectionMethod[]
): string {
  const lines: string[] = ['', `  ${chalk.dim('Examples:')}`];

  for (const method of methods) {
    const parts = [
      packageName,
      COMMAND,
      service,
      '--connection-method',
      method.connectionMethod,
    ];
    for (const field of method.templateFields ?? []) {
      parts.push('--param', `${field.key}=${field.placeholder ?? '<value>'}`);
    }
    parts.push('--name', `${service}-${method.connectionMethod}`);

    const managedOnly = method.create.managed === true;
    if (!managedOnly && method.create.manual) {
      parts.push('--data', '@credentials.json');
    }

    lines.push('');
    lines.push(`  ${chalk.dim('-')} Connect with ${method.label}`);
    lines.push('');
    lines.push(`    ${chalk.cyan(`$ ${parts.join(' ')}`)}`);
  }

  lines.push('');
  lines.push(
    `  ${chalk.dim(`Run \`${packageName} ${COMMAND} --help\` for all options.`)}`
  );
  lines.push('');

  return lines.join('\n');
}

function describeLines(
  description: string | undefined,
  docsUrl: string | undefined,
  width: number
): string[] {
  const lines: string[] = [];
  if (description) {
    for (const line of wrapPlain(description, width - 6)) {
      lines.push(indented(chalk.dim(line)));
    }
  }
  if (docsUrl) {
    lines.push(indented(chalk.dim(`Docs: ${docsUrl}`)));
  }
  return lines;
}

function indented(text: string): string {
  return `      ${text}`;
}
