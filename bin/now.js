#!/usr/bin/env node

// Native
import {resolve} from 'path'

// Packages
import minimist from 'minimist'
import {spawn} from 'cross-spawn'
import nodeVersion from 'node-version'

// Ours
import checkUpdate from '../lib/check-update'
import {error} from '../lib/error'

if (nodeVersion.major < 6) {
  error('Now requires at least version 6 of Node. Please upgrade!')
  process.exit(1)
}

const argv = minimist(process.argv.slice(2))

// options
const debug = argv.debug || argv.d

// auto-update checking
const update = checkUpdate({debug})

const exit = code => {
  update.then(() => process.exit(code))
  // don't wait for updates more than a second
  // when the process really wants to exit
  setTimeout(() => process.exit(code), 1000)
}

const defaultCommand = 'deploy'

const commands = new Set([
  defaultCommand,
  'help',
  'list',
  'ls',
  'rm',
  'remove',
  'alias',
  'aliases',
  'ln',
  'domain',
  'domains',
  'dns',
  'cert',
  'certs',
  'secret',
  'secrets'
])

const aliases = new Map([
  ['ls', 'list'],
  ['rm', 'remove'],
  ['ln', 'alias'],
  ['aliases', 'alias'],
  ['domain', 'domains'],
  ['cert', 'certs'],
  ['secret', 'secrets']
])

let cmd = defaultCommand
const args = process.argv.slice(2)
const index = args.findIndex(a => commands.has(a))

if (index > -1) {
  cmd = args[index]
  args.splice(index, 1)

  if (cmd === 'help') {
    if (index < args.length && commands.has(args[index])) {
      cmd = args[index]
      args.splice(index, 1)
    } else {
      cmd = defaultCommand
    }

    args.unshift('--help')
  }

  cmd = aliases.get(cmd) || cmd
}

let bin = resolve(__dirname, 'now-' + cmd)
if (process.pkg) {
  args.unshift('--entrypoint', bin)
  bin = process.execPath
}

const proc = spawn(bin, args, {
  stdio: 'inherit',
  customFds: [0, 1, 2]
})

proc.on('close', code => exit(code))
proc.on('error', () => exit(1))
