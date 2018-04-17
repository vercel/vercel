// @flow
import formatLogText from './format-log-text'

export default function formatLogOutput(text: string, prefix: string = ''): string[] {
  return formatLogText(text).split('\n').map(textItem => (
    `${prefix}${textItem.replace(/^> /, '')}`
  ))
}
