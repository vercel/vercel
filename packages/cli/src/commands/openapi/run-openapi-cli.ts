import type Client from '../../util/client';
import { printError } from '../../util/error';
import type { OpenapiTelemetryClient } from '../../util/telemetry/commands/openapi';
import { executeApiRequest } from '../api/execute';
import type { ExecuteApiRequestOptions } from '../api/types';
import { buildRequest, generateCurlCommand } from '../api/request-builder';
import { API_BASE_URL } from '../api/constants';
import { OpenApiCache, foldNamingStyle } from '../../util/openapi';
import { operationDeclaresTeamOrSlugQueryParam } from '../../util/openapi/openapi-operation-cli';
import output from '../../output-manager';
import type { ParsedFlags } from '../api/types';
import {
  formatCliListAll,
  formatOperationDescribe,
  formatTagDescribe,
} from './describe-operation';
import { composeOpenapiInvocationUrlWithPromptsIfNeeded } from './prompt-openapi-invocation';

export function buildUnknownTagMessage(
  openApi: OpenApiCache,
  tag: string
): string {
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
      'No operations are opted in for this mode. Add `x-vercel-cli.supportedSubcommands: true` (or legacy `supported: true`) to operations in the OpenAPI document.'
    );
    return lines.join(' ');
  }
  if (similar.length > 0) {
    lines.push(`Did you mean: ${similar.slice(0, 12).join(', ')}?`);
  }
  lines.push(
    'Run `vercel api` with a matching tag, `vercel api ls` for all routes, or `vercel api ls <tag>` for opted-in operations under a tag.'
  );
  return lines.join(' ');
}

/**
 * OpenAPI tag/operationId CLI (shared by `vercel openapi` and `vercel api` when the first argument matches an opted-in tag).
 *
 * Expects `parseArguments(..., { permissive: true })` where `args[0]` is the subcommand (`openapi` or `api`).
 */
export async function runOpenapiCli(
  client: Client,
  parsedArgs: { args: string[]; flags: Record<string, unknown> },
  telemetryClient: OpenapiTelemetryClient
): Promise<number> {
  const { args, flags } = parsedArgs;
  const f = flags as ParsedFlags & { '--describe'?: boolean };

  const first = args[1];
  const second = args[2];
  const third = args[3];

  const isExplicitList = first === 'ls' || first === 'list';
  const tagArg = isExplicitList ? second : first;
  const operationIdArg = isExplicitList ? third : second;
  const wantsAllTagsList = !first || (isExplicitList && !second);

  telemetryClient.trackCliArgumentTag(tagArg ?? 'ls');
  if (operationIdArg && !isExplicitList) {
    telemetryClient.trackCliArgumentOperationId(operationIdArg);
  }
  if (f['--describe'] || (!isExplicitList && tagArg && !operationIdArg)) {
    telemetryClient.trackCliFlagDescribe(true);
  }
  telemetryClient.trackCliOptionMethod(f['--method']);
  telemetryClient.trackCliOptionField(f['--field']);
  telemetryClient.trackCliOptionRawField(f['--raw-field']);
  telemetryClient.trackCliOptionHeader(f['--header']);
  telemetryClient.trackCliOptionInput(f['--input']);
  if (f['--paginate']) {
    telemetryClient.trackCliFlagPaginate(true);
  }
  if (f['--include']) {
    telemetryClient.trackCliFlagInclude(true);
  }
  if (f['--silent']) {
    telemetryClient.trackCliFlagSilent(true);
  }
  if (f['--verbose']) {
    telemetryClient.trackCliFlagVerbose(true);
  }
  if (f['--raw']) {
    telemetryClient.trackCliFlagRaw(true);
  }
  if (f['--refresh']) {
    telemetryClient.trackCliFlagRefresh(true);
  }
  telemetryClient.trackCliOptionGenerate(f['--generate']);
  if (f['--dangerously-skip-permissions']) {
    telemetryClient.trackCliFlagDangerouslySkipPermissions(true);
  }

  if (f['--dangerously-skip-permissions']) {
    client.dangerouslySkipPermissions = true;
  }

  const openApi = new OpenApiCache();
  const loaded = await openApi.loadWithSpinner(f['--refresh'] ?? false);
  if (!loaded) {
    output.error('Could not load OpenAPI specification');
    return 1;
  }

  if (wantsAllTagsList) {
    if (openApi.getCliSupportedEndpoints().length === 0) {
      output.error(
        'No operations are opted in. Add `x-vercel-cli: { "supportedSubcommands": true }` (or legacy `"supported": true`) to operations in the OpenAPI document.'
      );
      return 1;
    }
    const tags = openApi.getAllCliTags();
    client.stdout.write(
      formatCliListAll(tags, t => openApi.findEndpointsByTag(t))
    );
    return 0;
  }

  if (isExplicitList && second) {
    if (openApi.getCliSupportedEndpoints().length === 0) {
      output.error(
        'No operations are opted in. Add `x-vercel-cli: { "supportedSubcommands": true }` (or legacy `"supported": true`) to operations in the OpenAPI document.'
      );
      return 1;
    }
    const byTag = openApi.findEndpointsByTag(second);
    if (byTag.length === 0) {
      output.error(buildUnknownTagMessage(openApi, second));
      return 1;
    }
    const displayTag =
      byTag[0]?.tags?.find(
        t => foldNamingStyle(t) === foldNamingStyle(second)
      ) ?? second;
    client.stdout.write(formatTagDescribe(displayTag, byTag));
    return 0;
  }

  const tag = first as string;
  const operationId = operationIdArg;

  if (!operationId) {
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

  const endpoint = openApi.findByTagAndOperationId(tag, operationId);
  if (!endpoint) {
    const raw = openApi.findEndpointByTagAndOperationId(tag, operationId);
    if (raw && !raw.vercelCliSupported) {
      output.error(
        `Operation "${operationId}" exists in the OpenAPI document but is not opted in. Add "x-vercel-cli": { "supportedSubcommands": true } (or legacy "supported": true) to this operation.`
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
        `No opted-in operation with tag "${tag}" and operationId "${operationId}". Run \`vercel api\` with a matching tag to list operations.`
      );
    }
    return 1;
  }

  const finalFlags: ParsedFlags = { ...f };
  if (!finalFlags['--method']) {
    finalFlags['--method'] = endpoint.method;
  }

  if (f['--describe']) {
    client.stdout.write(formatOperationDescribe(openApi, endpoint, tag));
    return 0;
  }

  const invocation = await composeOpenapiInvocationUrlWithPromptsIfNeeded(
    client,
    endpoint,
    args
  );
  if ('error' in invocation) {
    output.error(invocation.error);
    return 1;
  }

  const resolvedPath = invocation.url;

  if (!resolvedPath.startsWith('/')) {
    output.error('Resolved endpoint path must start with /');
    return 1;
  }

  try {
    const resolvedUrl = new URL(resolvedPath, API_BASE_URL);
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

  if (f['--generate'] === 'curl') {
    try {
      const requestConfig = await buildRequest(resolvedPath, finalFlags);
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
    useCurrentTeam: operationDeclaresTeamOrSlugQueryParam(endpoint),
  };
  return executeApiRequest(client, resolvedPath, finalFlags, tableOpts);
}
