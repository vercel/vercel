"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isModuleTree = void 0;
const isModuleTree = (mod) => "children" in mod;
exports.isModuleTree = isModuleTree;
