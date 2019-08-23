//
export default function formatLogText(text) {
  return text.replace(/\n$/, '').replace(/^\n/, '');
}
