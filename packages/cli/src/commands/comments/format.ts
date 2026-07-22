import chalk from 'chalk';
import ms from 'ms';
import { ALIGNED_LABEL_WIDTH } from '../../util/output/print-aligned-label';
import type { CommentActor, CommentMessage, Thread } from './types';

/**
 * Mirrors printAlignedLabel()'s blank-gutter layout (2-space gutter +
 * shared 16-char label column). That helper prints directly and cannot be
 * used inside these pure string renderers.
 */
function alignedRow(label: string, value: string): string {
  return `  ${chalk.bold(label.padEnd(ALIGNED_LABEL_WIDTH))}${value}`;
}

export function actorLabel(actor: CommentActor | undefined): string {
  if (!actor) {
    return '-';
  }
  const base = actor.name || actor.username || actor.id;
  return actor.type === 'app' ? `${base} (app)` : base;
}

export function relativeAge(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '-';
  }
  const delta = Date.now() - timestamp;
  if (delta < 1000) {
    return 'now';
  }
  return ms(delta);
}

/**
 * The page path a human saw. `context.path` records the post-rewrite path
 * (often `/` on rewrite-heavy apps), so prefer the pathname of `context.href`.
 */
export function displayPath(thread: Thread): string {
  const href = thread.context?.href;
  if (href) {
    try {
      return new URL(href).pathname;
    } catch {
      // fall through
    }
  }
  return thread.context?.path || '/';
}

/** Truncate on grapheme boundaries so we never split emoji or combining marks. */
export function truncate(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const segmenter = new Intl.Segmenter();
  const graphemes = [...segmenter.segment(normalized)];
  if (graphemes.length <= max) {
    return normalized;
  }
  return `${graphemes
    .slice(0, Math.max(0, max - 1))
    .map(s => s.segment)
    .join('')}…`;
}

export function firstMessageText(thread: Thread): string {
  return thread.messages[0]?.text ?? '';
}

export function threadAge(thread: Thread): string {
  return relativeAge(thread.messages[0]?.timestamp);
}

/**
 * Slack-style thread summary: reply count, who's participating (deduped
 * reply authors, capped), and how recent the last message is. All computed
 * from the embedded messages — zero extra API calls, and the embedded window
 * is the *last* 50, so the most recent message is always present.
 */
function renderThreadSummary(thread: Thread, complete: boolean): string {
  const replies = thread.messageCount - 1;
  const rootAuthorId = complete ? thread.messages[0]?.author.id : undefined;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const message of thread.messages) {
    const { author } = message;
    if (author.id === rootAuthorId || seen.has(author.id)) {
      continue;
    }
    seen.add(author.id);
    names.push(actorLabel(author));
  }
  const shown = names.slice(0, 3);
  const overflow = names.length - shown.length;
  const participants =
    shown.length > 0
      ? `${shown.join(', ')}${overflow > 0 ? ` +${overflow} more` : ''}`
      : undefined;
  const lastTimestamp = thread.messages[thread.messages.length - 1]?.timestamp;

  const parts = [`→ ${replies} ${replies === 1 ? 'reply' : 'replies'}`];
  if (participants) {
    parts.push(participants);
  }
  parts.push(`last ${relativeAge(lastTimestamp)} ago`);
  return parts.join(' · ');
}

export function renderThreadRow(
  thread: Thread,
  opts: { showBranch: boolean }
): string {
  // The embedded window is the LAST 50 messages: for longer threads,
  // messages[0] is not the root comment and must not be presented as it.
  const complete = thread.messageCount <= thread.messages.length;
  const dot = thread.resolved ? chalk.dim('○') : '●';
  const author = complete ? actorLabel(thread.messages[0]?.author) : '…';
  const columns: string[] = [
    dot,
    thread.id,
    chalk.dim(threadAge(thread)),
    author,
    displayPath(thread),
  ];
  if (opts.showBranch && thread.branch) {
    columns.push(chalk.dim(thread.branch));
  }
  if (thread.isLocalhost) {
    columns.push(chalk.dim('localhost'));
  }

  const lines = [`  ${columns.join('  ')}`];

  if (complete) {
    const excerpt = truncate(firstMessageText(thread), 80);
    if (excerpt) {
      lines.push(`    “${excerpt}”`);
    }
  } else {
    lines.push(
      chalk.dim('    (long thread — inspect for the full conversation)')
    );
  }

  const selection = thread.context?.selection;
  if (selection) {
    lines.push(chalk.dim(`    → selected: “${truncate(selection, 60)}”`));
  }

  if (thread.messageCount > 1) {
    lines.push(chalk.dim(`    ${renderThreadSummary(thread, complete)}`));
  }

  const meta: string[] = [];
  const reactionCount = thread.messages.reduce(
    (acc, message) => acc + (message.reactions?.length ?? 0),
    0
  );
  if (reactionCount > 0) {
    meta.push(
      `${reactionCount} ${reactionCount === 1 ? 'reaction' : 'reactions'}`
    );
  }
  const attachmentCount = thread.messages.reduce(
    (acc, message) => acc + (message.attachments?.length ?? 0),
    0
  );
  if (attachmentCount > 0) {
    meta.push(
      `${attachmentCount} ${attachmentCount === 1 ? 'attachment' : 'attachments'}`
    );
  }
  if (thread.resolved) {
    meta.push(`resolved by ${actorLabel(thread.resolvedBy)}`);
  }
  if (meta.length > 0) {
    lines.push(chalk.dim(`    ${meta.join(' · ')}`));
  }

  return lines.join('\n');
}

