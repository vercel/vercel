import { register } from 'node:module';

register(new URL('./hooks.mjs', import.meta.url), import.meta.url);
