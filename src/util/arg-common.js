//      

const ARG_COMMON = {
  '--help': Boolean,
  '-h': '--help',

  '--platform-version': Number,
  '-V': '--platform-version',

  '--debug': Boolean,
  '-d': '--debug',

  '--token': String,
  '-t': '--token',

  '--team': String,
  '-T': '--team',

  '--local-config': String,
  '-A': '--local-config',

  '--global-config': String,
  '-Q': '--global-config',

  '--api': String
};

export default () => ARG_COMMON;
