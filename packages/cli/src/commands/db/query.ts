import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import parseTarget from '../../util/parse-target';
import table from '../../util/output/table';
import { validateJsonOutput } from '../../util/output-format';
import { resolveDatabaseScope } from '../../util/db/resolve-scope';
import {
  assertReadonlySql,
  assertSafeSqlInput,
  confirmProductionWrite,
  parseDatabaseRole,
} from '../../util/db/validate';
import { querySubcommand } from './command';
import type {
  DatabaseQueryRequest,
  DatabaseQueryResponse,
  DatabaseRole,
} from './types';
import { DB_QUERY_API_PATH, getDatabaseApiErrorMessage } from './api';

export default async function query(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(querySubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  let sql: string;
  let role: DatabaseRole;
  try {
    sql = assertSafeSqlInput(parsedArgs.args[0]);
    role = parseDatabaseRole(parsedArgs.flags['--role']);
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const environment =
    parseTarget({ flagName: 'environment', flags: parsedArgs.flags }) ||
    'development';

  if (!assertReadonlySql(sql, role)) {
    return 1;
  }

  const confirmation = await confirmProductionWrite(client, {
    environment,
    role,
    confirmed: parsedArgs.flags['--confirm-production-write'],
    reason: parsedArgs.flags['--reason'],
  });
  if (confirmation === 'invalid') {
    return 1;
  }
  if (confirmation === 'canceled') {
    output.log('Canceled. No database operation was performed.');
    return 0;
  }

  const scope = await resolveDatabaseScope(
    client,
    parsedArgs.flags['--project']
  );
  if (typeof scope === 'number') {
    return scope;
  }

  const body: DatabaseQueryRequest = {
    projectId: scope.projectId,
    environment,
    resourceIdOrName: parsedArgs.flags['--resource'],
    role,
    sql,
    reason: parsedArgs.flags['--reason'],
  };

  output.spinner('Running database query');
  let response: DatabaseQueryResponse;
  try {
    response = await client.fetch<DatabaseQueryResponse>(DB_QUERY_API_PATH, {
      method: 'POST',
      accountId: scope.accountId,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    output.error(getDatabaseApiErrorMessage(err));
    return 1;
  } finally {
    output.stopSpinner();
  }

  if (formatResult.jsonOutput) {
    const safeResponse = {
      columns: response.columns,
      rows: response.rows,
      rowCount: response.rowCount,
      durationMs: response.durationMs,
      auditId: response.auditId,
    };
    client.stdout.write(`${JSON.stringify(safeResponse, null, 2)}\n`);
    return 0;
  }

  output.log(
    `Ran ${chalk.bold(role)} query against ${chalk.bold(scope.projectName)} (${environment}).`
  );

  if (response.auditId) {
    output.log(`Audit ID: ${chalk.cyan(response.auditId)}`);
  }

  if (response.durationMs !== undefined) {
    output.log(`Duration: ${response.durationMs}ms`);
  }

  const rows = response.rows ?? [];
  if (rows.length === 0) {
    output.log(`Rows affected: ${response.rowCount ?? 0}`);
    return 0;
  }

  const columns = response.columns ?? Object.keys(rows[0] ?? {});
  const tableRows = [
    columns.map(column => chalk.bold(chalk.cyan(column))),
    ...rows.map(row => columns.map(column => formatCell(row[column]))),
  ];
  output.print('\n' + table(tableRows, { hsep: 3 }) + '\n');
  output.log(`Rows returned: ${response.rowCount ?? rows.length}`);
  return 0;
}

function formatCell(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
