//
import formatLogText from './format-log-text';

export default function formatLogCmd(text) {
  return `▲ ${formatLogText(text)}`;
}
