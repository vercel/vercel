const noop = () => {
};
const debug = () => console.debug;
Object.assign(debug, {
  default: debug,
  coerce: noop,
  disable: noop,
  enable: noop,
  enabled: noop,
  humanize: noop,
  destroy: noop,
  init: noop,
  log: console.debug,
  formatArgs: noop,
  save: noop,
  load: noop,
  useColors: noop,
  colors: [],
  inspectOpts: {},
  names: [],
  skips: [],
  formatters: {},
  selectColors: noop
});
export default debug;
