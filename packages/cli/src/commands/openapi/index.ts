import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { openapiCommand } from './command';
import { OpenapiTelemetryClient } from '../../util/telemetry/commands/openapi';
import { executeApiRequest } from '../api/execute';
import type { ExecuteApiRequestOptions } from '../api/types';
import { buildRequest, generateCurlCommand } from '../api/request-builder';
import { API_BASE_URL } from '../api/constants';
import { OpenApiCache, foldNamingStyle } from '../../util/openapi';
import output from '../../output-manager';
import type { ParsedFlags } from '../api/types';
import {
  formatCliListAll,
  formatOperationDescribe,
  formatTagDescribe,
} from './describe-operation';

function buildUnknownTagMessage(openApi: OpenApiCache, tag: string): string {
  const all = openApi.getAllCliTags();
  const q = tag.trim().toLowerCase();
  const fq = foldNamingStyle(tag);
  const similar = all.filter(t => {
    const ft = foldNamingStyle(t);
    return (
      t.toLowerCase().includes(q) ||
      q.includes(t.toLowerCase()) ||
      ft.includes(fq) ||
      fq.includes(ft)
    );
  });
  const lines = [`No operations found for tag ${JSON.stringify(tag)}.`];
  if (openApi.getCliSupportedEndpoints().length === 0) {
    lines.push(
      'No operations are opted in for `vercel openapi`. Add `x-vercel-cli.supported: true` to operations in the OpenAPI document.'
    );
    return lines.join(' ');
  }
  if (similar.length > 0) {
    lines.push(`Did you mean: ${similar.slice(0, 12).join(', ')}?`);
  }
  lines.push(
    'Run `vercel openapi ls` to see opted-in operations, or `vercel api ls --format json` for all API routes.'
  );
  return lines.join(' ');
}

