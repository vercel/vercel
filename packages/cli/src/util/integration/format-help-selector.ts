const HELP_SELECTOR = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Whether a selector is one literal word, safe to use in a shell command. */
export function isHelpSelector(value: string): boolean {
  return HELP_SELECTOR.test(value);
}

/** Use remote selectors in shell examples only when they are one literal word. */
export function formatHelpSelector(value: string, placeholder: string): string {
  return isHelpSelector(value) ? value : placeholder;
}
