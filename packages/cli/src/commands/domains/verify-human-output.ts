import chalk from 'chalk';
import output from '../../output-manager';
import chars from '../../util/output/chars';
import code from '../../util/output/code';
import table from '../../util/output/table';
import type {
  DnsMethod,
  DomainDiagnosis,
  RecommendedDnsRecord,
  RemediationStep,
} from './verify-diagnosis';

export interface HumanVerificationOutput {
  lead: {
    kind: 'success' | 'log';
    message: string;
  };
  sections: string[];
}

export function renderHumanOutput(
  diagnosis: DomainDiagnosis,
  elapsed: string
): HumanVerificationOutput {
  if (
    diagnosis.status === 'configured-correctly' &&
    diagnosis.steps.length === 0
  ) {
    return {
      lead: {
        kind: 'success',
        message: `${successMessage(diagnosis)} ${chalk.gray(elapsed)}`,
      },
      sections: [],
    };
  }

  return {
    lead: {
      kind: 'log',
      message: `Checked ${diagnosis.facts.domainName} under ${chalk.bold(
        diagnosis.facts.contextName
      )} ${chalk.gray(elapsed)}`,
    },
    sections: [
      renderStatus(diagnosis),
      renderFixes(diagnosis),
      renderResolvedValues(diagnosis),
      renderNameservers(diagnosis),
    ].filter((section): section is string => section !== null),
  };
}

function successMessage(diagnosis: DomainDiagnosis): string {
  const { facts } = diagnosis;
  const configuredBy = describeConfiguredBy(facts.config.configuredBy);
  const suffix =
    facts.project.kind === 'attached'
      ? ` and verified for project ${chalk.bold(facts.project.label)}`
      : '';
  return `Valid Configuration: ${facts.domainName} is configured${
    configuredBy ? ` (${configuredBy})` : ''
  }${suffix}`;
}

function describeConfiguredBy(
  configuredBy: DomainDiagnosis['facts']['config']['configuredBy']
): string | null {
  if (configuredBy === 'A') {
    return 'A record';
  } else if (configuredBy === 'CNAME') {
    return 'CNAME record';
  } else if (configuredBy === 'http') {
    return 'HTTP resolution, possibly behind a proxy';
  } else if (configuredBy === 'dns-01') {
    return 'DNS-01 challenge only, not yet resolving to Vercel';
  } else {
    return null;
  }
}

const good = (text: string) => `${chalk.green(chars.tick)} ${text}`;
const bad = (text: string) => `${chalk.red(chars.cross)} ${text}`;
const warning = (text: string) => `${chalk.yellow('!')} ${text}`;

function renderStatus(diagnosis: DomainDiagnosis): string {
  const { facts } = diagnosis;
  const rows = [
    [chalk.cyan('DNS Configuration'), dnsStatus(diagnosis)],
    [chalk.cyan('Project'), projectStatus(diagnosis)],
  ];
  if (facts.ownership === 'other-scope') {
    rows.push([
      chalk.cyan('Ownership'),
      bad(`Not accessible under ${chalk.bold(facts.contextName)}`),
    ]);
  } else if (facts.ownership === 'platform-managed') {
    rows.push([chalk.cyan('Ownership'), good('Managed by Vercel')]);
  }
  if (
    facts.config.dnssecEnabled &&
    diagnosis.configurationStatus !== 'scope-resolution-required'
  ) {
    rows.push([chalk.cyan('DNSSEC'), chalk.yellow('Enabled')]);
  }

  return `\n${chalk.bold('  Status')}\n\n${indent(
    table(rows, { hsep: 4 })
  )}\n\n`;
}

function dnsStatus(diagnosis: DomainDiagnosis): string {
  if (diagnosis.configurationStatus === 'invalid-configuration') {
    return bad('Invalid Configuration');
  } else if (diagnosis.configurationStatus === 'dns-change-required') {
    return bad('DNS Change Required');
  } else if (diagnosis.configurationStatus === 'dnssec-needs-to-be-disabled') {
    return bad('DNSSEC Needs to be Disabled');
  } else if (diagnosis.configurationStatus === 'dns-change-recommended') {
    return warning('DNS Change Recommended');
  } else if (
    diagnosis.configurationStatus === 'project-attachment-recommended'
  ) {
    return chalk.gray('Not assessed without a project');
  } else if (diagnosis.configurationStatus === 'scope-resolution-required') {
    return chalk.gray('Not assessed in this scope');
  } else {
    const configuredBy = describeConfiguredBy(
      diagnosis.facts.config.configuredBy
    );
    return good(
      `Valid Configuration${configuredBy ? ` (${configuredBy})` : ''}`
    );
  }
}

