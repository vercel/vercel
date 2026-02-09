import { register } from 'node:module';
// Disabling network blocking logic while introspection is opt-in
// import './block-network.js';

register(new URL('./hooks.mjs', import.meta.url), import.meta.url);
