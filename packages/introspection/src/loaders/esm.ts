import { register } from 'node:module';
import './block-network.js';

register(new URL('./hooks.mjs', import.meta.url), import.meta.url);
