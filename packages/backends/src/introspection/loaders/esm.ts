// ESM Loader (for import interception via --import flag)
import { register } from 'node:module';

register(new URL('./hooks.js', import.meta.url), import.meta.url);