function projectStatus(diagnosis: DomainDiagnosis): string {
  const { facts } = diagnosis;
  if (diagnosis.configurationStatus === 'scope-resolution-required') {
    return chalk.gray('Not assessed in this scope');
  }
  if (facts.project.kind === 'attached') {
    return facts.project.domain.verified
      ? good(`Verified for ${chalk.bold(facts.project.label)}`)
      : bad(`Verification Needed for ${chalk.bold(facts.project.label)}`);
  } else if (facts.project.kind === 'missing') {
    return bad(`Not attached to project ${chalk.bold(facts.project.idOrName)}`);
  } else {
    return chalk.gray(`Not attached to any project under ${facts.contextName}`);
  }
}

function renderFixes(diagnosis: DomainDiagnosis): string | null {
  if (!diagnosis.steps.length) {
    return null;
  }

  const heading = diagnosis.ok ? '  Recommended change' : '  What to fix';
  const body = diagnosis.steps
    .map((step, index) => {
      const rendered = renderStep(diagnosis, step, index);
      const text = `    ${chalk.grey(`${index + 1}.`)} ${rendered}`.replace(
        /[ \t]+$/gm,
        ''
      );
      return `${text}\n`;
    })
    .join('\n');

  return `${chalk.bold(heading)}\n\n${body}\n`;
}

function renderStep(
  diagnosis: DomainDiagnosis,
  step: RemediationStep,
  index: number
): string {
  if (step.kind === 'resolve-scope') {
    return scopeStep(diagnosis, step);
  } else if (step.kind === 'attach-project') {
    return attachProjectStep(diagnosis, step);
  } else if (step.kind === 'configure-dns') {
    return configureDnsStep(diagnosis, step, index);
  } else if (step.kind === 'disable-dnssec') {
    return "Disable DNSSEC with your domain registrar. The domain's nameservers point to Vercel, but DNSSEC prevents them from resolving globally.";
  } else if (step.kind === 'remove-conflict') {
    return conflictStep(step);
  } else {
    return verificationStep(step);
  }
}

function scopeStep(
  diagnosis: DomainDiagnosis,
  step: Extract<RemediationStep, { kind: 'resolve-scope' }>
): string {
  return `${diagnosis.facts.domainName} exists on Vercel but is not accessible under ${chalk.bold(
    step.contextName
  )}. If it belongs to another team you are a member of, list your teams with ${code(
    step.teamsCommand
  )}, then retry with ${code(step.verifyCommand)}.`;
}

function configureDnsStep(
  diagnosis: DomainDiagnosis,
  step: Extract<RemediationStep, { kind: 'configure-dns' }>,
  index: number
): string {
  if (!step.methods.length) {
    const prefix = index > 0 ? 'Then point' : 'Point';
    return `${prefix} the domain to Vercel by setting the recommended DNS records for your project.`;
  }

  const optionPhrase =
    step.methods.length === 1
      ? 'the following option'
      : 'one of the following options';
  const intro =
    step.change === 'point-domain'
      ? `${index > 0 ? 'Then point' : 'Point'} ${
          diagnosis.facts.domainName
        } to Vercel with ${optionPhrase}:`
      : step.change === 'recommended-change'
        ? `Vercel recommends updating the DNS records for ${diagnosis.facts.domainName} with ${optionPhrase}:`
        : `To avoid downtime, update the DNS records for ${diagnosis.facts.domainName} with ${optionPhrase}:`;
  const lines = [intro];
  step.methods.forEach((method, methodIndex) => {
    const letter = String.fromCharCode(97 + methodIndex);
    const title = dnsMethodTitle(method);
    lines.push('', `${chalk.grey(`${letter})`)} ${title}`);
    for (const detail of dnsMethodDetails(method)) {
      lines.push(`   ${detail}`);
    }
  });
  return lines.join('\n       ');
}

