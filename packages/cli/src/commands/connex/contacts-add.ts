import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import { selectConnexTeam } from '../../util/connex/select-team';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { validateJsonOutput } from '../../util/output-format';
import { ContactsAddTelemetryClient } from '../../util/telemetry/commands/connex/contacts';
import { contactsAddSubcommand } from './command';

interface ContactVerification {
  status?: string;
  verified?: boolean;
  instructions?: string;
}

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ContactsAddTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(
    contactsAddSubcommand.options
  );

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;
  telemetry.trackCliArgumentConnector(args[0]);
  telemetry.trackCliOptionPhoneNumber(flags['--phone-number']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const connector = args[0];
  if (!connector) {
    output.error(
      'Missing connector ID or UID. Usage: vercel connect contacts add <connector> --phone-number <phone-number>'
    );
    return 1;
  }

  const phoneNumber = flags['--phone-number'];
  if (!phoneNumber) {
    output.error('Missing phone number. Provide one with `--phone-number`.');
    return 1;
  }
  if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
    output.error(
      'Invalid phone number. Provide an E.164 number (e.g. +12025551234).'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this connector');

  output.spinner('Adding contact…');
  let verification: ContactVerification;
  try {
    verification = await client.fetch<ContactVerification>(
      `/v1/connect/connectors/${encodeURIComponent(connector)}/contacts`,
      { method: 'POST', body: { phoneNumber } }
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
  output.stopSpinner();

  if (formatResult.jsonOutput) {
    client.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
    return 0;
  }

  const safePhoneNumber = sanitizeForTerminal(phoneNumber);
  output.success(`Contact ${chalk.bold(safePhoneNumber)} added.`);
  if (verification.instructions) {
    output.log(sanitizeForTerminal(verification.instructions));
  }
  return 0;
}
