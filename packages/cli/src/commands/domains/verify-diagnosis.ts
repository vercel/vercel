import { parse as parseDomain } from 'tldts';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type {
  DomainConfigConflict,
  DomainConfigV6,
} from '../../util/domains/get-domain-config-v6';
import type { ProjectDomainVerification } from '../../util/projects/get-project-domain';
import type { ProjectStatus, VerificationFacts } from './verify-acquisition';

export type DomainStatus =
  | 'configured-correctly'
  | 'verification-needed'
  | 'invalid-configuration'
  | 'dnssec-needs-to-be-disabled'
  | 'dns-change-required'
  | 'dns-change-recommended'
  | 'project-attachment-recommended'
  | 'scope-resolution-required'
  | 'project-domain-missing';

export type ConfigurationStatus = Exclude<
  DomainStatus,
  'verification-needed' | 'project-domain-missing'
>;

export interface RecommendedDnsRecord {
  type: 'A' | 'CNAME';
  name: string;
  value: string;
  disableProxy?: boolean;
}

export interface DomainConnectConfiguration {
  protocol: 'domain-connect';
  providerId: 'cloudflare.com';
  providerName: 'Cloudflare';
  applyUrl: string;
}

export interface NextStep {
  command: string;
  when?: string;
}

export interface StatusDetails {
  reason: string;
  message: string;
  hint?: string;
  userActionRequired?: boolean;
}

export interface DomainIssue extends StatusDetails {
  domainStatus: Exclude<DomainStatus, 'configured-correctly'>;
}

export type DnsMethod =
  | {
      kind: 'domain-connect';
      configuration: DomainConnectConfiguration;
    }
  | {
      kind: 'a-records' | 'cname-records';
      records: RecommendedDnsRecord[];
    }
  | { kind: 'nameservers'; nameservers: string[] };

export type RemediationStep =
  | {
      kind: 'resolve-scope';
      contextName: string;
      teamsCommand: string;
      verifyCommand: string;
    }
  | {
      kind: 'attach-project';
      mode: 'required' | 'recommended';
      project: string;
      command: string;
    }
  | {
      kind: 'configure-dns';
      change: 'point-domain' | 'required-change' | 'recommended-change';
      methods: DnsMethod[];
    }
  | { kind: 'disable-dnssec' }
  | { kind: 'remove-conflict'; conflict: DomainConfigConflict }
  | {
      kind: 'verify-ownership';
      challenges: ProjectDomainVerification[];
      errorMessage: string | null;
    };

export interface DomainDiagnosis {
  facts: VerificationFacts;
  status: DomainStatus;
  configurationStatus: ConfigurationStatus;
  ok: boolean;
  exitCode: 0 | 1;
  details: StatusDetails;
  issues: DomainIssue[];
  recommendedDnsRecords: RecommendedDnsRecord[];
  steps: RemediationStep[];
  next: NextStep[];
}

export interface DomainDiagnosisCommands {
  teamsList: string;
  verify(scopeOverride?: string): string;
  attachProject(projectIdOrName: string): string;
  openUrl(url: string): string;
}

export function diagnoseDomain(
  facts: VerificationFacts,
  commands: DomainDiagnosisCommands
): DomainDiagnosis {
  const configurationStatus = getConfigurationStatus(facts);
  const status = getDomainStatus(configurationStatus, facts.project);
  const recommendedDnsRecords =
    configurationStatus === 'scope-resolution-required' ||
    isPlatformManagedDomain(facts) ||
    shouldRecommendProjectAttachment(facts)
      ? []
      : getRecommendedDnsRecords(facts);
  const domainConnect =
    configurationStatus === 'scope-resolution-required' ||
    isPlatformManagedDomain(facts) ||
    shouldRecommendProjectAttachment(facts)
      ? null
      : getDomainConnectConfiguration(facts);
  const steps = buildSteps(
    facts,
    commands,
    recommendedDnsRecords,
    domainConnect
  );
  const details = statusDetails(facts, status, steps);
  const issues = getDomainIssues(facts, status, configurationStatus, steps);
  const next = buildNextSteps(steps, commands, status);
  const ok = isOkStatus(status);

  return {
    facts,
    status,
    configurationStatus,
    ok,
    exitCode: ok ? 0 : 1,
    details,
    issues,
    recommendedDnsRecords,
    steps,
    next,
  };
}