export default async function openapi(client: Client): Promise<number> {
  const telemetryClient = new OpenapiTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpec = getFlagsSpecification(openapiCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpec, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const needHelp = flags['--help'];

  if (needHelp) {
    telemetryClient.trackCliFlagHelp('openapi');
    output.print(help(openapiCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const first = args[1];
  const second = args[2];
  const third = args[3];

  const isListCommand = first === 'ls' || first === 'list';
  const tag = isListCommand ? second : first;
  const operationId = isListCommand ? third : second;

  if (!first) {
    output.error(
      'Missing argument. Usage: vercel openapi <tag> [<operationId>] [...], vercel openapi <tag> --describe, or vercel openapi ls [tag]'
    );
    return 1;
  }

  if (!isListCommand && !operationId && !flags['--describe']) {
    output.error(
      'Missing operationId. Usage: vercel openapi <tag> <operationId>, or vercel openapi <tag> --describe, or vercel openapi ls [tag]'
    );
    return 1;
  }

  telemetryClient.trackCliArgumentTag(isListCommand ? first : tag);
  if (operationId && !isListCommand) {
    telemetryClient.trackCliArgumentOperationId(operationId);
  }
  if (flags['--describe']) {
    telemetryClient.trackCliFlagDescribe(true);
  }
  telemetryClient.trackCliOptionMethod(flags['--method']);
  telemetryClient.trackCliOptionField(flags['--field']);
  telemetryClient.trackCliOptionRawField(flags['--raw-field']);
  telemetryClient.trackCliOptionHeader(flags['--header']);
  telemetryClient.trackCliOptionInput(flags['--input']);
  if (flags['--paginate']) {
    telemetryClient.trackCliFlagPaginate(true);
  }
  if (flags['--include']) {
    telemetryClient.trackCliFlagInclude(true);
  }
  if (flags['--silent']) {
    telemetryClient.trackCliFlagSilent(true);
  }
  if (flags['--verbose']) {
    telemetryClient.trackCliFlagVerbose(true);
  }
  if (flags['--raw']) {
    telemetryClient.trackCliFlagRaw(true);
  }
  if (flags['--refresh']) {
    telemetryClient.trackCliFlagRefresh(true);
  }
  telemetryClient.trackCliOptionGenerate(flags['--generate']);
  if (flags['--dangerously-skip-permissions']) {
    telemetryClient.trackCliFlagDangerouslySkipPermissions(true);
  }

  if (flags['--dangerously-skip-permissions']) {
    client.dangerouslySkipPermissions = true;
  }

  const openApi = new OpenApiCache();
  const loaded = await openApi.loadWithSpinner(flags['--refresh'] ?? false);
  if (!loaded) {
    output.error('Could not load OpenAPI specification');
    return 1;
  }

  if (isListCommand) {
    if (openApi.getCliSupportedEndpoints().length === 0) {
      output.error(
        'No operations are opted in for `vercel openapi`. Add `x-vercel-cli: { "supported": true }` to operations in the OpenAPI document.'
      );
      return 1;
    }
    if (tag) {
      const byTag = openApi.findEndpointsByTag(tag);
      if (byTag.length === 0) {
        output.error(buildUnknownTagMessage(openApi, tag));
        return 1;
      }
      const displayTag =
        byTag[0]?.tags?.find(
          t => foldNamingStyle(t) === foldNamingStyle(tag)
        ) ?? tag;
      client.stdout.write(formatTagDescribe(displayTag, byTag));
      return 0;
    }
    const tags = openApi.getAllCliTags();
    client.stdout.write(
      formatCliListAll(tags, t => openApi.findEndpointsByTag(t))
    );
    return 0;
  }

  if (!tag) {
    output.error(
      'Missing tag. Usage: vercel openapi <tag> [<operationId>] [...], or vercel openapi ls [tag]'
    );
    return 1;
  }

  if (!operationId && flags['--describe']) {
    const byTag = openApi.findEndpointsByTag(tag);
    if (byTag.length === 0) {
      output.error(buildUnknownTagMessage(openApi, tag));
      return 1;
    }
    const displayTag =
      byTag[0]?.tags?.find(t => foldNamingStyle(t) === foldNamingStyle(tag)) ??
      tag;
    client.stdout.write(formatTagDescribe(displayTag, byTag));
    return 0;
  }

  if (!operationId) {
    return 1;
  }

  const endpoint = openApi.findByTagAndOperationId(tag, operationId);
  if (!endpoint) {
    const raw = openApi.findEndpointByTagAndOperationId(tag, operationId);
    if (raw && !raw.vercelCliSupported) {
      output.error(
        `Operation "${operationId}" exists in the OpenAPI document but is not opted in for \`vercel openapi\`. Add "x-vercel-cli": { "supported": true } to this operation.`
      );
      return 1;
    }
    const altTags = openApi.findTagsForCliSupportedOperationId(operationId);
    if (altTags.length > 0) {
      output.error(
        `No opted-in operation "${operationId}" under tag "${tag}". This operation is available under tags: ${altTags.join(', ')}`
      );
    } else {
      output.error(
        `No opted-in operation with tag "${tag}" and operationId "${operationId}". Run \`vercel openapi ls\` for supported operations.`
      );
    }
    return 1;
  }

  if (!endpoint.path.startsWith('/')) {
    output.error('Resolved endpoint path must start with /');
    return 1;
  }

  try {
    const resolvedUrl = new URL(endpoint.path, API_BASE_URL);
    if (resolvedUrl.origin !== API_BASE_URL) {
      output.error(
        'Invalid endpoint: must be a Vercel API path, not an external URL'
      );
      return 1;
    }
  } catch {
    output.error('Invalid endpoint URL format');
    return 1;
  }

  const finalFlags: ParsedFlags = { ...flags };
  if (!finalFlags['--method']) {
    finalFlags['--method'] = endpoint.method;
  }

  if (flags['--describe']) {
    client.stdout.write(formatOperationDescribe(openApi, endpoint));
    return 0;
  }

  if (flags['--generate'] === 'curl') {
    try {
      const requestConfig = await buildRequest(endpoint.path, finalFlags);
      const curlCmd = generateCurlCommand(
        requestConfig,
        'https://api.vercel.com'
      );
      output.log('');
      output.log('Replace <TOKEN> with your auth token:');
      output.log('');
      client.stdout.write(curlCmd + '\n');
      return 0;
    } catch (err) {
      printError(err);
      return 1;
    }
  }

  const tableOpts: ExecuteApiRequestOptions = {
    vercelCliTable: openApi.getVercelCliTableDisplay(endpoint),
  };
  return executeApiRequest(client, endpoint.path, finalFlags, tableOpts);
}
