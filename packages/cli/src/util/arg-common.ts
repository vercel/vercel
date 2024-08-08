const ARG_COMMON = {
  '--help': Boolean,
  '-h': '--help',

  '--debug': Boolean,
  '-d': '--debug',

  '--no-color': Boolean,

  '--token': String,
  '-t': '--token',

  '--scope': String,
  '-S': '--scope',

  '--team': String,
  '-T': '--team',

  '--local-config': String,
  '-A': '--local-config',

  '--global-config': String,
  '-Q': '--global-config',

  '--api': String,

  '--cwd': String,
};

export default () => ARG_COMMON;

export const yesOption = {
  name: 'yes',
  shorthand: 'y',
  type: Boolean,
  deprecated: false,
};

export const nextOption = {
  name: 'next',
  shorthand: 'N',
  type: Number,
  deprecated: false,
};

export const confirmOption = {
  name: 'confirm',
  shorthand: 'c',
  type: Boolean,
  deprecated: true,
};

export const limitOption = {
  name: 'limit',
  shorthand: null,
  type: Number,
  deprecated: false,
};
