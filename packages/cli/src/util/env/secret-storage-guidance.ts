function includesDevelopment(targets: string[]): boolean {
  return targets.length === 0 || targets.includes('development');
}

export type ProductionSecretPolicyErrorKind =
  | 'separate-environments'
  | 'different-values';

export function getProductionSecretPolicyErrorKind(
  message: string
): ProductionSecretPolicyErrorKind | null {
  if (
    /production secrets?.*different value|different value.*production secrets?/i.test(
      message
    )
  ) {
    return 'different-values';
  }
  if (
    /production secrets?.*(?:own environment group|separat)|(?:own environment group|separat).*production secrets?/i.test(
      message
    )
  ) {
    return 'separate-environments';
  }
  return null;
}

export function getProductionSecretPolicyRecovery(
  kind: ProductionSecretPolicyErrorKind
): string {
  return kind === 'different-values'
    ? 'Use different Secret values for Production and non-Production.'
    : 'Create separate Production and non-Production variables with different values.';
}

export function getSecretStorageChoice(
  targets: string[],
  recommendedReason?: string
): string {
  const availability = includesDevelopment(targets)
    ? 'hidden in the dashboard; Development values can be pulled'
    : 'hidden in the dashboard and unavailable to pulls';
  const recommendation = recommendedReason
    ? `; recommended ${recommendedReason}`
    : '';
  return `Secret (${availability}${recommendation})`;
}

export function getDefaultSecretStorageGuidance(targets: string[]): string {
  if (includesDevelopment(targets)) {
    return 'Stored as Secret by default. This value is hidden in the dashboard; Development values can be pulled. Use `--type config` for other values you need to read later.';
  }
  return 'Stored as Secret by default. This value is hidden in the dashboard and unavailable to pulls; use `--type config` for values you need to read later.';
}
