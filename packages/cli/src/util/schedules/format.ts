import chalk from 'chalk';
import type { ScheduleTarget } from './types';

export function formatScheduleTarget(target: ScheduleTarget): string {
  switch (target.type) {
    case 'queue':
      return `Queue: ${target.topic}`;
    case 'path':
      return `Path: ${target.path}`;
    case 'function':
      return target.service === undefined
        ? `Function: ${target.function}`
        : `Function: ${target.function} (service ${target.service})`;
  }
}

export function formatScheduleTargetDetail(target: ScheduleTarget): string {
  switch (target.type) {
    case 'queue':
      return `${target.topic} ${chalk.gray('(Queue)')}`;
    case 'path':
      return `${target.path} ${chalk.gray('(Path)')}`;
    case 'function':
      return target.service === undefined
        ? `${target.function} ${chalk.gray('(Function)')}`
        : `${target.function} ${chalk.gray(`(Function in service ${target.service})`)}`;
  }
}
