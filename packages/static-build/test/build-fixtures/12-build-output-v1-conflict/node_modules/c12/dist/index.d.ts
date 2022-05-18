interface DotenvOptions {
    /**
     * The project root directory (either absolute or relative to the current working directory).
    */
    cwd: string;
    /**
     * What file to look in for environment variables (either absolute or relative
     * to the current working directory). For example, `.env`.
    */
    fileName?: string;
    /**
     * Whether to interpolate variables within .env.
     *
     * @example
     * ```env
     * BASE_DIR="/test"
     * # resolves to "/test/further"
     * ANOTHER_DIR="${BASE_DIR}/further"
     * ```
     */
    interpolate?: boolean;
    /**
     * An object describing environment variables (key, value pairs).
    */
    env?: NodeJS.ProcessEnv;
}
declare type Env = typeof process.env;
/**
 * Load and interpolate environment variables into `process.env`.
 * If you need more control (or access to the values), consider using `loadDotenv` instead
 *
 */
declare function setupDotenv(options: DotenvOptions): Promise<Env>;
/** Load environment variables into an object. */
declare function loadDotenv(opts: DotenvOptions): Promise<Env>;

interface InputConfig extends Record<string, any> {
}
interface ConfigLayer<T extends InputConfig = InputConfig> {
    config: T;
    cwd?: string;
    configFile?: string;
}
interface ResolvedConfig<T extends InputConfig = InputConfig> extends ConfigLayer<T> {
    layers?: ConfigLayer<T>[];
    cwd?: string;
}
interface ResolveConfigOptions {
    cwd: string;
}
interface LoadConfigOptions<T extends InputConfig = InputConfig> {
    name?: string;
    cwd?: string;
    configFile?: string;
    rcFile?: false | string;
    globalRc?: boolean;
    dotenv?: boolean | DotenvOptions;
    defaults?: T;
    overrides?: T;
    resolve?: (id: string, opts: LoadConfigOptions) => null | ResolvedConfig | Promise<ResolvedConfig | null>;
    extend?: false | {
        extendKey?: string;
    };
}
declare function loadConfig<T extends InputConfig = InputConfig>(opts: LoadConfigOptions<T>): Promise<ResolvedConfig<T>>;

export { ConfigLayer, DotenvOptions, Env, InputConfig, LoadConfigOptions, ResolveConfigOptions, ResolvedConfig, loadConfig, loadDotenv, setupDotenv };