function getConfigurationStatus(facts: VerificationFacts): ConfigurationStatus {
  const { config } = facts;
  if (requiresScopeResolution(facts)) {
    return 'scope-resolution-required';
  }
  if (isPlatformManagedDomain(facts)) {
    return config.misconfigured
      ? 'invalid-configuration'
      : 'configured-correctly';
  }
  if (shouldRecommendProjectAttachment(facts)) {
    return 'project-attachment-recommended';
  }
  if (config.serviceType === 'zeit.world' && config.dnssecEnabled) {
    return 'dnssec-needs-to-be-disabled';
  }
  if (config.misconfigured) {
    return 'invalid-configuration';
  }
  if (
    config.ipStatus === 'required-change' &&
    hasRecommendedDnsUpdate(config)
  ) {
    return isOwnedUnattachedHostname(facts)
      ? 'dns-change-recommended'
      : 'dns-change-required';
  }
  if (
    config.ipStatus === 'optional-change' &&
    hasRecommendedDnsUpdate(config)
  ) {
    return 'dns-change-recommended';
  }
  return 'configured-correctly';
}

function getDomainStatus(
  configurationStatus: ConfigurationStatus,
  project: ProjectStatus
): DomainStatus {
  if (configurationStatus === 'scope-resolution-required') {
    return configurationStatus;
  }
  if (project.kind === 'missing') {
    return 'project-domain-missing';
  }
  if (
    configurationStatus !== 'configured-correctly' &&
    configurationStatus !== 'dns-change-recommended'
  ) {
    return configurationStatus;
  }
  if (project.kind === 'attached' && !project.domain.verified) {
    return 'verification-needed';
  }
  return configurationStatus;
}

function getDomainIssues(
  facts: VerificationFacts,
  status: DomainStatus,
  configurationStatus: ConfigurationStatus,
  steps: RemediationStep[]
): DomainIssue[] {
  const statuses: Array<Exclude<DomainStatus, 'configured-correctly'>> = [];
  const addStatus = (candidate: DomainStatus) => {
    if (candidate !== 'configured-correctly' && !statuses.includes(candidate)) {
      statuses.push(candidate);
    }
  };

  addStatus(status);
  if (status !== 'scope-resolution-required') {
    addStatus(configurationStatus);
    if (facts.project.kind === 'missing') {
      addStatus('project-domain-missing');
    } else if (
      facts.project.kind === 'attached' &&
      !facts.project.domain.verified
    ) {
      addStatus('verification-needed');
    }
  }

  return statuses.map(domainStatus => ({
    domainStatus,
    ...statusDetails(facts, domainStatus, steps),
  }));
}

