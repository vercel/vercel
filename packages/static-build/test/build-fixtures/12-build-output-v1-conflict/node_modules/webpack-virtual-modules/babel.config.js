module.exports = {
  plugins: [
    `@babel/plugin-transform-modules-commonjs`,
    `@babel/plugin-proposal-class-properties`,
    'babel-plugin-replace-ts-export-assignment',
  ],
  presets: [`@babel/preset-typescript`],
};
