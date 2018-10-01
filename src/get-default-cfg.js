module.exports = async (existingCopy) => {
  let migrated = false

  const config = {
    _: 'This is your Now config file. See `now config help`. More: https://goo.gl/5aRS2s'
  }

  if (existingCopy) {
    try {
      const existing = Object.assign({}, existingCopy);
      const sh = Object.assign({}, existing.sh || {});

      delete existing.sh
      delete existing.gcp
      delete existing.aws

      Object.assign(config, existing, sh);
      migrated = true
    } catch (err) {}
  }

  return {config, migrated}
}
