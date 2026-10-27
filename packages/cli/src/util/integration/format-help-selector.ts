/** Use remote selectors in shell examples only when they are one literal word. */
export function formatHelpSelector(value: string, placeholder: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) ? value : placeholder;
}
