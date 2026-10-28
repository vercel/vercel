import { createHelpTheme, type HelpTheme } from '../../util/output/help-theme';
import {
  helpHeading,
  helpColumns,
  helpRows,
  helpSyntaxWidth,
  wrapHelpText,
} from '../../util/output/help-format';
import output from '../../output-manager';
import { remoteText } from '../../util/output/remote-text';
import type Client from '../../util/client';
import {
  buildCommandDocumentationLines,
  buildCommandExampleLines,
  type CommandExample,
  type Command,
  type HelpOptions,
} from '../help';
import { packageName } from '../../util/pkg-name';
import { globalCommandOptions } from '../../util/arg-common';
import { connexCommand } from './command';
import {
  connexMarkdownToPlainText,
  createPathBadge,
  describeCredentialFields,
  fetchConnexServiceInfo,
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
  printHelp: (command: Command, options?: HelpOptions) => void
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
  const width = helpColumns(client.stdout.columns);
  const theme = createHelpTheme(client.stdout);

  // `create --help` is the command reference; `create <service> --help`
  // answers a different question, so it keeps the synopsis and description
  // and drops the flag reference rather than burying the service behind it.
  // Both option blocks render as nothing once their lists are empty.
  // Render the documentation link after the service-specific sections.
  printHelp(
    {
      ...baseCommand,
      options: [],
      disabledGlobalOptions: globalCommandOptions.map(option => option.name),
      examples: [],
    },
    { omitDocumentation: true, theme, stream: client.stdout, columns: width }
  );

  if (targets.length > 1) {
    client.stdout.write(formatTargets(serviceName, targets, width, theme));
  }
  client.stdout.write(
    formatMethods(serviceName, methods, targets, width, theme)
  );
  client.stdout.write(formatExamples(service, methods, width, theme));

  const documentationLines = buildCommandDocumentationLines(connexCommand, {
    columns: width,
    theme,
  });
  if (documentationLines) {
    client.stdout.write(`\n${documentationLines}\n`);
  }

  return true;
}

function formatTargets(
  serviceName: string,
  targets: ConnexServiceTarget[],
  width: number,
  theme: HelpTheme
): string {
  const lines: string[] = ['', helpHeading(`${serviceName} products`, theme)];

  for (const target of targets) {
    lines.push(
      helpRows(
        [{ syntax: target.target, description: target.label }],
        width,
        theme,
        helpSyntaxWidth(targets.map(target => target.target))
      )
    );
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
  width: number,
  theme: HelpTheme
): string {
  const lines: string[] = [
    '',
    helpHeading(`Connection methods for ${serviceName}`, theme),
  ];

  for (const method of methods) {
    const badge = createPathBadge(method);
    lines.push(
      helpRows(
        [
          {
            syntax: method.connectionMethod,
            description: `${method.label}${badge ? ` — ${badge}` : ''}`,
          },
        ],
        width,
        theme,
        helpSyntaxWidth(methods.map(method => method.connectionMethod))
      )
    );

    for (const line of describeLines(method.description, undefined, width)) {
      lines.push(line);
    }

    const connectsTo = (method.targets ?? [])
      .map(slug => targets.find(t => t.target === slug)?.label ?? slug)
      .join(', ');
    if (connectsTo && targets.length > 1) {
      lines.push(wrapHelpText(`Connects to: ${connectsTo}`, width, '    '));
    }

    const registerUrl = method.settingsUrl ?? method.docUrl;
    if (registerUrl && method.create.manual) {
      lines.push(
        wrapHelpText(`Get credentials at ${registerUrl}`, width, '    ')
      );
    }

    for (const field of method.templateFields ?? []) {
      const detail = field.default
        ? `${field.label} (default: ${field.default})`
        : field.placeholder
          ? `${field.label} · e.g. ${field.placeholder}`
          : field.label;
      lines.push(
        helpRows(
          [
            {
              syntax: [
                { text: '--param', literal: true },
                { text: ` ${field.key}=<VALUE>` },
              ],
              description: detail,
            },
          ],
          Math.max(1, width - 2),
          theme,
          helpSyntaxWidth(
            (method.templateFields ?? []).map(
              field => `--param ${field.key}=<VALUE>`
            )
          )
        )
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n')
      );
    }

    if (method.instructions) {
      lines.push(
        wrapHelpText(
          connexMarkdownToPlainText(method.instructions),
          width,
          '    '
        )
      );
    }

    const credentials = method.create.manual
      ? describeCredentialFields(method)
      : undefined;
    if (credentials) {
      // A method offering both paths takes credentials only if you opt out of
      // the automatic one, so don't present --data as its requirement.
      const prefix =
        method.create.managed === true ? 'Or bring your own: --data' : '--data';
      lines.push(wrapHelpText(`${prefix} with ${credentials}`, width, '    '));
    }

    lines.push('');
  }

  return lines.join('\n');
}

function formatExamples(
  service: string,
  methods: ConnexConnectionMethod[],
  columns: number,
  theme: HelpTheme
): string {
  const examples: CommandExample[] = [];

  for (const method of methods) {
    const parts = [
      packageName,
      COMMAND,
      exampleIdentifier(service, 'SERVICE'),
      '--connection-method',
      exampleIdentifier(method.connectionMethod, 'METHOD'),
    ];
    for (const field of method.templateFields ?? []) {
      parts.push(
        '--param',
        `${exampleIdentifier(field.key, 'KEY')}=${exampleIdentifier(field.default, 'VALUE')}`
      );
    }
    parts.push(
      '--name',
      `${exampleIdentifier(service, 'SERVICE')}-${exampleIdentifier(method.connectionMethod, 'METHOD')}`
    );

    const managedOnly = method.create.managed === true;
    if (!managedOnly && method.create.manual) {
      parts.push('--data', '"@<CREDENTIALS_FILE>"');
    }

    examples.push({
      name: `Connect with ${remoteText(method.label)}`,
      placeholders: [
        ...new Set(
          parts.flatMap(
            part =>
              part.match(/<(?:SERVICE|METHOD|KEY|VALUE|CREDENTIALS_FILE)>/g) ??
              []
          )
        ),
      ],
      value: parts.join(' '),
    });
  }
  examples.push({
    name: 'Show all command options',
    value: `${packageName} ${COMMAND} --help`,
  });
  return `\n${buildCommandExampleLines({ examples }, columns, theme)}\n`;
}

function describeLines(
  description: string | undefined,
  docsUrl: string | undefined,
  width: number
): string[] {
  const lines: string[] = [];
  if (description) {
    lines.push(wrapHelpText(description, width, '    '));
  }
  if (docsUrl) {
    lines.push(wrapHelpText(`Docs: ${docsUrl}`, width, '    '));
  }
  return lines;
}

function exampleIdentifier(
  value: string | undefined,
  placeholder: string
): string {
  return value && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)
    ? value
    : `<${placeholder}>`;
}
