import type Client from '../../util/client';
import {
  upsertScopeBudgetDefault,
  deleteScopeBudgetDefault,
  listScopeBudgetDefaults,
  BUDGET_DEFAULT_APPLIES_TO,
  BUDGET_DEFAULT_COVERED,
  type BudgetDefaultScopeType,
  type BudgetRefreshPeriod,
} from '../../util/ai-gateway/budgets';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandName } from '../../util/pkg-name';
import {
  withWarnings,
  type DeprecatedOptionWarning,
} from '../../util/renamed-option';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';

/**
 * Shared implementation for setting a scope's default budget, used by both
 * `budgets set <scope> --default` and the deprecated `budgets defaults set`
 * while both live. Callers own parsing, validation, and telemetry.
 *
 * `refreshPeriod` is sent only when given: the upsert endpoint preserves the
 * scope's existing cadence when the field is omitted (and defaults a new
 * scope to monthly), so no client-side read is needed.
 */
export async function setScopeDefault(
  client: Client,
  opts: {
    scopeType: BudgetDefaultScopeType;
    limit: number;
    refreshPeriod: BudgetRefreshPeriod | undefined;
    asJson: boolean;
    /** Deprecation warnings for the JSON result. */
    warnings?: ReadonlyArray<DeprecatedOptionWarning | undefined>;
  }
) {
  output.spinner('Setting budget default…');

  try {
    const budgetDefault = await upsertScopeBudgetDefault(client, {
      scopeType: opts.scopeType,
      limitAmount: opts.limit,
      ...(opts.refreshPeriod ? { refreshPeriod: opts.refreshPeriod } : {}),
    });

    output.stopSpinner();

    if (opts.asJson) {
      client.stdout.write(
        `${JSON.stringify(withWarnings(budgetDefault, opts.warnings ?? []), null, 2)}\n`
      );
    } else {
      printAlignedLabel('Set default', opts.scopeType, { gutter: '✓' });
      printAlignedLabel('Limit', `$${budgetDefault.limitAmount}`);
      printAlignedLabel('Refresh', budgetDefault.refreshPeriod);
      printAlignedLabel(
        'Applies to',
        `${BUDGET_DEFAULT_APPLIES_TO[opts.scopeType]}, including existing ones`
      );
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}

/**
 * Shared implementation for removing a scope's default budget, used by both
 * `budgets rm <scope> --default` and the deprecated `budgets defaults remove`
 * while both live. Callers own parsing, validation, and telemetry.
 *
 * Removing a default that does not exist errors instead of reporting success:
 * the confirm copy implies a policy exists, so a no-op must say so.
 */
export async function removeScopeDefault(
  client: Client,
  scopeType: BudgetDefaultScopeType,
  { yes, asJson }: { yes: boolean | undefined; asJson: boolean }
) {
  if (!yes) {
    if (client.nonInteractive || !client.stdin.isTTY) {
      output.error('To remove in non-interactive mode, re-run with --yes.');
      return 1;
    }
  }

  const existing = await listScopeBudgetDefaults(client)
    .then(
      defaults =>
        defaults.find(d => d.scopeType === scopeType && d.active !== false) ??
        null
    )
    .catch(() => undefined);
  if (existing === null) {
    output.error(
      `No ${scopeType} budget default set. Set one with ${getCommandName(`ai-gateway budgets set ${scopeType} --default`)}.`
    );
    return 1;
  }

  if (!yes) {
    const affected = BUDGET_DEFAULT_COVERED[scopeType];
    const confirmed = await client.input.confirm(
      `Remove the ${scopeType} budget default? ${affected} without their own budget will have no default cap.`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  output.spinner('Removing budget default…');

  try {
    await deleteScopeBudgetDefault(client, scopeType);
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ scopeType, removed: true }, null, 2)}\n`
      );
    } else {
      printAlignedLabel('Removed', `${scopeType} default`, { gutter: '✓' });
    }
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
