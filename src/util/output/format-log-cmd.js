// @flow
import formatLogText from './format-log-text';

export default function formatLogCmd(text: string) {
  return `▲ ${formatLogText(text)}`;
}
