import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import chars from '../../util/output/chars';
import table from '../../util/output/table';
import code from '../../util/output/code';
import getScope from '../../util/get-scope';
import getDomainByName from '../../util/domains/get-domain-by-name';
import {
  getDomainConfigV6,
  type DomainConfigV6,
} from '../../util/domains/get-domain-config-v6';
import {
  getProjectDomain,
  getProjectDomainByName,
  verifyProjectDomain,
  type ProjectDomain,
} from '../../util/projects/get-project-domain';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  DomainNotFound,
  DomainPermissionDenied,
  isAPIError,
  type APIError,
} from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import { verifySubcommand } from './command';
import { DomainsVerifyTelemetryClient } from '../../util/telemetry/commands/domains/verify';

type DomainOwnership = 'current-scope' | 'other-scope' | 'not-found' | null;

type ProjectStatus =
  | {
      kind: 'attached';
      idOrName: string;
      label: string;
      domain: ProjectDomain;
      verificationError: APIError | null;
    }
  | { kind: 'missing'; idOrName: string }
  | { kind: 'forbidden'; idOrName: string }
  | { kind: 'none' };

interface VerifyOptions {
  domainName: string;
  project: string | undefined;
  strict: boolean;
  json: boolean;
}

interface VerificationReport {
  domainName: string;
  contextName: string;
  ok: boolean;
  config: DomainConfigV6;
  ownership: DomainOwnership;
  intendedNameservers: string[];
  project: ProjectStatus;
}

