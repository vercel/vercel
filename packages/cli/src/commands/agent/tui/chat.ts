import type { Target } from '../session';
import type { PendingApproval, TurnState } from '../stream';
import type { TurnInput } from '../turn';
import type { AgentMessage } from '../types';
import type { PlanProgress } from './plan';
import type { InputEvent, KeyEvent, MouseEvent } from './ui/keys';
import type { Host, ScreenApp } from './ui/screen';
import type { Line } from './ui/text';
import { sessionUrl } from '../api';
import { toUserContext } from '../context';
import { newSession } from '../session';
import { findPendingApproval } from '../stream';
import { runTurn } from '../turn';
import { COMMANDS, matchCommands, relativeTime } from './commands';
import { editorOf } from './editor';
import { planChecklist, renderMessage, renderUserPrompt } from './message';
import { foldPlan } from './plan';
import { PromptEditor } from './prompt';
import { SelectList } from './select';
import { footerLine, spinnerLine } from './status';
import { color, glyph } from './theme';
import { box, hang } from './ui/layout';
import { truncate, wrap } from './ui/text';

type Entry =
  | { kind: 'header' }
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; message: AgentMessage; planBefore?: PlanProgress }
  | { kind: 'info' | 'error'; text: string };

type Mode = 'input' | 'streaming' | 'approval';

type Picker =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; list?: SelectList<string> };

const SHORTCUTS = [
  ['enter', 'send'],
  ['shift+enter · \\+enter', 'new line'],
  ['↑ ↓', 'prompt history'],
  ['esc', 'interrupt'],
  ['click ▸', 'expand tool calls or thinking'],
  ['ctrl+o', 'expand everything'],
  ['pgup pgdn · wheel', 'scroll'],
  ['ctrl+c', 'clear input · twice to exit'],
  ['enter while working', 'queue a message'],
  ['/', 'commands'],
] as const;

const HELP = [
  ...COMMANDS.map(c => `${c.name.padEnd(10)} ${c.description}`),
  '',
  ...SHORTCUTS.map(([keys, action]) => `${keys.padEnd(26)} ${action}`),
].join('\n');

