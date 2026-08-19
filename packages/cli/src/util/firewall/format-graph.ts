import chalk from 'chalk';
import type { BypassRule, FirewallConfigResponse, FirewallRule } from './types';
import {
  type AttackModeStatus,
  getBotProtectionConfig,
  isAllSourcesBypass,
  isMitigationsPaused,
} from './format';

/** Interior width of each stage box (between the vertical borders). */
const INNER = 26;
/** Spaces before each stage box so the spine sits under the box center. */
const BOX_PAD = 3;
/** Column index (0-based) of the right-hand bypass lane. */
const LANE_COL = BOX_PAD + INNER + 2 + 3; // pad + box + "   "

type NodeTone = 'amber' | 'dim' | 'paused' | 'default';

function isBotProtectionId(id: string): boolean {
  return id === 'bot_filter' || id === 'bot_protection';
}

function ruleMitigateAction(rule: FirewallRule): string {
  return rule.action?.mitigate?.action ?? 'log';
}

function paint(s: string, tone: NodeTone): string {
  if (tone === 'amber') return chalk.hex('#F5A623')(s);
  if (tone === 'paused') return chalk.yellow(s);
  if (tone === 'dim') return chalk.dim(s);
  return s;
}

function center(label: string, width: number): string {
  if (label.length >= width) return `${label.slice(0, width - 1)}…`;
  const left = Math.floor((width - label.length) / 2);
  return label.padStart(left + label.length).padEnd(width);
}

function boxLines(label: string, tone: NodeTone): string[] {
  const text = center(label, INNER);
  return [
    paint(`┌${'─'.repeat(INNER)}┐`, tone),
    paint(`│${text}│`, tone),
    paint(`└${'─'.repeat(INNER)}┘`, tone),
  ];
}

/** Place `text` starting at column 0, then ensure a char at `laneCol`. */
function withLane(text: string, lane: string | null): string {
  if (!lane) return text;
  const padded = text.padEnd(LANE_COL);
  return padded.slice(0, LANE_COL) + lane;
}

function pushBox(
  lines: string[],
  label: string,
  opts: { tone?: NodeTone; lane?: boolean } = {}
): void {
  const tone = opts.tone ?? 'default';
  const laneChar = opts.lane ? chalk.dim('│') : null;
  const pad = ' '.repeat(BOX_PAD);
  for (const row of boxLines(label, tone)) {
    lines.push(withLane(pad + row, laneChar));
  }
}

function pushSpine(lines: string[], lane = false): void {
  const spineCol = BOX_PAD + Math.floor((INNER + 2) / 2);
  const base = `${' '.repeat(spineCol)}│`;
  lines.push(withLane(base, lane ? chalk.dim('│') : null));
}

function pushDim(lines: string[], text: string, lane = false): void {
  lines.push(withLane(chalk.dim(text), lane ? chalk.dim('│') : null));
}

/**
 * Firewall execution graph with bypass paths.
 *
 * Spine order matches the dashboard:
 * System Bypass → System Rules → (Attack Mode) → IP Blocks → Custom Rules
 * → Bot Management → Managed Rulesets
 *
 * System bypass skips System Rules and Bot Management (not Attack Mode).
 * A custom rule with action `bypass` skips remaining managed stages.
 */
