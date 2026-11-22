import { errorToString } from '@vercel/error-utils';
import type Client from '../../util/client';
import type { Team, User } from '@vercel-internals/types';
import { help } from '../help';
import { pricingCommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { PricingTelemetryClient } from '../../util/telemetry/commands/pricing';
import {
  validateJsonOutput,
  wantsMachineReadableOutput,
} from '../../util/output-format';
import getScope from '../../util/get-scope';
import fetch from '../../util/fetch';
import ua from '../../util/ua';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  featureMatchesQuery,
  isValidPricingTable,
  normalizePlan,
  parsePricingMarkdown,
  splitFeaturesByMinPlan,
  withCurrentPlanAvailability,
} from './parse-pricing';
import { formatPricing } from './format';
import type { PricingResult, TeamPlanInfo } from './types';
import { isAllowedPricingUrl } from './allowed-url';
import {
  PricingResponseTooLargeError,
  readBoundedText,
} from './read-bounded-text';

export const PRICING_URL = 'https://vercel.com/pricing.md';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const UNEXPECTED_PRICING_RESPONSE =
  'Failed to parse Vercel pricing. Unexpected response.';

export default async function pricing(client: Client): Promise<number> {
  const telemetry = new PricingTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(pricingCommand.options);
  const jsonFromArgv = wantsMachineReadableOutput(
    pricingCommand.name,
    client.argv
  );

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    if (jsonFromArgv || shouldEmitNonInteractiveCommandError(client)) {
      return fail(client, true, {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: errorToString(error),
      });
    }
    printError(error, client);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('pricing');
    output.print(
      help(pricingCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    return fail(client, jsonFromArgv, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  const queryParts = parsedArgs.args.slice(1);
  telemetry.trackCliArgumentQuery(
    queryParts.length > 0 ? queryParts : undefined
  );
  const query = queryParts.join(' ').trim() || null;

  const teamInfo = await maybeResolveTeamPlan(client);

  const machineOutput = asJson || shouldEmitNonInteractiveCommandError(client);
  if (!machineOutput) {
    output.spinner('Fetching Vercel pricing…');
  }
  const fetched = await fetchPricingMarkdown(client, asJson);
  if (!machineOutput) {
    output.stopSpinner();
  }
  if (!fetched) {
    return 1;
  }

  const currentPlan = teamInfo?.normalizedPlan ?? null;
  const allFeatures = parsePricingMarkdown(fetched.markdown);
  if (!isValidPricingTable(allFeatures)) {
    fail(client, asJson, {
      reason: AGENT_REASON.API_ERROR,
      message: UNEXPECTED_PRICING_RESPONSE,
    });
    return 1;
  }
  const matched = query
    ? allFeatures.filter(feature => featureMatchesQuery(feature, query))
    : allFeatures;
  const grouped = splitFeaturesByMinPlan(
    withCurrentPlanAvailability(matched, currentPlan)
  );
  const result: PricingResult = {
    plan: teamInfo?.plan ?? null,
    team: teamInfo,
    source: fetched.source,
    query,
    summary: {
      total: allFeatures.length,
      matched: matched.length,
      availableOnCurrentPlan: currentPlan
        ? matched.filter(feature => feature.available[currentPlan]).length
        : null,
      unavailableOnCurrentPlan: currentPlan
        ? matched.filter(feature => !feature.available[currentPlan]).length
        : null,
      hobby: grouped.hobby.length,
      pro: grouped.pro.length,
      enterprise: grouped.enterprise.length,
    },
    features: grouped,
  };

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  output.print(formatPricing(result));
  return 0;
}

export function resolveTeamPlan(
  team: Team | null,
  user: User | null
): TeamPlanInfo {
  const plan = team?.billing?.plan || user?.billing?.plan || 'hobby';
  if (team) {
    return {
      id: team.id,
      slug: team.slug,
      name: team.name,
      plan,
      normalizedPlan: normalizePlan(plan),
    };
  }

  return {
    id: user?.id ?? null,
    slug: 'Personal Account',
    name: user?.username || user?.email || 'Personal Account',
    plan,
    normalizedPlan: normalizePlan(plan),
  };
}

async function maybeResolveTeamPlan(
  client: Client
): Promise<TeamPlanInfo | null> {
  if (!client.authConfig.token) {
    return null;
  }

  try {
    const scope = await getScope(client, { resolveLocalScope: true });
    return resolveTeamPlan(scope.team, scope.user);
  } catch (error) {
    output.debug(
      `Unable to resolve current team plan: ${errorToString(error)}`
    );
    return null;
  }
}

async function fetchPricingMarkdown(
  client: Client,
  asJson: boolean
): Promise<{ markdown: string; source: string } | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timeout.unref?.();
  try {
    let url = PRICING_URL;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (!isAllowedPricingUrl(url)) {
        fail(client, asJson, {
          reason: AGENT_REASON.API_ERROR,
          message: UNEXPECTED_PRICING_RESPONSE,
        });
        return undefined;
      }

      const response = await fetch(url, {
        redirect: 'manual',
        headers: {
          accept: 'text/markdown, text/plain;q=0.9, */*;q=0.8',
          'user-agent': ua,
        },
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get('location');
        if (!location) {
          fail(client, asJson, {
            reason: AGENT_REASON.API_ERROR,
            message: `Failed to fetch Vercel pricing (${response.status}). Try again shortly.`,
          });
          return undefined;
        }
        try {
          url = new URL(location, url).href;
        } catch {
          fail(client, asJson, {
            reason: AGENT_REASON.API_ERROR,
            message: UNEXPECTED_PRICING_RESPONSE,
          });
          return undefined;
        }
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        fail(client, asJson, {
          reason: AGENT_REASON.API_ERROR,
          message: `Failed to fetch Vercel pricing (${response.status}). Try again shortly.`,
        });
        return undefined;
      }

      const markdown = await readBoundedText(response);
      if (!markdown.includes('| Hobby |') || !markdown.includes('| Pro |')) {
        fail(client, asJson, {
          reason: AGENT_REASON.API_ERROR,
          message: UNEXPECTED_PRICING_RESPONSE,
        });
        return undefined;
      }
      return { markdown, source: url };
    }

    fail(client, asJson, {
      reason: AGENT_REASON.API_ERROR,
      message: UNEXPECTED_PRICING_RESPONSE,
    });
    return undefined;
  } catch (error) {
    fail(client, asJson, {
      reason: AGENT_REASON.API_ERROR,
      message:
        error instanceof PricingResponseTooLargeError
          ? UNEXPECTED_PRICING_RESPONSE
          : 'Failed to fetch Vercel pricing. Check your connection and try again.',
    });
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function fail(
  client: Client,
  asJson: boolean,
  payload: { reason: string; message: string }
): 1 {
  if (asJson || shouldEmitNonInteractiveCommandError(client)) {
    writeAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: payload.reason,
      message: payload.message,
    });
  } else {
    output.error(payload.message);
  }
  return 1;
}
