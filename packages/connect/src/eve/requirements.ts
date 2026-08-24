/** Serializable deployment requirement metadata consumed by framework compilers. */
export interface VercelConnectRequirement {
  readonly target: {
    readonly mode: 'direct';
    readonly locator: string;
  };
  readonly connector: {
    readonly type: string;
    readonly configuration?: Readonly<Record<string, unknown>>;
  };
  readonly access: {
    readonly principalTypes: readonly ('app' | 'user')[];
  };
}

export interface VercelConnectRequirementCarrier {
  readonly vercelConnectRequirement: VercelConnectRequirement;
}

export function directConnectRequirement(
  locator: string,
  type: string,
  principalType: 'app' | 'user',
  configuration?: Readonly<Record<string, unknown>>
): VercelConnectRequirement {
  return {
    target: { mode: 'direct', locator },
    connector: {
      type,
      ...(configuration === undefined ? {} : { configuration }),
    },
    access: { principalTypes: [principalType] },
  };
}

export function withConnectRequirement<T extends object>(
  value: T,
  requirement: VercelConnectRequirement
): T & VercelConnectRequirementCarrier {
  return { ...value, vercelConnectRequirement: requirement };
}
