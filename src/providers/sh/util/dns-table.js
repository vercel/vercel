import chalk from 'chalk'
import table from 'text-table'
import strlen from './strlen'

export default function dnsTable(rows, extraSpace = '') {
  return table([
    ['name', 'type', 'value'].map(v => chalk.gray(v)),
    ...rows
  ], {
    align: ['l', 'l', 'l'],
    hsep: ' '.repeat(8),
    stringLength: strlen
  }).replace(/^(.*)/gm, `${extraSpace}  $1`)
}
