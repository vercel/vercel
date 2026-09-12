import type {
  Flag,
  FlagEnvironmentConfig,
  FlagOutcome,
  FlagRolloutOutcome,
  FlagSplitOutcome,
} from './types';

type VariantReferencePaths = Map<string, string[]>;

export function findVariantReferencePaths(
  flag: Pick<Flag, 'environments'>,
  variantIds: Iterable<string>
): VariantReferencePaths {
  const trackedVariantIds = new Set(variantIds);
  const references = new Map<string, Set<string>>();

  for (const [environmentName, environmentConfig] of Object.entries(
    flag.environments
  )) {
    collectEnvironmentReferencePaths(
      environmentName,
      environmentConfig,
      trackedVariantIds,
      references
    );
  }

  return new Map(
    Array.from(references.entries(), ([variantId, paths]) => [
      variantId,
      Array.from(paths).sort(),
    ])
  );
}

function collectEnvironmentReferencePaths(
  environmentName: string,
  environmentConfig: FlagEnvironmentConfig,
  trackedVariantIds: Set<string>,
  references: Map<string, Set<string>>
) {
  collectOutcomeReferencePaths(
    environmentConfig.pausedOutcome,
    `${environmentName}.pausedOutcome`,
    trackedVariantIds,
    references
  );
  collectOutcomeReferencePaths(
    environmentConfig.fallthrough,
    `${environmentName}.fallthrough`,
    trackedVariantIds,
    references
  );

  for (const [ruleIndex, rule] of environmentConfig.rules.entries()) {
    collectOutcomeReferencePaths(
      rule.outcome,
      `${environmentName}.rules[${ruleIndex}].outcome`,
      trackedVariantIds,
      references
    );
  }

  if (!environmentConfig.targets) {
    return;
  }

  for (const [variantId, entityKinds] of Object.entries(
    environmentConfig.targets
  )) {
    if (!trackedVariantIds.has(variantId)) {
      continue;
    }

    for (const [entityKind, attributes] of Object.entries(entityKinds)) {
      for (const [attribute, values] of Object.entries(attributes)) {
        if (values.length === 0) {
          continue;
        }

        addReferencePath(
          references,
          variantId,
          `${environmentName}.targets.${entityKind}.${attribute}`
        );
      }
    }
  }
}

function collectOutcomeReferencePaths(
  outcome: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome | undefined,
  basePath: string,
  trackedVariantIds: Set<string>,
  references: Map<string, Set<string>>
) {
  if (!outcome) {
    return;
  }

  switch (outcome.type) {
    case 'variant':
      if (trackedVariantIds.has(outcome.variantId)) {
        addReferencePath(references, outcome.variantId, basePath);
      }
      return;
    case 'split':
      collectSplitOutcomeReferencePaths(
        outcome,
        basePath,
        trackedVariantIds,
        references
      );
      return;
    case 'rollout':
      collectRolloutOutcomeReferencePaths(
        outcome,
        basePath,
        trackedVariantIds,
        references
      );
      return;
    default:
      return;
  }
}

function collectSplitOutcomeReferencePaths(
  outcome: FlagSplitOutcome,
  basePath: string,
  trackedVariantIds: Set<string>,
  references: Map<string, Set<string>>
) {
  if (trackedVariantIds.has(outcome.defaultVariantId)) {
    addReferencePath(
      references,
      outcome.defaultVariantId,
      `${basePath}.default`
    );
  }

  for (const variantId of Object.keys(outcome.weights)) {
    if (!trackedVariantIds.has(variantId)) {
      continue;
    }

    addReferencePath(references, variantId, `${basePath}.weights.${variantId}`);
  }
}

function collectRolloutOutcomeReferencePaths(
  outcome: FlagRolloutOutcome,
  basePath: string,
  trackedVariantIds: Set<string>,
  references: Map<string, Set<string>>
) {
  if (trackedVariantIds.has(outcome.rollFromVariantId)) {
    addReferencePath(references, outcome.rollFromVariantId, `${basePath}.from`);
  }

  if (trackedVariantIds.has(outcome.rollToVariantId)) {
    addReferencePath(references, outcome.rollToVariantId, `${basePath}.to`);
  }

  if (trackedVariantIds.has(outcome.defaultVariantId)) {
    addReferencePath(
      references,
      outcome.defaultVariantId,
      `${basePath}.default`
    );
  }
}

function addReferencePath(
  references: Map<string, Set<string>>,
  variantId: string,
  path: string
) {
  let paths = references.get(variantId);
  if (!paths) {
    paths = new Set<string>();
    references.set(variantId, paths);
  }

  paths.add(path);
}
