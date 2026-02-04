for (const mod of ['net', 'dns', 'http', 'https', 'tls', 'dgram']) {
  try {
    const m = require(mod);
    for (const key of Object.keys(m)) {
      m[key] = new Proxy(m[key], {
        apply() {
          throw new Error('Networking is disabled');
        },
      });
    }
  } catch {
    // ignore
  }
}
