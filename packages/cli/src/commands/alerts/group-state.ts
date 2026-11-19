import { normalizeTimestamp } from './format';
import type {
  AlertAcknowledgeAction,
  AlertGroup,
  AlertMutedAction,
} from './types';

function getAcknowledgeAction(
  group: AlertGroup
): AlertAcknowledgeAction | undefined {
  return group.actions?.find(
    (action): action is AlertAcknowledgeAction => action.type === 'acknowledge'
  );
}

/**
 * Mutes created from this group. The API returns only active mutes the caller
 * can read whose stored source group is this one.
 */
export function getMutedActions(group: AlertGroup): AlertMutedAction[] {
  return (group.actions ?? []).filter(
    (action): action is AlertMutedAction => action.type === 'muted'
  );
}

export function isAcknowledged(group: AlertGroup): boolean {
  return Boolean(getAcknowledgeAction(group) || group.ack);
}

export function isMuted(group: AlertGroup): boolean {
  return getMutedActions(group).length > 0;
}

export function getAcknowledgedAt(group: AlertGroup): number | undefined {
  const timestamp =
    getAcknowledgeAction(group)?.timestamp ?? group.ack?.timestamp;
  return normalizeTimestamp(timestamp ?? undefined);
}

/**
 * When the group's mute coverage first drops: the earliest expiry of its mutes.
 * `null` means every mute lasts until it is removed, and `undefined` means the
 * group has no mutes.
 */
export function getMuteExpiry(group: AlertGroup): number | null | undefined {
  const mutes = getMutedActions(group);
  if (mutes.length === 0) {
    return undefined;
  }
  const timed = mutes
    .map(mute => mute.expiresAt)
    .filter((expiresAt): expiresAt is number => typeof expiresAt === 'number');
  return timed.length > 0 ? Math.min(...timed) : null;
}

/** Every muted action in a group carries the same coverage. */
export function getMuteCoverage(
  group: AlertGroup
): AlertMutedAction['coverage'] | undefined {
  return getMutedActions(group)[0]?.coverage;
}

export function getMuteRuleIds(group: AlertGroup): string[] {
  return [...new Set(getMutedActions(group).flatMap(mute => mute.ruleIds))];
}