function dnsMethodTitle(method: DnsMethod): string {
  if (method.kind === 'domain-connect') {
    return `Auto configure with ${method.configuration.providerName} using Domain Connect:`;
  } else if (method.kind === 'a-records') {
    return method.records.length === 1 ? 'Add an A record:' : 'Add A records:';
  } else if (method.kind === 'cname-records') {
    return 'Add a CNAME record:';
  } else {
    return 'Switch to the Vercel nameservers:';
  }
}

function dnsMethodDetails(method: DnsMethod): string[] {
  if (method.kind === 'domain-connect') {
    const applyUrl = output.link(
      method.configuration.applyUrl,
      method.configuration.applyUrl,
      { fallback: false }
    );
    return [
      applyUrl,
      chalk.gray(
        `Open the URL to review and approve the DNS changes in ${method.configuration.providerName}.`
      ),
    ];
  } else if (method.kind === 'nameservers') {
    return method.nameservers.map(nameserver => chalk.cyan(nameserver));
  } else {
    return method.records.map(record => chalk.cyan(formatDnsRecord(record)));
  }
}

function formatDnsRecord(record: RecommendedDnsRecord): string {
  const columns =
    record.type === 'A'
      ? `A      ${record.name}  ${record.value}`
      : `CNAME  ${record.name}  ${record.value}`;
  return record.disableProxy ? `${columns}  (Proxy: Disabled)` : columns;
}

function conflictStep(
  step: Extract<RemediationStep, { kind: 'remove-conflict' }>
): string {
  const { conflict } = step;
  const caaHint =
    conflict.type === 'CAA'
      ? ' (it prevents Vercel from issuing TLS certificates)'
      : '';
  return `Remove the conflicting ${conflict.type} record ${code(
    `${conflict.type} ${conflict.name} ${conflict.value}`
  )}${caaHint}.`;
}

function verificationStep(
  step: Extract<RemediationStep, { kind: 'verify-ownership' }>
): string {
  if (!step.challenges.length) {
    return step.errorMessage
      ? `Retry domain ownership verification. ${chalk.gray(
          `Last attempt: ${step.errorMessage}`
        )}`
      : 'Retry domain ownership verification for the project.';
  }

  const lines = [
    step.challenges.length === 1
      ? 'Verify domain ownership by adding the following record to your DNS provider. You can remove it after verification is complete:'
      : 'Verify domain ownership by adding one of the following records to your DNS provider. You can remove it after verification is complete:',
  ];
  for (const [index, challenge] of step.challenges.entries()) {
    const record = code(
      `${challenge.type} ${challenge.domain} "${challenge.value}"`
    );
    if (step.challenges.length === 1) {
      lines.push(record);
    } else {
      const letter = String.fromCharCode(97 + index);
      lines.push('', `${chalk.grey(`${letter})`)} ${record}`);
    }
  }
  if (step.errorMessage) {
    lines.push('', chalk.gray(`Last attempt: ${step.errorMessage}`));
  }
  return lines.join('\n       ');
}

function attachProjectStep(
  diagnosis: DomainDiagnosis,
  step: Extract<RemediationStep, { kind: 'attach-project' }>
): string {
  if (step.mode === 'recommended') {
    return `To use ${diagnosis.facts.domainName}, attach it to a project by running ${code(
      step.command
    )}.`;
  }
  if (step.project === '<project>') {
    return `Attach ${
      diagnosis.facts.domainName
    } to the project that should serve it by running ${code(
      step.command
    )}, replacing ${code('<project>')} with the target project.`;
  }
  return `Add the domain to the project by running ${code(step.command)}.`;
}

function renderResolvedValues(diagnosis: DomainDiagnosis): string | null {
  const config = diagnosis.facts.config;
  const rows = [
    ...(config.aValues ?? []).map(value => ['A', value]),
    ...(config.cnames ?? []).map(value => ['CNAME', value]),
  ];
  if (!rows.length) {
    return null;
  }

  return `${chalk.bold('  Currently resolves to')}\n\n${indent(
    table([[chalk.gray('Type'), chalk.gray('Value')], ...rows], { hsep: 4 })
  )}\n\n`;
}

function renderNameservers(diagnosis: DomainDiagnosis): string | null {
  const nameservers = diagnosis.facts.config.nameservers ?? [];
  if (!nameservers.length) {
    return null;
  }
  return `${chalk.bold('  Nameservers')}\n\n${indent(
    nameservers.join('\n')
  )}\n\n`;
}

function indent(block: string): string {
  return block
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');
}
