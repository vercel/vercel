"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.warn = void 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
const warn = (...args) => console.warn("[rollup-plugin-visualizer]", ...args);
exports.warn = warn;
