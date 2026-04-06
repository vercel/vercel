import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import {
  detectExistingDraft,
  offerAutoPublish,
  withGlobalFlags,
  printActionImpactWarning,
} from '../shared';
import { outputAgentError } from '../../../util/agent-output';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import generateFirewallRule from '../../../util/firewall/generate-firewall-rule';
import { formatRuleExpanded } from '../../../util/firewall/format';
import type { FirewallRule } from '../../../util/firewall/types';
import { runInteractiveEditLoop } from './edit-interactive';
import stamp from '../../../util/output/stamp';

interface HandleAIAddOptions {
  prompt?: string;
  name?: string;
  skipPrompts?: boolean;
}

export async function handleAIAdd(
  client: Client,
  project: { id: string; name: string },
  teamId: string | undefined,
  opts: HandleAIAddOptions
): Promise<number> {
  // Get prompt
  let prompt = opts.prompt;
  if (!prompt) {
    if (!client.stdin.isTTY || client.nonInteractive) {
      output.error(
        '--ai requires a description. Example: firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"'
      );
      return 1;
    }
    prompt = await client.input.text({
      message: 'Describe the rule you want to create:',
      validate: (val: string) =>
        val.trim() ? true : 'Please provide a description.',
    });
  }

  // Generate with retry
  let currentRule: FirewallRule | undefined;
  let retryCount = 0;
  const maxRetries = client.nonInteractive ? 1 : 0;

  for (;;) {
    output.spinner('Generating rule with AI...');

    try {
      const response = await generateFirewallRule(
        client,
        project.id,
        {
          prompt,
          ...(currentRule ? { currentRule } : {}),
        },
        { teamId }
      );

      if (response.error) {
        output.stopSpinner();
        if (client.nonInteractive && retryCount < maxRetries) {
          retryCount++;
          output.warn(`AI generation failed: ${response.error}. Retrying...`);
          continue;
        }

        if (client.stdin.isTTY && !client.nonInteractive && !opts.skipPrompts) {
          const retryChoice = await client.input.select({
            message: `AI could not generate a rule: ${response.error}`,
            choices: [
              {
                value: 'retry',
                name: 'Try again with a different description',
              },
              { value: 'cancel', name: 'Cancel' },
            ],
          });
          if (retryChoice === 'cancel') {
            output.log('Canceled');
            return 0;
          }
          prompt = await client.input.text({
            message: 'Describe the rule you want to create:',
            validate: (val: string) =>
              val.trim() ? true : 'Please provide a description.',
          });
          continue;
        }

        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'ai_generation_failed',
              message: `AI could not generate a rule: ${response.error}`,
              next: [
                {
                  command: withGlobalFlags(
                    client,
                    'firewall rules add --ai "more specific prompt" --yes'
                  ),
                  when: 'try with a more specific description',
                },
                {
                  command: withGlobalFlags(
                    client,
                    'firewall rules add "Name" --condition \'{"type":"path","op":"pre","value":"/api"}\' --action deny --yes'
                  ),
                  when: 'create with flags instead',
                },
              ],
            },
            1
          );
        }

        output.error(`AI could not generate a rule: ${response.error}`);
        return 1;
      }

      if (!response.rule) {
        output.stopSpinner();
        if (client.stdin.isTTY && !client.nonInteractive && !opts.skipPrompts) {
          const retryChoice = await client.input.select({
            message: 'AI did not return a rule.',
            choices: [
              {
                value: 'retry',
                name: 'Try again with a different description',
              },
              { value: 'cancel', name: 'Cancel' },
            ],
          });
          if (retryChoice === 'cancel') {
            output.log('Canceled');
            return 0;
          }
          prompt = await client.input.text({
            message: 'Describe the rule you want to create:',
            validate: (val: string) =>
              val.trim() ? true : 'Please provide a description.',
          });
          continue;
        }
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'ai_no_result',
              message:
                'AI did not return a rule. Try a more specific description.',
              next: [
                {
                  command: withGlobalFlags(
                    client,
                    'firewall rules add --ai "more specific prompt" --yes'
                  ),
                  when: 'try with a more specific description',
                },
              ],
            },
            1
          );
        }
        output.error(
          'AI did not return a rule. Try a more specific description.'
        );
        return 1;
      }

      currentRule = response.rule;

      // User-provided name always takes priority over AI-generated name
      if (opts.name) {
        currentRule.name = opts.name;
      }

      output.stopSpinner();
      break;
    } catch (e: unknown) {
      output.stopSpinner();
      const error = e as { message?: string };
      const msg = error.message || 'Failed to generate rule';

      if (client.nonInteractive && retryCount < maxRetries) {
        retryCount++;
        output.warn(`Generation failed: ${msg}. Retrying...`);
        continue;
      }

      if (!client.stdin.isTTY || client.nonInteractive || opts.skipPrompts) {
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'ai_generation_failed',
              message: msg,
              next: [
                {
                  command: withGlobalFlags(
                    client,
                    'firewall rules add --ai "more specific prompt" --yes'
                  ),
                  when: 'try again',
                },
              ],
            },
            1
          );
        }
        output.error(msg);
        return 1;
      }

      // Interactive retry/cancel
      const choice = await client.input.select({
        message: `Generation failed: ${msg}`,
        choices: [
          { value: 'retry', name: 'Try again' },
          { value: 'cancel', name: 'Cancel' },
        ],
      });

      if (choice === 'cancel') {
        output.log('Canceled');
        return 0;
      }
    }
  }

  // Show preview
  const previewRule = {
    ...currentRule,
    id: '(AI-generated)',
  } as FirewallRule;
  output.print(`\n${formatRuleExpanded(previewRule)}\n\n`);

  // Auto-create with --yes
  if (opts.skipPrompts) {
    return createFromGenerated(client, project, teamId, currentRule, opts);
  }

  // Review menu loop
  for (;;) {
    const choice = await client.input.select({
      message: 'What would you like to do?',
      choices: [
        { value: 'create', name: 'Create this rule' },
        { value: 'edit-ai', name: 'Edit with AI (describe changes)' },
        { value: 'edit-manual', name: 'Edit manually (step by step)' },
        { value: 'discard', name: 'Discard' },
      ],
    });

    if (choice === 'create') {
      return createFromGenerated(client, project, teamId, currentRule!, opts);
    }

    if (choice === 'edit-ai') {
      const editPrompt = await client.input.text({
        message: 'Describe the changes you want:',
        validate: (val: string) =>
          val.trim() ? true : 'Please describe the changes.',
      });

      output.spinner('Regenerating rule...');

      try {
        const response: Awaited<ReturnType<typeof generateFirewallRule>> =
          await generateFirewallRule(
            client,
            project.id,
            { prompt: editPrompt, currentRule },
            { teamId }
          );

        output.stopSpinner();

        if (response.error || !response.rule) {
          output.error(
            `AI could not update the rule: ${response.error || 'No rule returned'}`
          );
          // Stay in the loop — user can try again or choose another option
          continue;
        }

        currentRule = response.rule;
        const updatedPreview = {
          ...currentRule,
          id: '(AI-generated)',
        } as FirewallRule;
        output.print(`\n${formatRuleExpanded(updatedPreview)}\n\n`);
        continue;
      } catch (e: unknown) {
        output.stopSpinner();
        const error = e as { message?: string };
        output.error(
          `Failed to regenerate: ${error.message || 'Unknown error'}`
        );
        continue;
      }
    }

    if (choice === 'edit-manual') {
      const prePopulated = {
        ...currentRule!,
        id: '(new)',
      } as FirewallRule;
      const modified = await runInteractiveEditLoop(client, prePopulated);
      if (!modified) {
        continue;
      }
      return createFromGenerated(client, project, teamId, modified, opts);
    }

    if (choice === 'discard') {
      output.log('Discarded');
      return 0;
    }
  }
}

async function createFromGenerated(
  client: Client,
  project: { id: string; name: string },
  teamId: string | undefined,
  rule: FirewallRule,
  opts: HandleAIAddOptions
): Promise<number> {
  const createStamp = stamp();
  output.spinner('Staging rule');

  try {
    const hadExistingDraft = await detectExistingDraft(
      client,
      project.id,
      teamId
    );

    await patchFirewallDraft(
      client,
      project.id,
      {
        action: 'rules.insert',
        id: null,
        value: {
          name: rule.name,
          description: rule.description,
          active: rule.active !== false,
          conditionGroup: rule.conditionGroup,
          action: rule.action,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Rule "${chalk.bold(rule.name)}" staged ${chalk.gray(createStamp())}`
    );
    printActionImpactWarning(rule.action);

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: opts.skipPrompts,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to stage rule';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'staging_failed',
          message: msg,
          next: [
            {
              command: withGlobalFlags(client, 'firewall rules add --yes'),
              when: 'try again',
            },
          ],
        },
        1
      );
    }
    output.error(msg);
    return 1;
  }
}