function statusDetails(
  facts: VerificationFacts,
  status: DomainStatus,
  steps: RemediationStep[]
): StatusDetails {
  const { domainName, project } = facts;
  const domainConnect = getDomainConnect(steps);
  const attachProject = steps.find(step => step.kind === 'attach-project');
  if (status === 'configured-correctly') {
    return {
      reason: AGENT_REASON.CONFIGURED_CORRECTLY,
      message:
        project.kind === 'attached'
          ? `${domainName} has a valid configuration and is verified for project ${project.label}.`
          : `${domainName} has a valid configuration.`,
    };
  } else if (status === 'verification-needed') {
    return {
      reason: AGENT_REASON.VERIFICATION_NEEDED,
      message:
        project.kind === 'attached'
          ? `${domainName} needs ownership verification for project ${project.label}.`
          : `${domainName} needs ownership verification.`,
      userActionRequired: true,
      hint: dnsActionHint(
        facts,
        domainConnect,
        'Add one of the project verification records at the DNS provider, then run the suggested verify command.'
      ),
    };
  } else if (status === 'invalid-configuration') {
    if (isPlatformManagedDomain(facts)) {
      return {
        reason: AGENT_REASON.INVALID_CONFIGURATION,
        message: `${domainName} has an invalid Vercel-managed DNS configuration.`,
        userActionRequired: true,
        hint: 'No DNS changes are required from you. Retry the check, then contact Vercel Support if the configuration remains invalid.',
      };
    } else if (attachProject?.kind === 'attach-project') {
      const target =
        attachProject.project === '<project>'
          ? 'a project'
          : `project ${attachProject.project}`;
      const attachInstruction =
        attachProject.project === '<project>'
          ? 'Attach it to a project'
          : 'Attach it';
      return {
        reason: AGENT_REASON.INVALID_CONFIGURATION,
        message: `${domainName} is not attached to ${target} and has an invalid DNS configuration. ${attachInstruction} and apply the recommended DNS changes, then retry verification.`,
        userActionRequired: true,
        hint:
          attachProject.project === '<project>'
            ? 'Replace <project> in next[] with the project that should serve the domain, attach it, apply the recommended records or nameservers at the DNS provider, then run the suggested verify command.'
            : 'Run the domains add command in next[], apply the recommended records or nameservers at the DNS provider, then run the suggested verify command.',
      };
    } else {
      return {
        reason: AGENT_REASON.INVALID_CONFIGURATION,
        message: `${domainName} has an invalid DNS configuration. Apply the recommended DNS changes, then retry verification.`,
        userActionRequired: true,
        hint: dnsActionHint(
          facts,
          domainConnect,
          'Apply the recommended records or nameservers at the DNS provider, then run the suggested verify command.'
        ),
      };
    }
  } else if (status === 'dnssec-needs-to-be-disabled') {
    return {
      reason: AGENT_REASON.DNSSEC_NEEDS_TO_BE_DISABLED,
      message: `${domainName} uses Vercel nameservers, but DNSSEC must be disabled with the domain registrar so the nameservers can resolve globally.`,
      userActionRequired: true,
      hint: 'Disable DNSSEC with the domain registrar, then run the suggested verify command.',
    };
  } else if (status === 'dns-change-required') {
    return {
      reason: AGENT_REASON.DNS_CHANGE_REQUIRED,
      message: `${domainName} requires a DNS change to avoid downtime.`,
      userActionRequired: true,
      hint: dnsActionHint(
        facts,
        domainConnect,
        'Apply the recommended records or nameservers at the DNS provider, then run the suggested verify command.'
      ),
    };
  } else if (status === 'dns-change-recommended') {
    return {
      reason: AGENT_REASON.DNS_CHANGE_RECOMMENDED,
      message: `${domainName} has a valid configuration, but Vercel recommends updating its DNS records.`,
      hint: dnsActionHint(
        facts,
        domainConnect,
        'The domain is working. Apply the recommended DNS update when convenient, then re-check.'
      ),
    };
  } else if (status === 'project-attachment-recommended') {
    return {
      reason: AGENT_REASON.PROJECT_ATTACHMENT_RECOMMENDED,
      message: `${domainName} is owned by ${facts.contextName} but is not attached to a project.`,
      hint: 'To use the domain, replace <project> in next[] with the project that should serve it.',
    };
  } else if (status === 'scope-resolution-required') {
    return {
      reason: AGENT_REASON.SCOPE_NOT_ACCESSIBLE,
      message: `${domainName} exists on Vercel but is not accessible under ${facts.contextName}. Retry under the owning team before evaluating its DNS or project status.`,
      userActionRequired: true,
      hint: 'Use next[] to find the team that owns the domain, then retry in that scope.',
    };
  } else {
    return {
      reason: AGENT_REASON.PROJECT_DOMAIN_MISSING,
      message:
        project.kind === 'missing'
          ? `${domainName} is not attached to project ${project.idOrName}.`
          : `${domainName} is not attached to the requested project.`,
      hint:
        facts.ownership === 'other-scope'
          ? 'Find the team that owns the domain using next[], then retry in that scope before changing project attachments.'
          : 'Run the domains add command in next[], then retry verification.',
    };
  }
}