export default async function verify(client: Client, argv: string[]) {
  const telemetry = new DomainsVerifyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(verifySubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [domainName] = args;
  if (!domainName || args.length !== 1) {
    output.error(
      `${getCommandName('domains verify <domain>')} expects one argument`
    );
    return 1;
  }

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagStrict(flags['--strict']);
  telemetry.trackCliOptionFormat(flags['--format']);

  try {
    return await run(client, {
      domainName,
      project: flags['--project'],
      strict: Boolean(flags['--strict']),
      json: formatResult.jsonOutput,
    });
  } catch (error) {
    printError(error);
    return 1;
  }
}

async function run(client: Client, options: VerifyOptions): Promise<number> {
  const { domainName, json } = options;
  const elapsed = stamp();
  const { contextName } = await getScope(client);

  output.spinner(
    `Checking DNS configuration for ${domainName} under ${chalk.bold(
      contextName
    )}`
  );

  const [config, resolvedProject, owned] = await Promise.all([
    getDomainConfigV6(client, domainName, {
      projectIdOrName: options.project,
      strict: options.strict,
    }),
    resolveProject(client, domainName, options.project),
    lookupOwnership(client, contextName, domainName),
  ]);

  if (isAPIError(config)) {
    return reportError(
      client,
      json,
      config.code || 'api_error',
      configErrorMessage(config, domainName)
    );
  }

  if (resolvedProject.kind === 'forbidden') {
    return reportError(
      client,
      json,
      'forbidden',
      `You don't have access to the project ${resolvedProject.idOrName} under ${contextName}.`
    );
  }

  const project = await triggerVerification(
    client,
    resolvedProject,
    domainName
  );
  const report: VerificationReport = {
    domainName,
    contextName,
    config,
    ownership: owned.ownership,
    intendedNameservers: owned.intendedNameservers,
    project,
    ok: !config.misconfigured && isProjectOk(project),
  };

  output.stopSpinner();
  return json ? renderJson(client, report) : renderHuman(report, elapsed);
}

function isProjectOk(project: ProjectStatus): boolean {
  switch (project.kind) {
    case 'attached':
      return project.domain.verified;
    case 'missing':
      return false;
    default:
      return true;
  }
}

async function resolveProject(
  client: Client,
  domainName: string,
  requestedProject: string | undefined
): Promise<ProjectStatus> {
  if (requestedProject) {
    return resolveRequestedProject(client, domainName, requestedProject);
  }
  return (
    (await findLinkedProjectDomain(client, domainName)) ??
    (await findProjectDomainByName(client, domainName))
  );
}

async function resolveRequestedProject(
  client: Client,
  domainName: string,
  idOrName: string
): Promise<ProjectStatus> {
  const result = await getProjectDomain(client, idOrName, domainName);
  if (!isAPIError(result)) {
    return attachedProject(idOrName, idOrName, result);
  }
  return result.status === 403
    ? { kind: 'forbidden', idOrName }
    : { kind: 'missing', idOrName };
}

async function findLinkedProjectDomain(
  client: Client,
  domainName: string
): Promise<ProjectStatus | null> {
  const link = await getLinkedProject(client);
  if (link.status !== 'linked') {
    return null;
  }
  const result = await getProjectDomain(client, link.project.id, domainName);
  return isAPIError(result)
    ? null
    : attachedProject(link.project.id, link.project.name, result);
}

async function findProjectDomainByName(
  client: Client,
  domainName: string
): Promise<ProjectStatus> {
  const result = await getProjectDomainByName(client, domainName);
  if (isAPIError(result)) {
    return { kind: 'none' };
  }
  const label = await getProjectLabel(client, result.projectId);
  return attachedProject(result.projectId, label, result);
}

function attachedProject(
  idOrName: string,
  label: string,
  domain: ProjectDomain
): ProjectStatus {
  return { kind: 'attached', idOrName, label, domain, verificationError: null };
}

async function getProjectLabel(
  client: Client,
  projectId: string
): Promise<string> {
  try {
    const project = await getProjectByNameOrId(client, projectId);
    return project instanceof Error ? projectId : project.name;
  } catch {
    return projectId;
  }
}

async function lookupOwnership(
  client: Client,
  contextName: string,
  domainName: string
): Promise<{ ownership: DomainOwnership; intendedNameservers: string[] }> {
  try {
    const domain = await getDomainByName(client, contextName, domainName, {
      ignoreWait: true,
    });
    if (domain instanceof DomainPermissionDenied) {
      return { ownership: 'other-scope', intendedNameservers: [] };
    }
    if (domain instanceof DomainNotFound) {
      return { ownership: 'not-found', intendedNameservers: [] };
    }
    return {
      ownership: 'current-scope',
      intendedNameservers: domain.intendedNameservers,
    };
  } catch {
    return { ownership: null, intendedNameservers: [] };
  }
}

async function triggerVerification(
  client: Client,
  project: ProjectStatus,
  domainName: string
): Promise<ProjectStatus> {
  if (project.kind !== 'attached' || project.domain.verified) {
    return project;
  }
  const result = await verifyProjectDomain(
    client,
    project.idOrName,
    domainName
  );
  return isAPIError(result)
    ? { ...project, verificationError: result }
    : { ...project, domain: result };
}

function renderJson(client: Client, report: VerificationReport): number {
  const { config } = report;
  const payload = {
    domain: report.domainName,
    ok: report.ok,
    misconfigured: config.misconfigured,
    configuredBy: config.configuredBy,
    serviceType: config.serviceType,
    ipStatus: config.ipStatus ?? null,
    dnssecEnabled: config.dnssecEnabled ?? null,
    acceptedChallenges: config.acceptedChallenges ?? [],
    current: {
      nameservers: config.nameservers ?? [],
      cnames: config.cnames ?? [],
      aValues: config.aValues ?? [],
    },
    recommended: {
      ipv4: config.recommendedIPv4 ?? [],
      cname: config.recommendedCNAME ?? [],
    },
    conflicts: config.conflicts ?? [],
    domainOwnership: report.ownership,
    project: serializeProject(report.project),
  };
  client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

function serializeProject(project: ProjectStatus) {
  switch (project.kind) {
    case 'none':
      return null;
    case 'attached':
      return {
        idOrName: project.label,
        attached: true,
        verified: project.domain.verified,
        verification: project.domain.verification ?? [],
        verificationError: project.verificationError
          ? {
              code: project.verificationError.code || 'verification_failed',
              message:
                project.verificationError.serverMessage ||
                project.verificationError.message,
            }
          : null,
      };
    default:
      return { idOrName: project.idOrName, attached: false };
  }
}

function renderHuman(
  report: VerificationReport,
  elapsed: () => string
): number {
  if (report.ok) {
    output.success(`${successMessage(report)} ${chalk.gray(elapsed())}`);
    return 0;
  }

  output.log(
    `Checked ${report.domainName} under ${chalk.bold(
      report.contextName
    )} ${chalk.gray(elapsed())}`
  );
  printStatus(report);
  printFixes(report);
  printResolvedValues(report.config);
  printNameservers(report.config);
  return 1;
}

function successMessage(report: VerificationReport): string {
  const configuredBy = describeConfiguredBy(report.config.configuredBy);
  const suffix =
    report.project.kind === 'attached'
      ? ` and verified for project ${chalk.bold(report.project.label)}`
      : '';
  return `${report.domainName} is configured${
    configuredBy ? ` (${configuredBy})` : ''
  }${suffix}`;
}

function describeConfiguredBy(
  configuredBy: DomainConfigV6['configuredBy']
): string | null {
  switch (configuredBy) {
    case 'A':
      return 'A record';
    case 'CNAME':
      return 'CNAME record';
    case 'http':
      return 'HTTP resolution, possibly behind a proxy';
    case 'dns-01':
      return 'DNS-01 challenge only, not yet resolving to Vercel';
    default:
      return null;
  }
}

const good = (text: string) => `${chalk.green(chars.tick)} ${text}`;
const bad = (text: string) => `${chalk.red(chars.cross)} ${text}`;

function printStatus(report: VerificationReport) {
  const rows = [
    [chalk.cyan('DNS Configuration'), dnsStatus(report.config)],
    [chalk.cyan('Project'), projectStatus(report.project, report.contextName)],
  ];
  if (report.ownership === 'other-scope') {
    rows.push([
      chalk.cyan('Ownership'),
      bad(`Not accessible under ${chalk.bold(report.contextName)}`),
    ]);
  }
  if (report.config.dnssecEnabled) {
    rows.push([chalk.cyan('DNSSEC'), chalk.yellow('Enabled')]);
  }

  output.print('\n');
  output.print(chalk.bold('  Status\n\n'));
  output.print(`${indent(table(rows, { hsep: 4 }))}\n`);
  output.print('\n');
}

function dnsStatus(config: DomainConfigV6): string {
  if (config.misconfigured) {
    return bad('Misconfigured');
  }
  const configuredBy = describeConfiguredBy(config.configuredBy);
  return good(`Configured${configuredBy ? ` (${configuredBy})` : ''}`);
}

function projectStatus(project: ProjectStatus, contextName: string): string {
  switch (project.kind) {
    case 'attached':
      return project.domain.verified
        ? good(`Verified for ${chalk.bold(project.label)}`)
        : bad(`Not verified for ${chalk.bold(project.label)}`);
    case 'missing':
      return bad(`Not attached to project ${chalk.bold(project.idOrName)}`);
    default:
      return chalk.gray(`Not attached to any project under ${contextName}`);
  }
}

function printFixes(report: VerificationReport) {
  const steps = [
    scopeHintStep(report),
    pointingStep(report),
    dnssecStep(report.config),
    ...conflictSteps(report.config),
    ...verificationSteps(report.project),
    attachProjectStep(report),
  ].filter((step): step is string => step !== null);

  if (!steps.length) {
    return;
  }

  output.print(chalk.bold('  What to fix\n\n'));
  steps.forEach((step, index) => {
    const text = `    ${chalk.grey(`${index + 1}.`)} ${step}`.replace(
      /[ \t]+$/gm,
      ''
    );
    output.print(`${text}\n${index < steps.length - 1 ? '\n' : ''}`);
  });
  output.print('\n');
}

function scopeHintStep(report: VerificationReport): string | null {
  if (
    report.ownership !== 'other-scope' ||
    report.project.kind === 'attached'
  ) {
    return null;
  }
  return `${report.domainName} exists on Vercel but is not accessible under ${chalk.bold(
    report.contextName
  )}. If it belongs to another team you are a member of, re-run this command with ${code(
    '--scope <team>'
  )} (list your teams with ${code(getCommandName('teams ls'))}).`;
}

function pointingStep(report: VerificationReport): string | null {
  const { config, domainName } = report;
  const needsPointing =
    config.misconfigured &&
    (config.configuredBy === null || config.ipStatus === 'required-change');
  if (!needsPointing) {
    return null;
  }

  const options = buildPointingOptions(
    domainName,
    config,
    report.intendedNameservers
  );
  if (!options.length) {
    return 'Point the domain to Vercel by setting the recommended DNS records for your project.';
  }

  const lines = [
    `Point ${domainName} to Vercel with one of the following options:`,
  ];
  options.forEach((option, index) => {
    const letter = String.fromCharCode(97 + index);
    lines.push('', `${chalk.grey(`${letter})`)} ${option.title}`);
    for (const record of option.records) {
      lines.push(`   ${chalk.cyan(record)}`);
    }
  });
  return lines.join('\n       ');
}

interface PointingOption {
  title: string;
  records: string[];
}

function buildPointingOptions(
  domainName: string,
  config: DomainConfigV6,
  intendedNameservers: string[]
): PointingOption[] {
  const options: PointingOption[] = [];

  const recommendedA =
    config.recommendedIPv4?.find(record => record.rank === 1)?.value ?? [];
  if (recommendedA.length) {
    options.push({
      title: recommendedA.length === 1 ? 'Add an A record:' : 'Add A records:',
      records: recommendedA.map(ip => `A      ${domainName}  ${ip}`),
    });
  }

  const recommendedCNAME = config.recommendedCNAME?.find(
    record => record.rank === 1
  )?.value;
  if (recommendedCNAME) {
    options.push({
      title: 'Add a CNAME record:',
      records: [`CNAME  ${domainName}  ${recommendedCNAME}`],
    });
  }

  if (intendedNameservers.length) {
    options.push({
      title: 'Switch to the Vercel nameservers:',
      records: [...intendedNameservers],
    });
  }

  return options;
}

function dnssecStep(config: DomainConfigV6): string | null {
  if (!config.dnssecEnabled) {
    return null;
  }
  return 'Disable DNSSEC on your DNS provider, or make sure the DS records match your DNS provider keys. Misconfigured DNSSEC prevents the domain from resolving.';
}

function conflictSteps(config: DomainConfigV6): string[] {
  return (config.conflicts ?? []).map(conflict => {
    const caaHint =
      conflict.type === 'CAA'
        ? ' (it prevents Vercel from issuing TLS certificates)'
        : '';
    return `Remove the conflicting ${conflict.type} record ${code(
      `${conflict.type} ${conflict.name} ${conflict.value}`
    )}${caaHint}.`;
  });
}

function verificationSteps(project: ProjectStatus): string[] {
  if (project.kind !== 'attached' || project.domain.verified) {
    return [];
  }

  const steps = (project.domain.verification ?? []).map(
    challenge =>
      `Verify domain ownership by adding the following record to your DNS provider:\n       ${code(
        `${challenge.type} ${challenge.domain} "${challenge.value}"`
      )}`
  );

  if (project.verificationError) {
    const message = `Last attempt: ${
      project.verificationError.serverMessage ||
      project.verificationError.message
    }`;
    if (steps.length) {
      steps[steps.length - 1] += `\n       ${chalk.gray(message)}`;
    } else {
      steps.push(message);
    }
  }

  return steps;
}

function attachProjectStep(report: VerificationReport): string | null {
  if (report.project.kind !== 'missing') {
    return null;
  }
  return `Add the domain to the project by running ${code(
    getCommandName(
      `domains add ${report.domainName} ${report.project.idOrName}`
    )
  )}.`;
}

function printResolvedValues(config: DomainConfigV6) {
  const rows = [
    ...(config.aValues ?? []).map(value => ['A', value]),
    ...(config.cnames ?? []).map(value => ['CNAME', value]),
  ];
  if (!rows.length) {
    return;
  }

  output.print(chalk.bold('  Currently resolves to\n\n'));
  output.print(
    `${indent(
      table([[chalk.gray('Type'), chalk.gray('Value')], ...rows], { hsep: 4 })
    )}\n`
  );
  output.print('\n');
}

function printNameservers(config: DomainConfigV6) {
  const nameservers = config.nameservers ?? [];
  if (!nameservers.length) {
    return;
  }

  output.print(chalk.bold('  Nameservers\n\n'));
  output.print(`${indent(nameservers.join('\n'))}\n`);
  output.print('\n');
}

function indent(block: string): string {
  return block
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');
}

function configErrorMessage(err: APIError, domainName: string): string {
  switch (err.code) {
    case 'invalid_name':
      return `${domainName} is not a valid domain name.`;
    case 'timeout':
      return `Resolving the DNS configuration for ${domainName} timed out. This is usually transient — try again in a few seconds.`;
    case 'unexpected_dns_response':
      return `The nameservers for ${domainName} returned an unexpected response while checking its DNS configuration.`;
    default:
      return err.serverMessage || `API error (${err.status})`;
  }
}

function reportError(
  client: Client,
  json: boolean,
  errorCode: string,
  message: string
): number {
  output.stopSpinner();
  if (json) {
    client.stdout.write(
      `${JSON.stringify({ error: errorCode, message }, null, 2)}\n`
    );
  } else {
    output.error(message);
  }
  return 1;
}
