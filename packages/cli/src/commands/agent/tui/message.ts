import type { AgentMessage, ProposePlanInput, ToolPart } from '../types';
import type { Block } from './blocks';
import type { PlanProgress } from './plan';
import type { Line, Span } from './ui/text';
import { formatPlan, summarizeTool } from '../format';
import { toolName } from '../stream';
import { summarizeGroup, toBlocks } from './blocks';
import { renderMarkdown } from './markdown';
import { color, glyph } from './theme';
import { toolResultLines } from './tool-summary';
import { box, hang, indent } from './ui/layout';
import { sanitize, truncate, wrap } from './ui/text';

/** Lines plus the rows that toggle a block when clicked. */
export interface Rendered {
  lines: Line[];
  toggles: Array<{ line: number; key: string }>;
}

const RUNNING = new Set<ToolPart['state']>([
  'input-streaming',
  'input-available',
  'approval-responded',
]);

/** A status mark like the dashboard's deployment states; it pulses while the tool runs. */
function statusMark(state: ToolPart['state']): Span {
  if (RUNNING.has(state)) {
    return {
      text: Math.floor(Date.now() / 400) % 2 ? glyph.tool : glyph.running,
      style: { color: color.warning },
    };
  }
  const tone =
    {
      'output-available': color.success,
      'output-error': color.error,
      'approval-requested': color.warning,
    }[state as string] ?? color.subtle;
  return {
    text: glyph.tool,
    style: { color: tone },
  };
}

function connector(): Line {
  return [
    {
      text: `  ${glyph.connector} `,
      style: { color: color.border },
    },
  ];
}

/** Result lines hang under the tool call, cut to one row each. */
function resultLines(lines: string[], width: number, tone?: string): Line[] {
  if (!lines.length) return [];
  return hang(connector(), width, w =>
    lines.map(line =>
      truncate(
        [
          {
            text: sanitize(line),
            style: { color: tone ?? color.subtle },
          },
        ],
        w
      )
    )
  );
}

const TASK_ICON = {
  pending: [glyph.pending, color.subtle],
  in_progress: [glyph.tool, color.accent],
  completed: [glyph.success, color.success],
  skipped: ['–', color.subtle],
} as const;

/** The plan as a checklist. */
export function planChecklist(plan: PlanProgress, width: number): Line[] {
  return plan.tasks.flatMap(task => {
    const [icon, tone] = TASK_ICON[task.status];
    const open = task.status === 'pending' || task.status === 'in_progress';
    return hang(
      [
        {
          text: icon,
          style: { color: tone },
        },
        { text: ' ' },
      ],
      width,
      w =>
        wrap(
          [
            {
              text: task.title,
              style: {
                bold: task.status === 'in_progress',
                color: open ? undefined : color.subtle,
              },
            },
          ],
          w
        )
    );
  });
}

/** One tool call: just the line (errors aside), short result lines, or the full output. */
function toolCall(
  part: ToolPart,
  detail: 'none' | 'short' | 'full',
  width: number
): Line[] {
  const name = toolName(part);
  const args = summarizeTool(part, detail === 'full' ? 400 : 60).slice(
    name.length
  );
  const head = truncate(
    [
      statusMark(part.state),
      { text: ' ' },
      {
        text: name,
        style: { bold: true },
      },
      {
        text: args,
        style: { color: color.subtle },
      },
    ],
    width
  );
  const lines =
    detail === 'none'
      ? part.state === 'output-error'
        ? toolResultLines(part, false)
        : []
      : toolResultLines(part, detail === 'full');
  return [
    head,
    ...resultLines(
      lines,
      width,
      part.state === 'output-error' ? color.error : undefined
    ),
  ];
}

function toggleLine(open: boolean, label: Span[], width: number): Line {
  return truncate(
    [
      {
        text: `${open ? glyph.expanded : glyph.collapsed} `,
        style: { color: color.subtle },
      },
      ...label,
    ],
    width
  );
}

interface BlockOptions {
  open: boolean;
  verbose: boolean;
  width: number;
}

/** A rendered block, with the row inside it that toggles the block (if any). */
interface BlockLines {
  lines: Line[];
  toggle?: number;
}