function dnsActionHint(
  facts: VerificationFacts,
  domainConnect: DomainConnectConfiguration | null,
  manualHint: string
): string {
  if (facts.ownership === 'other-scope' && facts.project.kind !== 'attached') {
    return `Resolve the team that owns the domain using next[] before making DNS or project changes. ${manualHint}`;
  }
  return domainConnect
    ? `Open the Cloudflare Domain Connect URL in next[] to apply the DNS changes automatically. ${manualHint}`
    : manualHint;
}

function buildSteps(
  facts: VerificationFacts,
  commands: DomainDiagnosisCommands,
  recommendedDnsRecords: RecommendedDnsRecord[],
  domainConnect: DomainConnectConfiguration | null
): RemediationStep[] {
  const scope = requiresScopeResolution(facts)
    ? {
        kind: 'resolve-scope' as const,
        contextName: facts.contextName,
        teamsCommand: commands.teamsList,
        verifyCommand: commands.verify('<team>'),
      }
    : null;
  if (scope) {
    return [scope];
  }

  const attachProject = buildAttachProjectStep(facts, commands);
  if (shouldRecommendProjectAttachment(facts)) {
    return attachProject ? [attachProject] : [];
  }

  const steps: RemediationStep[] = [];
  if (attachProject) {
    steps.push(attachProject);
  }

  const configureDns = buildConfigureDnsStep(
    facts,
    recommendedDnsRecords,
    domainConnect
  );
  if (configureDns) {
    steps.push(configureDns);
  }

  if (
    !isPlatformManagedDomain(facts) &&
    facts.config.serviceType === 'zeit.world' &&
    facts.config.dnssecEnabled
  ) {
    steps.push({ kind: 'disable-dnssec' });
  }

  if (!isPlatformManagedDomain(facts)) {
    for (const conflict of facts.config.conflicts ?? []) {
      steps.push({ kind: 'remove-conflict', conflict });
    }
  }

  const verification =
    facts.project.kind === 'attached' && !facts.project.domain.verified
      ? {
          kind: 'verify-ownership' as const,
          challenges: facts.project.domain.verification ?? [],
          errorMessage: facts.project.verificationError
            ? facts.project.verificationError.serverMessage ||
              facts.project.verificationError.message
            : null,
        }
      : null;
  if (verification) {
    steps.push(verification);
  }

  return steps;
}

function buildAttachProjectStep(
  facts: VerificationFacts,
  commands: DomainDiagnosisCommands
): Extract<RemediationStep, { kind: 'attach-project' }> | null {
  return needsProjectAttachment(facts)
    ? {
        kind: 'attach-project',
        mode: facts.config.misconfigured ? 'required' : 'recommended',
        project: '<project>',
        command: commands.attachProject('<project>'),
      }
    : facts.project.kind === 'missing'
      ? {
          kind: 'attach-project',
          mode: 'required',
          project: facts.project.idOrName,
          command: commands.attachProject(facts.project.idOrName),
        }
      : null;
}

function buildConfigureDnsStep(
  facts: VerificationFacts,
  recommendedDnsRecords: RecommendedDnsRecord[],
  domainConnect: DomainConnectConfiguration | null
): Extract<RemediationStep, { kind: 'configure-dns' }> | null {
  if (
    requiresScopeResolution(facts) ||
    isPlatformManagedDomain(facts) ||
    shouldRecommendProjectAttachment(facts) ||
    !needsDnsRecordChange(facts.config)
  ) {
    return null;
  }

  const methods: DnsMethod[] = [];
  if (domainConnect) {
    methods.push({ kind: 'domain-connect', configuration: domainConnect });
  }
  const aRecords = recommendedDnsRecords.filter(record => record.type === 'A');
  const cnameRecords = recommendedDnsRecords.filter(
    record => record.type === 'CNAME'
  );
  if (aRecords.length) {
    methods.push({ kind: 'a-records', records: aRecords });
  }
  if (cnameRecords.length) {
    methods.push({ kind: 'cname-records', records: cnameRecords });
  }
  if (
    facts.intendedNameservers.length &&
    !nameserversMatch(facts.config.nameservers, facts.intendedNameservers)
  ) {
    methods.push({
      kind: 'nameservers',
      nameservers: [...facts.intendedNameservers],
    });
  }

  return {
    kind: 'configure-dns',
    change:
      facts.config.misconfigured && facts.config.configuredBy === null
        ? 'point-domain'
        : facts.config.ipStatus === 'optional-change' ||
            isOwnedUnattachedHostname(facts)
          ? 'recommended-change'
          : 'required-change',
    methods,
  };
}