export function formatGraphOutput(
  active: FirewallConfigResponse | null,
  bypass: BypassRule[],
  attackMode?: AttackModeStatus
): string {
  const regularBypasses = bypass.filter(b => !isAllSourcesBypass(b.Ip));
  const systemBypassCount = regularBypasses.length;
  const hasSystemBypass = systemBypassCount > 0;
  const mitigationsPaused = isMitigationsPaused(bypass);
  const firewallOff = active ? !active.firewallEnabled : false;
  const baseTone: NodeTone = firewallOff ? 'dim' : 'default';

  const ipCount = active?.ips.length ?? 0;
  const customCount = active?.rules.length ?? 0;
  const botProtection = getBotProtectionConfig(active?.managedRules);
  const botActive = Boolean(botProtection?.active || active?.botIdEnabled);
  const managedCount = Object.keys(active?.managedRules ?? {}).filter(
    id => !isBotProtectionId(id)
  ).length;
  const hasCustomBypass = Boolean(
    active?.rules.some(r => r.active && ruleMitigateAction(r) === 'bypass')
  );

  const lines: string[] = [''];
  const spineCol = BOX_PAD + Math.floor((INNER + 2) / 2);

  lines.push(chalk.dim(' System Rules'));

  const bypassLabel =
    systemBypassCount === 0
      ? 'No System Bypass IPs'
      : `${systemBypassCount} System Bypass IP${systemBypassCount === 1 ? '' : 's'}`;

  if (hasSystemBypass) {
    // Open bypass lane above the system-bypass node
    const leftPad = ' '.repeat(spineCol);
    const gap = LANE_COL - spineCol - 1;
    const label = ' system bypass ';
    const dashLeft = Math.max(1, Math.floor((gap - label.length) / 2));
    const dashRight = Math.max(1, gap - label.length - dashLeft);
    lines.push(
      chalk.dim(
        `${leftPad}┌${'─'.repeat(dashLeft)}${label}${'─'.repeat(dashRight)}┐`
      )
    );
    pushSpine(lines, true);
    pushBox(lines, bypassLabel, { tone: baseTone, lane: true });
    pushSpine(lines, true);
    pushBox(lines, 'System Rules', {
      tone: mitigationsPaused ? 'paused' : baseTone,
      lane: true,
    });
    if (mitigationsPaused) {
      pushDim(lines, `${' '.repeat(spineCol)}│  paused`, true);
    }
    pushSpine(lines, true);
    // Rejoin into spine
    lines.push(
      chalk.dim(
        `${' '.repeat(spineCol)}├◄${'─'.repeat(LANE_COL - spineCol - 2)}┘`
      )
    );
  } else {
    pushBox(lines, bypassLabel, { tone: 'dim' });
    pushSpine(lines);
    pushBox(lines, 'System Rules', {
      tone: mitigationsPaused ? 'paused' : baseTone,
    });
    if (mitigationsPaused) {
      pushDim(lines, `${' '.repeat(spineCol)}│  paused`);
    }
    pushSpine(lines);
  }

  if (attackMode?.enabled) {
    pushBox(lines, 'Attack Challenge Mode', { tone: 'amber' });
    pushSpine(lines);
  }

  lines.push(chalk.dim(' Custom Rules'));

  const ipLabel =
    ipCount === 0
      ? 'No IP blocks'
      : `${ipCount} IP block${ipCount === 1 ? '' : 's'}`;
  pushBox(lines, ipLabel, { tone: ipCount === 0 ? 'dim' : baseTone });
  pushSpine(lines);

  const customLabel =
    customCount === 0
      ? 'No custom rules'
      : `${customCount} custom rule${customCount === 1 ? '' : 's'}`;
  pushBox(lines, customLabel, {
    tone: customCount === 0 ? 'dim' : baseTone,
  });

  // Custom-rule bypass lane only when system bypass isn't already using it
  const showCustomLane = hasCustomBypass && !hasSystemBypass;
  if (showCustomLane) {
    const leftPad = ' '.repeat(spineCol);
    const gap = LANE_COL - spineCol - 1;
    const label = ' rule bypass ';
    const dashLeft = Math.max(1, Math.floor((gap - label.length) / 2));
    const dashRight = Math.max(1, gap - label.length - dashLeft);
    lines.push(
      chalk.dim(
        `${leftPad}├${'─'.repeat(dashLeft)}${label}${'─'.repeat(dashRight)}┐`
      )
    );
    pushSpine(lines, true);
  } else {
    pushSpine(lines);
  }

  lines.push(chalk.dim(' Managed Rulesets'));

  if (hasSystemBypass) {
    const leftPad = ' '.repeat(spineCol);
    const gap = LANE_COL - spineCol - 1;
    const label = ' system bypass ';
    const dashLeft = Math.max(1, Math.floor((gap - label.length) / 2));
    const dashRight = Math.max(1, gap - label.length - dashLeft);
    lines.push(
      chalk.dim(
        `${leftPad}├${'─'.repeat(dashLeft)}${label}${'─'.repeat(dashRight)}┐`
      )
    );
    pushSpine(lines, true);
    pushBox(lines, 'Bot Management', {
      tone: botActive ? baseTone : 'dim',
      lane: true,
    });
    pushDim(
      lines,
      `${' '.repeat(spineCol)}│  ${botActive ? (botProtection?.action ?? 'On') : 'Off'}`,
      true
    );
    pushSpine(lines, true);
    lines.push(
      chalk.dim(
        `${' '.repeat(spineCol)}├◄${'─'.repeat(LANE_COL - spineCol - 2)}┘`
      )
    );
  } else {
    pushBox(lines, 'Bot Management', {
      tone: botActive ? baseTone : 'dim',
    });
    pushDim(
      lines,
      `${' '.repeat(spineCol)}│  ${botActive ? (botProtection?.action ?? 'On') : 'Off'}`,
      showCustomLane
    );
    pushSpine(lines, showCustomLane);
  }

  const managedLabel =
    managedCount === 0
      ? 'No managed rulesets'
      : `${managedCount} managed ruleset${managedCount === 1 ? '' : 's'}`;
  pushBox(lines, managedLabel, {
    tone: managedCount === 0 ? 'dim' : baseTone,
    lane: showCustomLane,
  });

  if (showCustomLane) {
    pushSpine(lines, true);
    lines.push(
      chalk.dim(
        `${' '.repeat(spineCol)}├◄${'─'.repeat(LANE_COL - spineCol - 2)}┘`
      )
    );
  } else {
    pushSpine(lines);
  }

  lines.push(chalk.dim(`${' '.repeat(spineCol)}▼`));
  lines.push('');

  if (hasSystemBypass || hasCustomBypass) {
    lines.push(chalk.dim(' Bypass paths arc around the stages they skip.'));
    if (hasSystemBypass) {
      lines.push(
        chalk.dim(' System bypass skips System Rules and Bot Management.')
      );
    }
    if (hasCustomBypass) {
      lines.push(
        chalk.dim(
          ' A custom bypass rule skips Bot Management and managed rulesets.'
        )
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
