module.exports = (req, res) => {
  try {
    if (req) {
      throw new Error(`Should throw ${process.env.RANDOMNESS_ENV_VAR}`);
    }
    res.end(`Should not print ${process.env.RANDOMNESS_ENV_VAR}`);
  } catch (error) {
    res.end(error.stack);
  }
};
