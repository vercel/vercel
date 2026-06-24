import { AGENT_STATUS } from '../../util/agent-output-constants';
import type { ProjectStatus } from './verify-acquisition';
import type { DnsMethod, DomainDiagnosis, NextStep } from './verify-diagnosis';

export interface StructuredVerificationError {
  reason: string;
  code: string;
  message: string;
  next?: NextStep[];
}

export function renderStructuredOutput(diagnosis: DomainDiagnosis): string {
  const { facts } = diagnosis;
  const { config } = facts;
  const dnsMethods = getDnsMethods(diagnosis);
  const domainConnectMethod = dnsMethods.find(
    method => method.kind === 'domain-connect'
  );
  const domainConnect =
    domainConnectMethod?.kind === 'domain-connect'
      ? domainConnectMethod.configuration
      : null;
  const canRecommendDns =
    diagnosis.configurationStatus !== 'scope-resolution-required' &&
    diagnosis.configurationStatus !== 'project-attachment-recommended' &&
    facts.ownership !== 'platform-managed';
  const payload = {
    status: diagnosis.ok ? AGENT_STATUS.OK : AGENT_STATUS.ACTION_REQUIRED,
    ...diagnosis.details,
    ...(diagnosis.next.length ? { next: diagnosis.next } : {}),
    ...(domainConnect ? { domainConnect } : {}),
    domain: facts.domainName,
    domainStatus: diagnosis.status,
    configurationStatus: diagnosis.configurationStatus,
    ok: diagnosis.ok,
    issues: diagnosis.issues,
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
      ipv4: canRecommendDns ? (config.recommendedIPv4 ?? []) : [],
      cname: canRecommendDns ? (config.recommendedCNAME ?? []) : [],
      records: diagnosis.recommendedDnsRecords,
      nameservers: getRecommendedNameservers(dnsMethods),
    },
    conflicts: diagnosis.steps.flatMap(step =>
      step.kind === 'remove-conflict' ? [step.conflict] : []
    ),
    domainOwnership: facts.ownership,
    project: serializeProject(facts.project),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function renderStructuredError(
  error: StructuredVerificationError
): string {
  return `${JSON.stringify(
    {
      status: AGENT_STATUS.ERROR,
      reason: error.reason,
      error: error.code,
      message: error.message,
      ...(error.next?.length ? { next: error.next } : {}),
    },
    null,
    2
  )}\n`;
}

function getDnsMethods(diagnosis: DomainDiagnosis): DnsMethod[] {
  const step = diagnosis.steps.find(
    candidate => candidate.kind === 'configure-dns'
  );
  return step?.kind === 'configure-dns' ? step.methods : [];
}

function getRecommendedNameservers(methods: DnsMethod[]): string[] {
  const method = methods.find(candidate => candidate.kind === 'nameservers');
  return method?.kind === 'nameservers' ? method.nameservers : [];
}

function serializeProject(project: ProjectStatus) {
  if (project.kind === 'none') {
    return null;
  } else if (project.kind === 'attached') {
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
  } else {
    return { idOrName: project.idOrName, attached: false };
  }
}
