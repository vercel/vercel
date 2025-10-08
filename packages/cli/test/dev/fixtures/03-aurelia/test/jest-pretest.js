import 'aurelia-polyfills';
import {Options} from 'aurelia-loader-nodejs';
import {globalize} from 'aurelia-pal-nodejs';
import path from 'path';
Options.relativeToDir = path.join(__dirname, 'unit');
globalize();