function buildNextSteps(
  steps: RemediationStep[],
  commands: DomainDiagnosisCommands,
  status: DomainStatus
): NextStep[] {
  const next: NextStep[] = [];
  for (const step of steps) {
    if (step.kind === 'resolve-scope') {
      next.push(
        {
          command: step.teamsCommand,
          when: 'List teams to find the scope that owns the domain',
        },
        {
          command: step.verifyCommand,
          when: 'Replace <team> with the owning team and retry',
        }
      );
    } else if (step.kind === 'attach-project') {
      next.push({
        command: step.command,
        when:
          step.project === '<project>'
            ? 'Replace <project> with the project that should serve the domain'
            : 'Attach the domain to the requested project',
      });
    } else if (step.kind === 'configure-dns') {
      const domainConnectMethod = step.methods.find(
        method => method.kind === 'domain-connect'
      );
      if (domainConnectMethod?.kind === 'domain-connect') {
        next.push({
          command: commands.openUrl(domainConnectMethod.configuration.applyUrl),
          when: 'Open Cloudflare to review and apply the DNS changes automatically with Domain Connect',
        });
      }
    }
  }

  if (
    !steps.some(step => step.kind === 'resolve-scope') &&
    status !== 'configured-correctly' &&
    status !== 'project-attachment-recommended'
  ) {
    next.push({
      command: commands.verify(),
      when:
        status === 'dns-change-recommended'
          ? 'Re-check after applying the recommended DNS change'
          : 'Re-check after completing the required changes',
    });
  }
  return next;
}

function getDomainConnect(
  steps: RemediationStep[]
): DomainConnectConfiguration | null {
  for (const step of steps) {
    if (step.kind !== 'configure-dns') {
      continue;
    }
    const method = step.methods.find(
      candidate => candidate.kind === 'domain-connect'
    );
    if (method?.kind === 'domain-connect') {
      return method.configuration;
    }
  }
  return null;
}

function getRecommendedDnsRecords(
  facts: VerificationFacts
): RecommendedDnsRecord[] {
  const recommendedA =
    facts.config.recommendedIPv4?.find(record => record.rank === 1)?.value ??
    [];
  const recommendedCNAME = facts.config.recommendedCNAME?.find(
    record => record.rank === 1
  )?.value;
  const apexName =
    facts.project.kind === 'attached'
      ? facts.project.domain.apexName
      : parseDomain(facts.domainName.replace(/^\*\./, '')).domain;
  const name = getDnsRecordName(facts.domainName, apexName);
  const disableProxy = isCloudflareDns(facts.config);
  const aRecords: RecommendedDnsRecord[] = recommendedA.map(value => ({
    type: 'A',
    name,
    value,
    ...(disableProxy ? { disableProxy: true } : {}),
  }));
  const cnameRecords: RecommendedDnsRecord[] = recommendedCNAME
    ? [
        {
          type: 'CNAME',
          name,
          value: recommendedCNAME,
          ...(disableProxy ? { disableProxy: true } : {}),
        },
      ]
    : [];
  const isApex = apexName
    ? facts.domainName.toLowerCase() === apexName.toLowerCase()
    : null;
  const preferred =
    isApex === null ? [] : isApex && !disableProxy ? aRecords : cnameRecords;
  return preferred.length ? preferred : [...aRecords, ...cnameRecords];
}

