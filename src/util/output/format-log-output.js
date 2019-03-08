//
import formatLogText from './format-log-text';

export default function formatLogOutput(text, prefix = '') {
  return formatLogText(text)
    .split('\n')
    .map(textItem => `${prefix}${textItem.replace(/^> /, '')}`);
}
