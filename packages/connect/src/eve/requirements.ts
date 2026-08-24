/**
 * Serializable provisioning metadata consumed by frameworks at build time.
 * It declares a project-local Connect reference, never a connector id or a
 * credential. Connect control-plane APIs resolve the reference per deployment.
 */
export interface VercelConnectRequirement {
  readonly reference: string;
  readonly connector: {
    readonly type: string;
    readonly configuration?: Readonly<Record<string, unknown>>;
  };
  readonly access: {
    readonly principalTypes: readonly ('app' | 'user')[];
  };
}

export interface VercelConnectRequirementCarrier {
  readonly vercelConnect: VercelConnectRequirement;
}

export function connectRequirement(
  reference: string,
  connector: VercelConnectRequirement['connector'],
  principalType: 'app' | 'user'
): VercelConnectRequirement {
  if (reference.length === 0) {
    throw new Error('Vercel Connect requirement reference must not be empty.');
  }
  return {
    reference,
    connector,
    access: { principalTypes: [principalType] },
  };
}

export function withConnectRequirement<T extends object>(
  value: T,
  requirement: VercelConnectRequirement
): T & VercelConnectRequirementCarrier {
  return { ...value, vercelConnect: requirement };
}