function toolGroup(
  block: Extract<Block, { kind: 'tools' }>,
  { open, verbose, width }: BlockOptions
): BlockLines {
  // The group in progress lists its calls; once the agent moves on, it collapses to a summary.
  if (block.active && !open) {
    return {
      lines: block.parts.flatMap(part => toolCall(part, 'none', width)),
    };
  }
  const { label, names, failed } = summarizeGroup(block.parts);
  const single = block.parts.length === 1 ? block.parts[0]! : undefined;
  const summary: Span[] = single
    ? [
        {
          text: toolName(single),
          style: { bold: true },
        },
        {
          text: summarizeTool(single).slice(toolName(single).length),
          style: { color: color.subtle },
        },
      ]
    : [
        {
          text: label,
          style: { bold: true },
        },
        {
          text: ` · ${names}`,
          style: { color: color.subtle },
        },
      ];
  if (failed > 0) {
    summary.push({
      text: ` · ${failed} failed`,
      style: { color: color.error },
    });
  }
  const details = open
    ? indent(
        block.parts.flatMap(part =>
          toolCall(part, verbose ? 'full' : 'short', width - 2)
        ),
        2
      )
    : [];
  return {
    lines: [toggleLine(open, summary, width), ...details],
    toggle: 0,
  };
}

function thinking(
  block: Extract<Block, { kind: 'thinking' }>,
  { open, width }: BlockOptions
): BlockLines {
  const label = toggleLine(
    open,
    [
      {
        text: block.active ? 'Thinking…' : 'Thought',
        style: { color: color.subtle, italic: true },
      },
    ],
    width
  );
  const body = open
    ? indent(
        wrap(
          [
            {
              text: block.text,
              style: { color: color.subtle, italic: true },
            },
          ],
          width - 2
        ),
        2
      )
    : [];
  return {
    lines: [label, ...body],
    toggle: 0,
  };
}

function planBlock(
  block: Extract<Block, { kind: 'plan' }>,
  width: number
): Line[] {
  const name = toolName(block.part);
  const label =
    name === 'ProposePlan'
      ? `Plan: ${block.plan.title}`
      : block.plan.state === 'failed'
        ? 'Plan failed'
        : 'Plan complete';
  const input = block.part.input as
    | { summary?: string; reason?: string }
    | undefined;
  const note =
    name === 'ProposePlan' ? undefined : input?.summary || input?.reason;
  const head = truncate(
    [
      statusMark(
        block.plan.state === 'failed' ? 'output-error' : block.part.state
      ),
      { text: ' ' },
      {
        text: label,
        style: { bold: true },
      },
    ],
    width
  );
  return [
    head,
    ...hang(connector(), width, w => [
      ...planChecklist(block.plan, w),
      ...(note
        ? wrap(
            [
              {
                text: note,
                style: { color: color.subtle },
              },
            ],
            w
          )
        : []),
    ]),
  ];
}

function renderBlock(block: Block, options: BlockOptions): BlockLines {
  const { width } = options;
  switch (block.kind) {
    case 'text':
      return {
        lines: hang([{ text: `${glyph.answer} ` }], width, w =>
          renderMarkdown(block.text, w)
        ),
      };
    case 'thinking':
      return thinking(block, options);
    case 'tools':
      return toolGroup(block, options);
    case 'plan':
      return {
        lines: planBlock(block, width),
      };
    case 'approval':
      return {
        lines: [
          ...toolCall(block.part, 'none', width),
          ...indent(
            box(width - 2, { color: color.warning }, w =>
              renderMarkdown(
                formatPlan(block.part.input as ProposePlanInput),
                w
              )
            ),
            2
          ),
        ],
      };
  }
}

export interface MessageOptions {
  width: number;
  /** Ctrl+O: every group and thought expanded, with full tool output. */
  verbose: boolean;
  /** Plan progress before this message, so plan blocks can render the whole checklist. */
  planBefore?: PlanProgress;
  /** Still streaming: its last tool group stays open. */
  live?: boolean;
  /** Block keys the user expanded. */
  expanded?: ReadonlySet<string>;
}

/** An assistant message: blocks separated by blank lines. */
export function renderMessage(
  message: AgentMessage,
  options: MessageOptions
): Rendered {
  const out: Rendered = { lines: [], toggles: [] };
  toBlocks(message, options.live ?? false, options.planBefore).forEach(
    (block, i) => {
      if (i > 0) out.lines.push([]);
      const rendered = renderBlock(block, {
        open: options.verbose || Boolean(options.expanded?.has(block.key)),
        verbose: options.verbose,
        width: options.width,
      });
      if (rendered.toggle !== undefined)
        out.toggles.push({
          line: out.lines.length + rendered.toggle,
          key: block.key,
        });
      out.lines.push(...rendered.lines);
    }
  );
  return out;
}

/** The user's prompt, in secondary text. */
export function renderUserPrompt(text: string, width: number): Line[] {
  return hang(
    [
      {
        text: `${glyph.prompt} `,
        style: { color: color.muted },
      },
    ],
    width,
    w =>
      wrap(
        [
          {
            text,
            style: { color: color.muted },
          },
        ],
        w
      )
  );
}
