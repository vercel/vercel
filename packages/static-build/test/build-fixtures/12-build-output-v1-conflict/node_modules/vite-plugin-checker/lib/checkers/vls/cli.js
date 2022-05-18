var import_commander = require("commander");
var import_diagnostics = require("./diagnostics");
function getVersion() {
  const { version } = require("../../../package.json");
  return `v${version}`;
}
function validateLogLevel(logLevelInput) {
  return typeof logLevelInput === "string" && import_diagnostics.logLevels.includes(logLevelInput);
}
;
(async () => {
  const program = new import_commander.Command();
  program.name("vti").description("Vetur Terminal Interface").version(getVersion());
  program.command("diagnostics [workspace]").description("Print all diagnostics").addOption(new import_commander.Option("-c, --checker-config <checkerConfig>", "Option overrides to pass to VTI").default("{}")).addOption(new import_commander.Option("-l, --log-level <logLevel>", "Log level to print").default("WARN").choices(import_diagnostics.logLevels)).action(async (workspace, options) => {
    const logLevelOption = options.logLevel;
    if (!validateLogLevel(logLevelOption)) {
      throw new Error(`Invalid log level: ${logLevelOption}`);
    }
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(options.checkerConfig);
    } catch {
      throw new Error(`Unable to parse checker-config JSON: ${options.checkerConfig}`);
    }
    await (0, import_diagnostics.diagnostics)(workspace, logLevelOption, {
      watch: false,
      verbose: false,
      config: parsedConfig
    });
  });
  program.parse(process.argv);
})().catch((err) => {
  console.error(`VTI operation failed with error`);
  console.error(err.stack);
  process.exit(1);
});
//# sourceMappingURL=cli.js.map