function renderReactions(message: CommentMessage): string | undefined {
  if (!message.reactions || message.reactions.length === 0) {
    return undefined;
  }
  return message.reactions
    .map(r => `${r.emoji} ${r.name} · ${r.users.length}`)
    .join('   ');
}

export function renderMessage(message: CommentMessage): string {
  const lines: string[] = [
    `${chalk.bold(actorLabel(message.author))} · ${relativeAge(message.timestamp)} ago · ${chalk.dim(message.id)}`,
  ];
  for (const textLine of message.text.split('\n')) {
    lines.push(`  ${textLine}`);
  }
  for (const attachment of message.attachments ?? []) {
    const dimensions =
      attachment.width && attachment.height
        ? ` (${attachment.width}×${attachment.height})`
        : '';
    // Monochrome glyphs only — house style has no color-emoji decoration.
    // (API-provided reaction emoji are data, not decoration.)
    lines.push(
      `${chalk.dim(`  → attachment ${attachment.filename}${dimensions}`)} ${chalk.cyan(attachment.url)}`
    );
  }
  const reactions = renderReactions(message);
  if (reactions) {
    lines.push(`  ${reactions}`);
  }
  return lines.join('\n');
}

export function renderThreadDetail(
  thread: Thread,
  messages: CommentMessage[],
  opts: { showContext: boolean }
): string {
  const sections: string[] = [];

  const status = thread.resolved
    ? chalk.dim(`resolved by ${actorLabel(thread.resolvedBy)}`)
    : 'unresolved';
  const headline = [chalk.bold(thread.id), status];
  if (thread.branch) {
    headline.push(chalk.dim(thread.branch));
  }
  if (thread.isLocalhost) {
    headline.push(chalk.dim('localhost'));
  }
  sections.push(headline.join(' · '));

  const headerLines: string[] = [];
  const path = displayPath(thread);
  const pageTitle = thread.context?.pageTitle;
  headerLines.push(pageTitle ? `${path} — “${pageTitle}”` : path);
  if (thread.context?.href) {
    headerLines.push(chalk.cyan(thread.context.href));
  }
  sections.push(headerLines.join('\n'));

  const contextLines: string[] = [];
  if (thread.context?.selection) {
    contextLines.push(alignedRow('Selected', `“${thread.context.selection}”`));
  }
  if (thread.context?.selector) {
    contextLines.push(alignedRow('Element', thread.context.selector));
  }
  for (const link of thread.links ?? []) {
    contextLines.push(
      alignedRow('Linked', `${link.label} — ${chalk.cyan(link.link)}`)
    );
  }
  if (contextLines.length > 0) {
    sections.push(contextLines.join('\n'));
  }

  sections.push(messages.map(renderMessage).join('\n\n'));

  if (opts.showContext) {
    const extra: string[] = [];
    if (thread.context?.frameworkContext) {
      extra.push(
        `${chalk.bold('Framework context')}\n${thread.context.frameworkContext}`
      );
    }
    if (thread.context?.device) {
      extra.push(
        `${chalk.bold('Device')}\n${JSON.stringify(thread.context.device, null, 2)}`
      );
    }
    if (extra.length > 0) {
      sections.push(extra.join('\n\n'));
    }
  }

  if (thread.webUrl) {
    sections.push(`Open in Vercel → ${chalk.cyan(thread.webUrl)}`);
  }

  return sections.join('\n\n');
}
