import open from 'open';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  argvHasNonInteractive,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import getScope from '../../util/get-scope';
import {
  VERCEL_WEB_ANALYTICS_PACKAGE,
  WEB_ANALYTICS_AGENT_PR_SUMMARY,
  WEB_ANALYTICS_INTEGRATE_HINT,
  type WebAnalyticsAgentInstallationPayload,
  installVercelWebAnalyticsPackage,
  webAnalyticsAgentInstallationPayload,
  webAnalyticsIntegratePayloadForJson,
} from '../../util/install-vercel-web-analytics-package';
import { webAnalyticsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

interface ToggleResponse {
  value: boolean;
}

async function tryResolveAgentInstallationPayload(
  client: Client,
  projectName: string
): Promise<WebAnalyticsAgentInstallationPayload | null> {
  try {
    const { contextName } = await getScope(client);
    if (!contextName) {
      return null;
    }
    return webAnalyticsAgentInstallationPayload(contextName, projectName);
  } catch {
    return null;
  }
}

async function followUpAgentInstallationInTerminal(
  client: Client,
  agentInstallation: WebAnalyticsAgentInstallationPayload
): Promise<void> {
  const nonInteractive =
    client.nonInteractive || argvHasNonInteractive(client.argv);
  if (nonInteractive) {
    output.log(WEB_ANALYTICS_AGENT_PR_SUMMARY);
    output.log(agentInstallation.dashboardUrl);
    return;
  }
  output.log(
    'Opening the Vercel dashboard to the Web Analytics page. Click Implement to have Vercel Agent open a pull request with the SDK and integration code.'
  );
  try {
    await open(agentInstallation.dashboardUrl);
  } catch (err) {
    output.debug(
      `Failed to open browser: ${err instanceof Error ? err.message : String(err)}`
    );
    output.log(agentInstallation.dashboardUrl);
  }
}

export default async function webAnalytics(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    webAnalyticsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project web-analytics [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  const autoInstall = Boolean(parsedArgs.flags['--auto-install']);

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project web-analytics',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams({ projectId: project.id });
    const result = await client.fetch<ToggleResponse>(
      `/web/insights/toggle?${query.toString()}`,
      {
        method: 'POST',
        json: true,
        body: { value: true },
      }
    );

    const integratePayload = webAnalyticsIntegratePayloadForJson();
    const pipeInstallStdio =
      client.nonInteractive || argvHasNonInteractive(client.argv);

    if (autoInstall) {
      const agentInstallation = await tryResolveAgentInstallationPayload(
        client,
        project.name
      );
      const packageInstall = await installVercelWebAnalyticsPackage({
        cwd: client.cwd,
        pipeStdio: pipeInstallStdio,
      });
      if (!packageInstall.success) {
        if (asJson) {
          client.stdout.write(
            `${JSON.stringify(
              {
                enabled: result.value,
                projectId: project.id,
                projectName: project.name,
                packageInstall,
                integrate: integratePayload,
                ...(agentInstallation && { agentInstallation }),
              },
              null,
              2
            )}\n`
          );
        } else {
          output.error(
            packageInstall.error ??
              `Failed to install ${VERCEL_WEB_ANALYTICS_PACKAGE}.`
          );
          if (agentInstallation) {
            output.log(WEB_ANALYTICS_AGENT_PR_SUMMARY);
            output.log(agentInstallation.dashboardUrl);
          }
        }
        return 1;
      }
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify(
            {
              enabled: result.value,
              projectId: project.id,
              projectName: project.name,
              packageInstall,
              integrate: integratePayload,
              ...(agentInstallation && { agentInstallation }),
            },
            null,
            2
          )}\n`
        );
        return 0;
      }
      output.log(`Web Analytics is enabled for ${project.name}.`);
      output.log(
        `Installed ${VERCEL_WEB_ANALYTICS_PACKAGE}${packageInstall.command ? ` (${packageInstall.command})` : ''}.`
      );
      output.log(WEB_ANALYTICS_INTEGRATE_HINT);
      output.log(`Documentation: ${integratePayload.docsUrl}`);
      if (agentInstallation) {
        await followUpAgentInstallationInTerminal(client, agentInstallation);
      }
      return 0;
    }

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            enabled: result.value,
            projectId: project.id,
            projectName: project.name,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.log(`Web Analytics is enabled for ${project.name}.`);
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'web-analytics',
    });
    printError(err);
    return 1;
  }
}
