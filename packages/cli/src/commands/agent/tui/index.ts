import type { Target } from '../session';
import type { AgentMessage } from '../types';
import type { ScreenApp } from './ui/screen';
import process from 'node:process';
import { getCommandName } from '../../../util/pkg-name';
import { backgroundFromEnv, queryBackground } from './background';
import { ChatApp } from './chat';
import { SelectList } from './select';
import { applyGrayScale, color, glyph, supportsGrayScale } from './theme';
import { box } from './ui/layout';
import { runFullScreen } from './ui/screen';
import { detectColorDepth, setColorDepth, wrap } from './ui/text';

const terminal = { stdin: process.stdin, stdout: process.stdout };

async function setupColors(): Promise<void> {
  setColorDepth(detectColorDepth(process.env, Boolean(process.stdout.isTTY)));
  if (supportsGrayScale(process.env))
    applyGrayScale(
      backgroundFromEnv(process.env) ??
        (await queryBackground(process.stdin, process.stdout)) ??
        'dark'
    );
}

/** Run the interactive chat until the user quits. Resolves to the exit code. */
export async function startTui(target: Target): Promise<number> {
  let history: AgentMessage[] = [];
  if (!target.session.isNew)
    history = (
      await target.api.getSession(target.context.team.id, target.session.id)
    ).messages;
  await setupColors();
  let lastUrl = target.url;
  await runFullScreen(
    terminal,
    host =>
      new ChatApp(target, host, {
        history,
        onSession: url => {
          lastUrl = url;
        },
      })
  );
  // The alternate screen is gone with its transcript: leave a way back.
  process.stdout.write(
    `${glyph.logo} Vercel Agent session: ${lastUrl}\n  Continue it with: ${getCommandName('agent --continue')}\n`
  );
  return 0;
}

/** Ask once, before the chat starts, whether to run `vercel link`. */
export async function askToLink(
  cwd: string,
  command: string
): Promise<boolean> {
  await setupColors();
  let answer = false;
  await runFullScreen(terminal, (host): ScreenApp => {
    const finish = (link: boolean): void => {
      answer = link;
      host.exit();
    };
    const list = new SelectList(
      [
        { label: `Yes, run \`${command}\``, value: true },
        { label: 'No, continue without a project', value: false, hint: 'esc' },
      ],
      finish,
      () => finish(false)
    );
    return {
      view: width =>
        [
          '',
          ...box(Math.min(width - 2, 90), { color: color.border }, w => [
            [
              {
                text: 'No Vercel project is linked',
                style: { bold: true },
              },
              {
                text: ` to ${cwd}`,
                style: { color: color.muted },
              },
            ],
            ...wrap(
              [
                {
                  text: "Linking gives the agent your project's deployments, logs and settings.",
                  style: { color: color.muted },
                },
              ],
              w
            ),
            [],
            ...list.view(w),
          ]),
        ].map(line =>
          typeof line === 'string' ? [] : [{ text: ' ' }, ...line]
        ),
      handle: event => {
        if (event.kind === 'key' && event.ctrl && event.text === 'c')
          return finish(false);
        if (event.kind === 'key') list.handleKey(event);
        host.render();
      },
    };
  });
  return answer;
}
