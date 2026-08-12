import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import getDrainById from '../../util/drains/get-drain-by-id';
import testDrain from '../../util/drains/test-drain';
import { handleDrainsError } from '../../util/drains/error';
import type { DrainDeliveryInput } from '../../util/drains/types';
import { testSubcommand } from './command';

export default async function test(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(testSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const id = parsedArgs.args[0];
  if (!id) {
    output.error(
      `Please provide a drain id. See ${getCommandName('drains test <id>')}`
    );
    return 1;
  }

  telemetry.trackCliArgumentId(id);
  telemetry.trackCliOptionFormat(flags['--format']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let drain;
  try {
    drain = await getDrainById(client, id);
  } catch (err) {
    return handleDrainsError(err);
  }

  if (
    drain.delivery.type !== 'http' &&
    drain.delivery.type !== 'otlphttp' &&
    drain.delivery.type !== 's3'
  ) {
    output.error(
      `Can't test a ${drain.delivery.type} drain. Only http, otlphttp, and s3 drains are supported.`
    );
    return 1;
  }

  // Re-send the drain's own configuration to the validation endpoint.
  // Integration-managed secrets (placeholder objects) can't be re-sent.
  const delivery = structuredClone(drain.delivery) as DrainDeliveryInput;
  if ('secret' in delivery && typeof delivery.secret !== 'string') {
    delete delivery.secret;
  }

  const testStamp = stamp();
  let result;
  try {
    result = await testDrain(client, {
      schemas: drain.schemas,
      delivery,
    });
  } catch (err) {
    return handleDrainsError(err);
  }

  const passed = !result.error;

  if (asJson) {
    const payload: {
      id: string;
      passed: boolean;
      error?: string;
      endpoint?: string;
    } = { id, passed };
    if (result.error !== undefined) {
      payload.error = result.error;
    }
    if (result.endpoint !== undefined) {
      payload.endpoint = result.endpoint;
    }
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return passed ? 0 : 1;
  }

  if (!passed) {
    output.error(`Test delivery failed: ${result.error}`);
    return 1;
  }

  output.success(
    `Test event delivered for drain ${chalk.gray(id)} ${chalk.gray(testStamp())}`
  );
  return 0;
}
