module.exports = async existing => {
  let migrated = false;

  const config = {
    _:
      "This is your Now credentials file. DON'T SHARE! More: https://goo.gl/mbf4CZ"
  };

  if (existing) {
    try {
      const sh = existing.credentials.find(item => item.provider === 'sh');

      if (sh) {
        config.token = sh.token;
      }

      migrated = true;
    } catch (err) {}
  }

  return { config, migrated };
};
