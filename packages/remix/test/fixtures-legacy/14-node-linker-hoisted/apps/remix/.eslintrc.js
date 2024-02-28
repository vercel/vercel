const OFF = "off"
const ERROR = "error"

/**
 * @type {import('@types/eslint').Linter.BaseConfig}
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/no-non-null-assertion": OFF,
    "@typescript-eslint/no-var-requires": ERROR,
    "@typescript-eslint/no-non-null-asserted-optional-chain": OFF,
    "react/function-component-definition": ERROR,
    "@typescript-eslint/no-unused-vars": [ERROR, { args: "none", argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "react/prop-types": OFF,
    "react/no-unescaped-entities": OFF,
  },
  settings: {
    react: {
      version: "detect",
    },
  },
}
