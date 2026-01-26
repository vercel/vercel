import chalk from 'chalk';
import table from '../../util/output/table';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import elapsed from '../../util/output/elapsed';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { help } from '../help';
import { contractCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { ContractTelemetryClient } from '../../util/telemetry/commands/contract';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { isErrnoException } from '@vercel/error-utils';
import type { FocusContractCommitment } from '../../util/billing/focus-contract-commitment';
import {
  formatCurrency,
  formatQuantity,
  extractDatePortion,
} from '../../util/billing/format';

export default async function contract(client: Client): Promise<number> {
  const { print, log, error, spinner } = output;

  const flagsSpecification = getFlagsSpecification(contractCommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new ContractTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('contract');
    print(help(contractCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  let contextName: string;
  let teamId: string | undefined;

  try {
    const scope = await getScope(client);
    contextName = scope.contextName;
    teamId = scope.team?.id;
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      error(err.message);
      return 1;
    }
    throw err;
  }

  const start = Date.now();
  if (!asJson) {
    spinner(`Fetching contract commitments for ${chalk.bold(contextName)}`);
  }

  const query = new URLSearchParams();
  if (teamId) {
    query.set('teamId', teamId);
  }

  try {
    const queryString = query.toString();
    const url = queryString
      ? `/v1/billing/contract-commitments?${queryString}`
      : '/v1/billing/contract-commitments';

    const response = await client.fetch(url, {
      json: false,
      useCurrentTeam: false,
    });

    if (!response.ok) {
      error(`Failed to fetch contract commitments: ${response.status}`);
      return 1;
    }

    // Handle empty response body (API returns nothing when no commitments)
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    const commitments: FocusContractCommitment[] = Array.isArray(data)
      ? data
      : [];

    if (asJson) {
      const jsonOutput = {
        context: contextName,
        commitments: commitments.map(c => ({
          contractId: c.ContractId,
          contractPeriodStart: c.ContractPeriodStart,
          contractPeriodEnd: c.ContractPeriodEnd,
          commitmentId: c.ContractCommitmentId,
          commitmentType: c.ContractCommitmentType,
          commitmentCategory: c.ContractCommitmentCategory,
          commitmentPeriodStart: c.ContractCommitmentPeriodStart,
          commitmentPeriodEnd: c.ContractCommitmentPeriodEnd,
          commitmentCost: c.ContractCommitmentCost,
          commitmentQuantity: c.ContractCommitmentQuantity,
          commitmentUnit: c.ContractCommitmentUnit,
          billingCurrency: c.BillingCurrency,
          description: c.ContractCommitmentDescription,
        })),
        totalCommitments: commitments.length,
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
      return 0;
    }

    log(
      `Contract commitments for ${chalk.bold(contextName)} ${elapsed(Date.now() - start)}`
    );
    log('');

    if (commitments.length === 0) {
      log('No contract commitments found.');
      return 0;
    }

    // Group commitments by contract
    const contractGroups = new Map<string, FocusContractCommitment[]>();
    for (const commitment of commitments) {
      const existing = contractGroups.get(commitment.ContractId) || [];
      existing.push(commitment);
      contractGroups.set(commitment.ContractId, existing);
    }

    for (const [contractId, contractCommitments] of contractGroups) {
      const firstCommitment = contractCommitments[0];
      log(chalk.bold(`Contract: ${contractId}`));
      log(
        `${chalk.gray('Period:')} ${extractDatePortion(firstCommitment.ContractPeriodStart)} to ${extractDatePortion(firstCommitment.ContractPeriodEnd)}`
      );
      log('');

      const headers = [
        'Type',
        'Category',
        'Period',
        'Commitment',
        'Description',
      ];
      const rows = contractCommitments.map(c => {
        const periodStr = `${extractDatePortion(c.ContractCommitmentPeriodStart)} - ${extractDatePortion(c.ContractCommitmentPeriodEnd)}`;

        let commitmentValue: string;
        if (
          c.ContractCommitmentCategory === 'Spend' &&
          c.ContractCommitmentCost !== undefined
        ) {
          commitmentValue = formatCurrency(c.ContractCommitmentCost);
        } else if (
          c.ContractCommitmentCategory === 'Usage' &&
          c.ContractCommitmentQuantity !== undefined
        ) {
          commitmentValue = formatQuantity(
            c.ContractCommitmentQuantity,
            c.ContractCommitmentUnit
          );
        } else {
          commitmentValue = '-';
        }

        return [
          c.ContractCommitmentType,
          c.ContractCommitmentCategory,
          periodStr,
          commitmentValue,
          c.ContractCommitmentDescription || '-',
        ];
      });

      const tablePrint = table(
        [headers.map(h => chalk.bold(chalk.cyan(h))), ...rows],
        { hsep: 3, align: ['l', 'l', 'l', 'r', 'l'] }
      ).replace(/^/gm, '  ');

      print(`${tablePrint}\n\n`);
    }

    log(`${chalk.gray('Total commitments:')} ${commitments.length}`);

    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}
