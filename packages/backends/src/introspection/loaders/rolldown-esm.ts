import { register } from 'node:module';

register(new URL('./rolldown-hooks.mjs', import.meta.url), import.meta.url);
