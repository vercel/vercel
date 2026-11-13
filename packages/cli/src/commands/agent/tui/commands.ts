export interface SlashCommand {
  name: string;
  description: string;
}

export const COMMANDS: SlashCommand[] = [
  { name: '/new', description: 'Start a new session' },
  {
    name: '/clear',
    description: 'Clear the conversation and start a new session',
  },
  { name: '/resume', description: 'Resume a past session' },
  { name: '/browser', description: 'Open this session in the browser' },
  { name: '/help', description: 'Show commands and shortcuts' },
  { name: '/exit', description: 'Quit' },
];

/** Commands for the menu while the prompt is a bare `/word`; empty otherwise. */
export function matchCommands(value: string): SlashCommand[] {
  if (!/^\/\S*$/.test(value)) return [];
  return COMMANDS.filter(c => c.name.startsWith(value));
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
