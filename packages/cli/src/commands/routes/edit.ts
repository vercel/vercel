import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { editSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRoute,
  offerAutoPromote,
} from './shared';
import {
  runInteractiveEditLoop,
  cloneRoute,
  applyFlagMutations,
  printRouteConfig,
} from './edit-interactive';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import editRoute from '../../util/routes/edit-route';
import { populateRouteEnv } from '../../util/routes/env';
import generateRouteApi, {
  type GeneratedRoute,
  type GenerateRouteResponse,
} from '../../util/routes/generate-route';
import {
  generatedRouteToAddInput,
  convertRouteToCurrentRoute,
  routingRuleToCurrentRoute,
  printGeneratedRoutePreview,
} from '../../util/routes/ai-transform';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { hasAnyTransformFlags } from '../../util/routes/interactive';
import type { RoutingRule } from '../../util/routes/types';

export default async function edit(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, editSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const identifier = args[0];

  // Track telemetry
  const { RoutesEditTelemetryClient } = await import(
    '../../util/telemetry/commands/routes'
  );
  const telemetry = new RoutesEditTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  telemetry.trackCliArgumentNameOrId(identifier);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliOptionName(flags['--name'] as string | undefined);
  telemetry.trackCliOptionDescription(
    flags['--description'] as string | undefined
  );
  telemetry.trackCliOptionSrc(flags['--src'] as string | undefined);
  telemetry.trackCliOptionSrcSyntax(
    flags['--src-syntax'] as string | undefined
  );
  telemetry.trackCliOptionAction(flags['--action'] as string | undefined);
  telemetry.trackCliOptionDest(flags['--dest'] as string | undefined);
  telemetry.trackCliOptionStatus(flags['--status'] as number | undefined);
  telemetry.trackCliFlagNoDest(flags['--no-dest'] as boolean | undefined);
  telemetry.trackCliFlagNoStatus(flags['--no-status'] as boolean | undefined);
  telemetry.trackCliFlagClearConditions(
    flags['--clear-conditions'] as boolean | undefined
  );
  telemetry.trackCliFlagClearHeaders(
    flags['--clear-headers'] as boolean | undefined
  );
  telemetry.trackCliFlagClearTransforms(
    flags['--clear-transforms'] as boolean | undefined
  );
  telemetry.trackCliOptionSetResponseHeader(
    flags['--set-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendResponseHeader(
    flags['--append-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteResponseHeader(
    flags['--delete-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionSetRequestHeader(
    flags['--set-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendRequestHeader(
    flags['--append-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteRequestHeader(
    flags['--delete-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionSetRequestQuery(
    flags['--set-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendRequestQuery(
    flags['--append-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteRequestQuery(
    flags['--delete-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionHas(flags['--has'] as [string] | undefined);
  telemetry.trackCliOptionMissing(flags['--missing'] as [string] | undefined);
  telemetry.trackCliOptionAi(flags['--ai'] as string | undefined);

  if (!identifier) {
    output.error(
      `Route name or ID is required. Usage: ${getCommandName('routes edit <name-or-id>')}`
    );
    return 1;
  }

  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, project.id, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // Fetch all routes
  output.spinner('Fetching routes');
  const { routes } = await getRoutes(client, project.id, { teamId });
  output.stopSpinner();

  if (routes.length === 0) {
    output.error('No routes found in this project.');
    return 1;
  }

  // Resolve the route
  const originalRoute = await resolveRoute(client, routes, identifier);
  if (!originalRoute) {
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  }

  // --- AI edit mode ---
  const aiPrompt = flags['--ai'] as string | undefined;

  if (aiPrompt) {
    // Validate no conflicting flags
    const conflictingFlags = [
      '--name',
      '--description',
      '--src',
      '--src-syntax',
      '--action',
      '--dest',
      '--status',
      '--no-dest',
      '--no-status',
      '--has',
      '--missing',
      '--set-response-header',
      '--append-response-header',
      '--delete-response-header',
      '--set-request-header',
      '--append-request-header',
      '--delete-request-header',
      '--set-request-query',
      '--append-request-query',
      '--delete-request-query',
      '--clear-conditions',
      '--clear-headers',
      '--clear-transforms',
    ];
    const usedConflicts = conflictingFlags.filter(f => flags[f] !== undefined);
    if (usedConflicts.length > 0) {
      output.error(
        `Cannot use --ai with ${usedConflicts.join(', ')}. Use --ai alone to describe changes.`
      );
      return 1;
    }

    return await handleAIEdit(
      client,
      project.id,
      teamId,
      originalRoute,
      aiPrompt,
      skipConfirmation,
      existingStagingVersion
    );
  }

  // Clone the route for mutation
  const route = cloneRoute(originalRoute);

  // Determine mode: flag-based or interactive
  const hasEditFlags =
    flags['--name'] !== undefined ||
    flags['--description'] !== undefined ||
    flags['--src'] !== undefined ||
    flags['--src-syntax'] !== undefined ||
    flags['--action'] !== undefined ||
    flags['--dest'] !== undefined ||
    flags['--status'] !== undefined ||
    flags['--no-dest'] !== undefined ||
    flags['--no-status'] !== undefined ||
    flags['--has'] !== undefined ||
    flags['--missing'] !== undefined ||
    flags['--clear-conditions'] !== undefined ||
    flags['--clear-headers'] !== undefined ||
    flags['--clear-transforms'] !== undefined ||
    hasAnyTransformFlags(flags);

  if (hasEditFlags) {
    // --- Flag-based mode ---
    const error = applyFlagMutations(route, flags);
    if (error) {
      output.error(error);
      return 1;
    }
  } else {
    // --- Interactive mode ---
    if (!client.stdin.isTTY) {
      output.error(
        `No edit flags provided. When running non-interactively, use flags like --name, --dest, --src, etc. Run ${getCommandName('routes edit --help')} for all options.`
      );
      return 1;
    }

    output.log(`\nEditing route "${originalRoute.name}"`);
    printRouteConfig(route);

    // Offer AI or manual editing
    const editMode = await client.input.select({
      message: 'How would you like to edit this route?',
      choices: [
        { name: 'Describe changes (AI-powered)', value: 'ai' },
        { name: 'Edit manually (field by field)', value: 'manual' },
      ],
    });

    if (editMode === 'ai') {
      telemetry.trackCliOptionAi('interactive');
      return await handleAIEdit(
        client,
        project.id,
        teamId,
        originalRoute,
        undefined,
        skipConfirmation,
        existingStagingVersion
      );
    }

    await runInteractiveEditLoop(client, route);
  }

  // Populate env fields for $VAR references
  populateRouteEnv(route.route);

  // Check if anything actually changed
  if (JSON.stringify(route) === JSON.stringify(originalRoute)) {
    output.log('No changes made.');
    return 0;
  }

  // Send the update
  const editStamp = stamp();
  output.spinner(`Updating route "${route.name}"`);

  try {
    const { version } = await editRoute(
      client,
      project.id,
      originalRoute.id,
      {
        route: {
          name: route.name,
          description: route.description,
          enabled: route.enabled,
          srcSyntax: route.srcSyntax,
          route: route.route,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Updated')} route "${route.name}" ${chalk.gray(editStamp())}`
    );

    // Auto-promote offer
    await offerAutoPromote(
      client,
      project.id,
      version,
      !!existingStagingVersion,
      { teamId, skipPrompts: skipConfirmation }
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    output.error(error.message || 'Failed to update route');
    return 1;
  }
}

/**
 * Handles AI-powered route editing.
 * If aiPrompt is provided, uses it directly. Otherwise prompts interactively.
 */
async function handleAIEdit(
  client: Client,
  projectId: string,
  teamId: string | undefined,
  originalRoute: RoutingRule,
  aiPrompt: string | undefined,
  skipConfirmation: boolean | undefined,
  existingStagingVersion: { isStaging?: boolean } | undefined
): Promise<number> {
  // Convert existing route to the /generate format
  const currentRoute = routingRuleToCurrentRoute(originalRoute);

  // Retry loop: if generation fails, let the user rephrase their prompt.
  // Breaks out on success; exits on --yes/non-TTY or user cancel.
  let prompt = aiPrompt;
  let currentGenerated;
  for (;;) {
    if (!prompt) {
      prompt = await client.input.text({
        message: "Describe what you'd like to change:",
        validate: val => {
          if (!val) return 'A description is required';
          if (val.length > 2000)
            return 'Description must be 2000 characters or less';
          return true;
        },
      });
    }

    output.spinner('Generating updated route...');

    let errorMessage: string | undefined;
    try {
      const result = await generateRouteApi(
        client,
        projectId,
        { prompt, currentRoute },
        { teamId }
      );

      if (result.error) {
        errorMessage = result.error;
      } else if (!result.route) {
        errorMessage = 'Could not apply changes. Try rephrasing.';
      } else {
        currentGenerated = result.route;
      }
    } catch (e: unknown) {
      const error = e as { message?: string };
      errorMessage = error.message || 'Failed to generate updated route';
    }

    if (currentGenerated) {
      break;
    }

    output.error(errorMessage!);

    if (skipConfirmation || !client.stdin.isTTY) {
      return 1;
    }

    const retry = await client.input.select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Try again with a different description', value: 'retry' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (retry === 'cancel') {
      output.log('No changes made.');
      return 0;
    }

    // Clear prompt so it's re-prompted on next iteration
    prompt = undefined;
  }

  printGeneratedRoutePreview(currentGenerated);

  // If --yes, apply immediately
  if (skipConfirmation) {
    return await applyAIEdit(
      client,
      projectId,
      teamId,
      originalRoute,
      currentGenerated,
      existingStagingVersion,
      skipConfirmation
    );
  }

  if (!client.stdin.isTTY) {
    output.error(
      `Cannot interactively confirm route changes in a non-TTY environment. Use ${getCommandName('routes edit <name-or-id> --ai "..." --yes')} to skip confirmation.`
    );
    return 1;
  }

  for (;;) {
    const choice = await client.input.select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Confirm changes', value: 'confirm' },
        { name: 'Edit again with AI', value: 'ai-edit' },
        { name: 'Edit manually', value: 'manual' },
        { name: 'Discard', value: 'discard' },
      ],
      pageSize: 4,
      loop: false,
    });

    if (choice === 'confirm') {
      return await applyAIEdit(
        client,
        projectId,
        teamId,
        originalRoute,
        currentGenerated,
        existingStagingVersion,
        skipConfirmation
      );
    }

    if (choice === 'ai-edit') {
      const editPrompt = await client.input.text({
        message: "Describe what you'd like to change:",
        validate: val => {
          if (!val) return 'A description is required';
          if (val.length > 2000)
            return 'Description must be 2000 characters or less';
          return true;
        },
      });

      output.spinner('Updating route...');

      try {
        const editResult: GenerateRouteResponse = await generateRouteApi(
          client,
          projectId,
          {
            prompt: editPrompt,
            currentRoute: convertRouteToCurrentRoute(currentGenerated),
          },
          { teamId }
        );

        if (editResult.error) {
          output.error(editResult.error);
          output.log('Keeping previous route:');
          printGeneratedRoutePreview(currentGenerated);
          continue;
        }
        if (!editResult.route) {
          output.error('Could not apply changes. Try rephrasing.');
          output.log('Keeping previous route:');
          printGeneratedRoutePreview(currentGenerated);
          continue;
        }

        currentGenerated = editResult.route;
        printGeneratedRoutePreview(currentGenerated);
      } catch (e: unknown) {
        const error = e as { message?: string };
        output.error(error.message || 'Failed to update route');
        output.log('Keeping previous route:');
        printGeneratedRoutePreview(currentGenerated);
      }
      continue;
    }

    if (choice === 'manual') {
      // Build an EditableRoute from the AI output for the interactive edit loop
      const routeInput = generatedRouteToAddInput(currentGenerated);
      const manualRoute = cloneRoute(originalRoute);
      manualRoute.name = routeInput.name;
      manualRoute.description = routeInput.description;
      manualRoute.srcSyntax = routeInput.srcSyntax;
      manualRoute.route = routeInput.route;

      await runInteractiveEditLoop(client, manualRoute);
      populateRouteEnv(manualRoute.route);

      const editStamp = stamp();
      output.spinner(`Updating route "${manualRoute.name}"`);
      try {
        const { version } = await editRoute(
          client,
          projectId,
          originalRoute.id,
          {
            route: {
              name: manualRoute.name,
              description: manualRoute.description,
              enabled: manualRoute.enabled,
              srcSyntax: manualRoute.srcSyntax,
              route: manualRoute.route,
            },
          },
          { teamId }
        );
        output.log(
          `${chalk.cyan('Updated')} route "${manualRoute.name}" ${chalk.gray(editStamp())}`
        );
        await offerAutoPromote(
          client,
          projectId,
          version,
          !!existingStagingVersion,
          { teamId, skipPrompts: skipConfirmation }
        );
        return 0;
      } catch (e: unknown) {
        const error = e as { message?: string };
        output.error(error.message || 'Failed to update route');
        return 1;
      }
    }

    // Discard
    output.log('No changes made.');
    return 0;
  }
}

/**
 * Applies an AI-generated edit to a route via PATCH.
 */
async function applyAIEdit(
  client: Client,
  projectId: string,
  teamId: string | undefined,
  originalRoute: RoutingRule,
  generated: GeneratedRoute,
  existingStagingVersion: { isStaging?: boolean } | undefined,
  skipConfirmation: boolean | undefined
): Promise<number> {
  const routeInput = generatedRouteToAddInput(generated);
  populateRouteEnv(routeInput.route);

  const editStamp = stamp();
  output.spinner(`Updating route "${routeInput.name}"`);

  try {
    const { version } = await editRoute(
      client,
      projectId,
      originalRoute.id,
      {
        route: {
          name: routeInput.name,
          description: routeInput.description,
          enabled: originalRoute.enabled,
          srcSyntax: routeInput.srcSyntax,
          route: routeInput.route,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Updated')} route "${routeInput.name}" ${chalk.gray(editStamp())}`
    );

    await offerAutoPromote(
      client,
      projectId,
      version,
      !!existingStagingVersion,
      {
        teamId,
        skipPrompts: skipConfirmation,
      }
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    output.error(error.message || 'Failed to update route');
    return 1;
  }
}
