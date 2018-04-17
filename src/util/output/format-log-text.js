// @flow
export default function formatLogText(text: string): string {
  return text.replace(/\n$/, '').replace(/^\n/, '')
}