function getDomainConnectConfiguration(
  facts: VerificationFacts
): DomainConnectConfiguration | null {
  if (
    isPlatformManagedDomain(facts) ||
    facts.project.kind !== 'attached' ||
    isWildcardDomain(facts.domainName) ||
    !needsDnsRecordChange(facts.config) ||
    !isCloudflareDns(facts.config)
  ) {
    return null;
  }

  const params = new URLSearchParams();
  if (facts.teamId) {
    params.set('teamId', facts.teamId);
  }
  const query = params.toString();
  const projectId = encodeURIComponent(facts.project.domain.projectId);
  const domain = encodeURIComponent(facts.project.domain.name);
  const applyUrl =
    `https://vercel.com/api/v9/projects/${projectId}/domains/${domain}/domain-connect/apply` +
    (query ? `?${query}` : '');

  return {
    protocol: 'domain-connect',
    providerId: 'cloudflare.com',
    providerName: 'Cloudflare',
    applyUrl,
  };
}

function hasRecommendedDnsUpdate(config: DomainConfigV6): boolean {
  return Boolean(
    config.recommendedIPv4?.some(
      record => record.rank === 1 && record.value.length > 0
    ) ||
      config.recommendedCNAME?.some(
        record => record.rank === 1 && Boolean(record.value)
      )
  );
}

function needsDnsRecordChange(config: DomainConfigV6): boolean {
  return (
    hasRecommendedDnsUpdate(config) &&
    (config.ipStatus === 'required-change' ||
      config.ipStatus === 'optional-change' ||
      (config.misconfigured && config.configuredBy === null))
  );
}

function isOkStatus(status: DomainStatus): boolean {
  return (
    status === 'configured-correctly' ||
    status === 'dns-change-recommended' ||
    status === 'project-attachment-recommended'
  );
}

function isCloudflareDns(config: DomainConfigV6): boolean {
  return (
    config.nameservers.length > 0 &&
    config.nameservers.every(nameserver =>
      nameserver.toLowerCase().replace(/\.$/, '').endsWith('.ns.cloudflare.com')
    )
  );
}

function isWildcardDomain(domainName: string): boolean {
  return domainName.startsWith('*.');
}

function isOwnedUnattachedHostname(facts: VerificationFacts): boolean {
  return facts.ownership === 'current-scope' && facts.project.kind === 'none';
}

function needsProjectAttachment(facts: VerificationFacts): boolean {
  return (
    facts.project.kind === 'none' &&
    (facts.ownership === 'current-scope' || facts.ownership === 'not-found')
  );
}

function shouldRecommendProjectAttachment(facts: VerificationFacts): boolean {
  return (
    isOwnedUnattachedHostname(facts) &&
    !facts.config.misconfigured &&
    !(facts.config.serviceType === 'zeit.world' && facts.config.dnssecEnabled)
  );
}

function requiresScopeResolution(facts: VerificationFacts): boolean {
  return facts.ownership === 'other-scope' && facts.project.kind !== 'attached';
}

function isPlatformManagedDomain(facts: VerificationFacts): boolean {
  return facts.ownership === 'platform-managed';
}

function nameserversMatch(current: string[], intended: string[]): boolean {
  const normalize = (nameservers: string[]) =>
    [...new Set(nameservers.map(normalizeNameserver))].sort();
  const normalizedCurrent = normalize(current);
  const normalizedIntended = normalize(intended);
  return (
    normalizedCurrent.length === normalizedIntended.length &&
    normalizedCurrent.every(
      (nameserver, index) => nameserver === normalizedIntended[index]
    )
  );
}

function normalizeNameserver(nameserver: string): string {
  return nameserver.toLowerCase().replace(/\.$/, '');
}

function getDnsRecordName(
  domain: string,
  apex: string | null | undefined
): string {
  const domainName = domain.toLowerCase();
  const apexName = apex?.toLowerCase();
  if (!apexName) {
    return domain;
  }
  if (domainName === apexName) {
    return '@';
  }
  const suffix = `.${apexName}`;
  return domainName.endsWith(suffix) ? domain.slice(0, -suffix.length) : domain;
}