function historyEntries(messages: AgentMessage[]): Entry[] {
  return messages.flatMap((message): Entry[] => {
    if (message.role === 'assistant') {
      return [{ kind: 'assistant', message }];
    }
    const text = message.parts
      .map(p => ('text' in p && p.type === 'text' ? String(p.text) : ''))
      .join('')
      .trim();
    return text ? [{ kind: 'user', text }] : [];
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ChatOptions {
  /** Transcript of a resumed session. */
  history?: AgentMessage[];
  /** Told about every session the chat shows, so the caller can print the last one on exit. */
  onSession?: (url: string) => void;
}

/** The full-screen chat: a scrolling transcript above a docked prompt. */
export class ChatApp implements ScreenApp {
  private entries: Entry[] = [];
  /** Plan progress after every finished entry. */
  private plan: PlanProgress | undefined;
  private session: Target['session'];
  private url = '';
  private mode: Mode = 'input';
  private pending: PendingApproval | undefined;
  private approval: SelectList<boolean> | undefined;
  private picker: Picker | undefined;
  private live: TurnState | null = null;
  private abort: AbortController | null = null;
  private turnStarted = 0;
  private prompt = new PromptEditor(text => this.submit(text));
  /** Messages typed while the agent works; sent together when the turn ends. */
  private queue: string[] = [];
  private rejected = false;
  private showShortcuts = false;
  private menuIndex = 0;
  private verbose = false;
  /** Tool groups and thoughts the user expanded. */
  private expanded = new Set<string>();
  /** Time of the first Ctrl+C on an empty prompt; a second one within 2s exits. */
  private exitArmedAt = 0;
  private tick: ReturnType<typeof setInterval> | undefined;
  /** Scrolling: the transcript follows new output until the user scrolls up. */
  private following = true;
  private offset = 0;
  /** From the last frame: what scrolling and clicks need. */
  private frame = {
    offset: 0,
    max: 0,
    viewport: 0,
    toggles: new Map<number, string>(),
  };

  constructor(
    private target: Target,
    private host: Host,
    private options: ChatOptions = {}
  ) {
    this.session = target.session;
    this.load(target.session, options.history ?? []);
  }

  /** Start over on a session: `/new`, `/clear` and `/resume` all land here. */
  private load(session: Target['session'], history: AgentMessage[]): void {
    this.session = session;
    this.url = sessionUrl(this.target.context.team.slug, session.id);
    this.plan = undefined;
    this.entries = [];
    this.push({ kind: 'header' }, ...historyEntries(history));
    this.pending = findPendingApproval(history);
    this.setMode(this.pending ? 'approval' : 'input');
    this.prompt = new PromptEditor(text => this.submit(text));
    this.prompt.history = this.entries.flatMap(e =>
      e.kind === 'user' ? [e.text] : []
    );
    this.queue = [];
    this.rejected = false;
    this.expanded.clear();
    this.following = true;
    this.options.onSession?.(this.url);
  }

  private push(...entries: Entry[]): void {
    for (const entry of entries) {
      if (entry.kind === 'assistant') {
        this.entries.push({ ...entry, planBefore: this.plan });
        this.plan = foldPlan(this.plan, entry.message.parts);
      } else {
        this.entries.push(entry);
      }
    }
    this.host.render();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.approval =
      mode === 'approval'
        ? new SelectList(
            [
              { label: 'Yes, run it', value: true },
              {
                label: 'No, and tell Vercel Agent what to do instead',
                value: false,
                hint: 'esc',
              },
            ],
            approved => this.decide(approved),
            () => this.decide(false)
          )
        : undefined;
    // Spinner and blinking marks animate while the agent works.
    clearInterval(this.tick);
    this.tick =
      mode === 'streaming'
        ? setInterval(() => this.host.render(), 80)
        : undefined;
    this.host.render();
  }

  private async send(input: TurnInput): Promise<void> {
    const controller = new AbortController();
    this.abort = controller;
    this.live = null;
    this.turnStarted = Date.now();
    this.setMode('streaming');
    const { api, context } = this.target;
    try {
      const result = await runTurn({
        api,
        teamId: context.team.id,
        sessionId: this.session.id,
        isNew: this.session.isNew,
        input,
        userContext: toUserContext(context),
        signal: controller.signal,
        onChunk: (_, state) => {
          this.live = state;
        },
      });
      this.session = { ...this.session, isNew: false };
      this.live = null;
      this.push({ kind: 'assistant', message: result.state.message });
      if (result.state.error)
        this.push({ kind: 'error', text: result.state.error });
      this.pending = result.pending;
      this.setMode(
        result.status === 'approval-required' ? 'approval' : 'input'
      );
    } catch (error) {
      this.session = { ...this.session, isNew: false };
      const partial = this.live as TurnState | null;
      this.live = null;
      if (partial?.message.parts.length)
        this.push({ kind: 'assistant', message: partial.message });
      this.push(
        controller.signal.aborted
          ? { kind: 'info', text: 'Interrupted.' }
          : {
              kind: 'error',
              text: errorText(error),
            }
      );
      this.setMode('input');
    } finally {
      this.abort = null;
    }
    if (!controller.signal.aborted) this.sendQueued();
  }

  private sendQueued(): void {
    // A plan waiting for a decision keeps the queue until it is answered.
    if (!this.queue.length || this.pending) return;
    const text = this.queue.join('\n');
    this.queue = [];
    this.push({ kind: 'user', text });
    void this.send({ text });
  }

  private interrupt(): void {
    this.abort?.abort();
    this.target.api
      .interrupt(this.target.context.team.id, this.session.id)
      .catch(() => {});
    // Like Claude Code: queued messages come back to the prompt instead of being sent.
    if (this.queue.length) {
      this.prompt.set(
        editorOf(
          [...this.queue, this.prompt.editor.value].filter(Boolean).join('\n')
        )
      );
      this.queue = [];
    }
  }

  private submit(value: string): void {
    const text = value.trim();
    this.prompt.clear();
    this.showShortcuts = false;
    if (!text) return;
    if (this.mode === 'streaming') {
      if (text.startsWith('/')) {
        this.push({
          kind: 'info',
          text: 'Commands work once the agent is idle. Press Esc to interrupt it.',
        });
        return;
      }
      this.queue.push(text);
      this.prompt.history.push(text);
      return;
    }
    if (text.startsWith('/') && this.runCommand(text)) return;
    this.rejected = false;
    this.following = true;
    this.prompt.history.push(text);
    this.push({ kind: 'user', text });
    void this.send({ text });
  }

  /** Returns `false` for unknown commands, which are sent as prompts. */
  private runCommand(name: string): boolean {
    this.prompt.clear();
    switch (name) {
      case '/exit':
      case '/quit':
        this.exit();
        return true;
      case '/help':
        this.push({ kind: 'info', text: HELP });
        return true;
      case '/new':
      case '/clear':
        this.load(newSession(), []);
        return true;
      case '/resume':
        this.openPicker();
        return true;
      case '/browser':
        void import('../browser')
          .then(({ openInBrowser }) => openInBrowser(this.url))
          .then(opened =>
            this.push(
              opened
                ? { kind: 'info', text: `Opened ${this.url}` }
                : {
                    kind: 'error',
                    text: `Could not open a browser. The session is at ${this.url}`,
                  }
            )
          );
        return true;
    }
    return false;
  }

  private openPicker(): void {
    this.picker = { status: 'loading' };
    this.target.api
      .listSessions(this.target.context.team.id)
      .then(list => {
        const items = list.items.slice(0, 10).map(s => ({
          label: s.tags.title || 'Untitled',
          value: s.id,
          hint: relativeTime(s.updatedAt),
        }));
        this.picker = {
          status: 'ready',
          list: items.length
            ? new SelectList(
                items,
                id => this.resume(id),
                () => this.closePicker()
              )
            : undefined,
        };
        this.host.render();
      })
      .catch((error: unknown) => {
        this.picker = {
          status: 'error',
          message: errorText(error),
        };
        this.host.render();
      });
  }

  private closePicker(): void {
    this.picker = undefined;
    this.host.render();
  }

  private resume(id: string): void {
    this.closePicker();
    this.target.api
      .getSession(this.target.context.team.id, id)
      .then(details => this.load({ id, isNew: false }, details.messages))
      .catch((error: unknown) =>
        this.push({
          kind: 'error',
          text: errorText(error),
        })
      );
  }

  private decide(approved: boolean): void {
    const approval = this.pending;
    if (!approval) return;
    this.push({
      kind: 'info',
      text: approved ? 'Plan approved.' : 'Plan rejected.',
    });
    this.rejected = !approved;
    this.pending = undefined;
    void this.send({ approval, approved });
  }

  private exit(): void {
    clearInterval(this.tick);
    this.host.exit();
  }

  private get menu(): ReturnType<typeof matchCommands> {
    return this.mode === 'input' ? matchCommands(this.prompt.editor.value) : [];
  }

  /** Keys for the slash menu and `?`; `true` when handled. */
  private promptKey(event: KeyEvent): boolean {
    if (
      event.name === 'char' &&
      event.text === '?' &&
      !this.prompt.editor.value
    ) {
      this.showShortcuts = !this.showShortcuts;
      return true;
    }
    const menu = this.menu;
    if (!menu.length) return false;
    const index = Math.min(this.menuIndex, menu.length - 1);
    if (event.name === 'up' || event.name === 'down') {
      this.menuIndex =
        (index + (event.name === 'up' ? menu.length - 1 : 1)) % menu.length;
      return true;
    }
    if (event.name === 'tab') {
      this.prompt.set(editorOf(menu[index]!.name));
      return true;
    }
    if (event.name === 'return') {
      this.runCommand(menu[index]!.name);
      this.menuIndex = 0;
      return true;
    }
    return false;
  }

  /** Ctrl+C clears the prompt; on an empty prompt, Ctrl+C or Ctrl+D twice within 2s quits. */
  private exitKey(event: KeyEvent): boolean {
    const text = event.name === 'char' && event.ctrl ? event.text : undefined;
    if (text !== 'c' && text !== 'd') return false;
    if (this.prompt.editor.value) {
      if (text === 'd') return false;
      this.prompt.clear();
      return true;
    }
    if (Date.now() - this.exitArmedAt < 2000) {
      this.exit();
      return true;
    }
    this.exitArmedAt = Date.now();
    setTimeout(() => this.host.render(), 2000);
    return true;
  }

  private scrollBy(rows: number): void {
    // From the current position, not the last frame's: several wheel events can arrive before a redraw.
    const current = this.following
      ? this.frame.max
      : Math.min(this.offset, this.frame.max);
    const next = Math.max(0, Math.min(this.frame.max, current + rows));
    this.following = next >= this.frame.max;
    this.offset = next;
  }

  private handleMouse(event: MouseEvent): void {
    if (event.action !== 'press') {
      this.scrollBy(event.action === 'wheel-up' ? -3 : 3);
      return;
    }
    if (event.y >= this.frame.viewport) return;
    const key = this.frame.toggles.get(this.frame.offset + event.y);
    if (key && !this.expanded.delete(key)) this.expanded.add(key);
  }

  /** Keys for whatever holds focus over the prompt (approval, session picker); `true` when taken. */
  private modalKey(event: KeyEvent): boolean {
    if (this.mode === 'approval') {
      this.approval?.handleKey(event);
      return true;
    }
    if (!this.picker) return false;
    if (this.picker.status === 'ready' && this.picker.list)
      this.picker.list.handleKey(event);
    else if (event.name === 'escape') this.closePicker();
    return true;
  }

  private handleKey(event: KeyEvent): void {
    if (event.ctrl && event.text === 'o') {
      this.verbose = !this.verbose;
      return;
    }
    if (event.name === 'pageup' || event.name === 'pagedown') {
      this.scrollBy(
        (event.name === 'pageup' ? -1 : 1) *
          Math.max(1, this.frame.viewport - 2)
      );
      return;
    }
    if (
      this.mode === 'streaming' &&
      (event.name === 'escape' || (event.ctrl && event.text === 'c'))
    ) {
      this.interrupt();
      return;
    }
    if (this.modalKey(event) || this.promptKey(event) || this.exitKey(event))
      return;
    this.prompt.handleKey(event);
  }

  handle(event: InputEvent): void {
    if (event.kind === 'mouse') this.handleMouse(event);
    else if (event.kind === 'paste' && !this.picker && this.mode !== 'approval')
      this.prompt.paste(event.text);
    else if (event.kind === 'key') this.handleKey(event);
    this.host.render();
  }

  private header(width: number): Line[] {
    const { context } = this.target;
    const field = (
      label: string,
      value: string | undefined,
      empty = ''
    ): Line[] =>
      hang(
        [
          {
            text: `  ${label.padEnd(10)}`,
            style: { color: color.subtle },
          },
        ],
        width,
        w =>
          wrap(
            [
              value
                ? { text: value }
                : {
                    text: empty,
                    style: { color: color.subtle },
                  },
            ],
            w
          )
      );
    return [
      [
        {
          text: `${glyph.logo} Vercel Agent`,
          style: { bold: true },
        },
      ],
      ...field('Team', context.team.slug),
      ...field('Project', context.project?.slug, 'not linked'),
      ...(context.branch ? field('Branch', context.branch) : []),
      ...field('Session', this.url),
      [],
    ];
  }

  /** The transcript, with the rows that toggle blocks. */
  private transcript(width: number): {
    lines: Line[];
    toggles: Map<number, string>;
  } {
    const lines: Line[] = [];
    const toggles = new Map<number, string>();
    const message = (
      m: AgentMessage,
      planBefore: PlanProgress | undefined,
      live = false
    ): void => {
      lines.push([]);
      const rendered = renderMessage(m, {
        width,
        verbose: this.verbose,
        planBefore,
        live,
        expanded: this.expanded,
      });
      for (const toggle of rendered.toggles)
        toggles.set(lines.length + toggle.line, toggle.key);
      lines.push(...rendered.lines, []);
    };
    for (const entry of this.entries) {
      if (entry.kind === 'header') {
        lines.push(...this.header(width));
      } else if (entry.kind === 'user') {
        lines.push([], ...renderUserPrompt(entry.text, width));
      } else if (entry.kind === 'assistant') {
        message(entry.message, entry.planBefore);
      } else if (entry.kind === 'info') {
        lines.push(
          ...wrap(
            [
              {
                text: entry.text,
                style: { color: color.subtle },
              },
            ],
            width
          )
        );
      } else {
        lines.push(
          ...wrap(
            [
              {
                text: `Error: ${entry.text}`,
                style: { color: color.error },
              },
            ],
            width
          )
        );
      }
    }
    if (this.mode === 'streaming' && this.live)
      message(this.live.message, this.plan, true);
    return { lines, toggles };
  }

  private pickerView(width: number): Line[] {
    const picker = this.picker!;
    if (picker.status === 'loading') {
      return [
        [
          {
            text: 'Loading sessions…',
            style: { color: color.subtle },
          },
        ],
      ];
    }
    if (picker.status === 'error') {
      return wrap(
        [
          {
            text: `Could not load sessions: ${picker.message}`,
            style: { color: color.error },
          },
        ],
        width
      );
    }
    if (!picker.list) {
      return [
        [
          {
            text: 'No past sessions on this team. Press Esc.',
            style: { color: color.muted },
          },
        ],
      ];
    }
    const list = picker.list;
    return box(width, { color: color.border }, w => [
      [
        {
          text: 'Resume a session',
          style: { bold: true },
        },
      ],
      ...list.view(w),
      [
        {
          text: '↑↓ select · enter resume · esc cancel',
          style: { color: color.subtle },
        },
      ],
    ]);
  }

  private placeholder(): string {
    if (this.mode === 'streaming')
      return 'Queue a message for when the agent finishes…';
    return this.rejected
      ? 'Tell Vercel Agent what to do instead…'
      : 'Ask about your projects…';
  }

  /** The live plan, the spinner and queued messages, while the agent works. */
  private working(width: number): Line[] {
    const livePlan = this.live
      ? foldPlan(this.plan, this.live.message.parts)
      : undefined;
    return [
      ...(livePlan?.state === 'active'
        ? [...planChecklist(livePlan, width), []]
        : []),
      spinnerLine(this.live?.preamble, this.turnStarted, width),
      ...this.queue.map(text =>
        truncate(
          [
            {
              text: `  ${glyph.connector} Queued: ${text}`,
              style: { color: color.subtle },
            },
          ],
          width
        )
      ),
      [],
    ];
  }

  /** The last rows: the slash menu, the shortcuts panel, or the footer. */
  private bottom(width: number, below: number): Line[] {
    const menu = this.menu;
    if (menu.length) {
      const index = Math.min(this.menuIndex, menu.length - 1);
      return menu.map((command, i) =>
        truncate(
          [
            {
              text: `  ${
                i === index ? glyph.selected : ' '
              } ${command.name.padEnd(10)}${command.description}`,
              style: {
                color: i === index ? color.accent : color.subtle,
              },
            },
          ],
          width
        )
      );
    }
    if (this.showShortcuts) {
      return SHORTCUTS.map(([keys, action]) =>
        truncate(
          [
            { text: `  ${keys.padEnd(26)}` },
            {
              text: action,
              style: { color: color.subtle },
            },
          ],
          width
        )
      );
    }
    const { context } = this.target;
    const exitArmed = Date.now() - this.exitArmedAt < 2000;
    return [
      [
        { text: ' ' },
        ...footerLine(
          {
            hint: exitArmed ? 'Press Ctrl+C again to exit' : '? for shortcuts',
            scope: [context.team.slug, context.project?.slug]
              .filter(Boolean)
              .join('/'),
            sessionId: this.session.id,
            below,
          },
          width - 2
        ),
      ],
    ];
  }

  /** Everything docked under the transcript. */
  private dock(width: number, below: number): Line[] {
    const lines: Line[] = this.mode === 'streaming' ? this.working(width) : [];
    const approval = this.mode === 'approval' ? this.approval : undefined;
    if (approval) {
      lines.push(
        ...box(width, { color: color.warning }, w => [
          [
            {
              text: 'Run this plan?',
              style: { bold: true },
            },
          ],
          ...approval.view(w),
        ])
      );
    } else if (this.picker) {
      lines.push(...this.pickerView(width));
    } else {
      lines.push(
        ...box(width, { color: color.border }, w =>
          this.prompt.view(w, this.placeholder())
        )
      );
    }
    return [...lines, ...this.bottom(width, below)];
  }

  view(width: number, height: number): Line[] {
    const inner = Math.max(10, width - 2);
    const { lines, toggles } = this.transcript(inner);
    // The dock's "more below" count depends on the viewport, which depends on the dock's height.
    const draft = this.dock(inner, 0);
    const viewport = Math.max(1, height - draft.length);
    const max = Math.max(0, lines.length - viewport);
    const offset = this.following ? max : Math.min(this.offset, max);
    const dock = max - offset > 0 ? this.dock(inner, max - offset) : draft;
    this.frame = { offset, max, viewport, toggles };
    const visible = lines.slice(offset, offset + viewport);
    while (visible.length < viewport) visible.push([]);
    return [...visible, ...dock].map(line => [
      { text: ' ' },
      ...truncate(line, inner),
    ]);
  }
}
