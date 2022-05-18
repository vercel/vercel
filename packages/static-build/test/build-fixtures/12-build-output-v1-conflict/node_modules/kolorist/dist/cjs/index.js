"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.link = exports.ansi256Bg = exports.ansi256 = exports.bgLightGray = exports.bgLightCyan = exports.bgLightMagenta = exports.bgLightBlue = exports.bgLightYellow = exports.bgLightGreen = exports.bgLightRed = exports.bgGray = exports.bgWhite = exports.bgCyan = exports.bgMagenta = exports.bgBlue = exports.bgYellow = exports.bgGreen = exports.bgRed = exports.bgBlack = exports.lightCyan = exports.lightMagenta = exports.lightBlue = exports.lightYellow = exports.lightGreen = exports.lightRed = exports.lightGray = exports.gray = exports.white = exports.cyan = exports.magenta = exports.blue = exports.yellow = exports.green = exports.red = exports.black = exports.strikethrough = exports.hidden = exports.inverse = exports.underline = exports.italic = exports.dim = exports.bold = exports.reset = exports.stripColors = exports.options = void 0;
let enabled = true;
// Support both browser and node environments
const globalVar = typeof self !== 'undefined'
    ? self
    : typeof window !== 'undefined'
        ? window
        : typeof global !== 'undefined'
            ? global
            : {};
/**
 * Detect how much colors the current terminal supports
 */
let supportLevel = 0 /* none */;
if (globalVar.process && globalVar.process.env && globalVar.process.stdout) {
    const { FORCE_COLOR, NODE_DISABLE_COLORS, TERM } = globalVar.process.env;
    if (NODE_DISABLE_COLORS || FORCE_COLOR === '0') {
        enabled = false;
    }
    else if (FORCE_COLOR === '1') {
        enabled = true;
    }
    else if (TERM === 'dumb') {
        enabled = false;
    }
    else if ('CI' in globalVar.process.env &&
        [
            'TRAVIS',
            'CIRCLECI',
            'APPVEYOR',
            'GITLAB_CI',
            'GITHUB_ACTIONS',
            'BUILDKITE',
            'DRONE',
        ].some(vendor => vendor in globalVar.process.env)) {
        enabled = true;
    }
    else {
        enabled = process.stdout.isTTY;
    }
    if (enabled) {
        supportLevel =
            TERM && TERM.endsWith('-256color')
                ? 2 /* ansi256 */
                : 1 /* ansi */;
    }
}
exports.options = {
    enabled,
    supportLevel,
};
function kolorist(start, end, level = 1 /* ansi */) {
    const open = `\x1b[${start}m`;
    const close = `\x1b[${end}m`;
    const regex = new RegExp(`\\x1b\\[${end}m`, 'g');
    return (str) => {
        return exports.options.enabled && exports.options.supportLevel >= level
            ? open + ('' + str).replace(regex, open) + close
            : '' + str;
    };
}
function stripColors(str) {
    return ('' + str)
        .replace(/\x1b\[[0-9;]+m/g, '')
        .replace(/\x1b\]8;;.*?\x07(.*?)\x1b\]8;;\x07/g, (_, group) => group);
}
exports.stripColors = stripColors;
// modifiers
exports.reset = kolorist(0, 0);
exports.bold = kolorist(1, 22);
exports.dim = kolorist(2, 22);
exports.italic = kolorist(3, 23);
exports.underline = kolorist(4, 24);
exports.inverse = kolorist(7, 27);
exports.hidden = kolorist(8, 28);
exports.strikethrough = kolorist(9, 29);
// colors
exports.black = kolorist(30, 39);
exports.red = kolorist(31, 39);
exports.green = kolorist(32, 39);
exports.yellow = kolorist(33, 39);
exports.blue = kolorist(34, 39);
exports.magenta = kolorist(35, 39);
exports.cyan = kolorist(36, 39);
exports.white = kolorist(97, 39);
exports.gray = kolorist(90, 39);
exports.lightGray = kolorist(37, 39);
exports.lightRed = kolorist(91, 39);
exports.lightGreen = kolorist(92, 39);
exports.lightYellow = kolorist(93, 39);
exports.lightBlue = kolorist(94, 39);
exports.lightMagenta = kolorist(95, 39);
exports.lightCyan = kolorist(96, 39);
// background colors
exports.bgBlack = kolorist(40, 49);
exports.bgRed = kolorist(41, 49);
exports.bgGreen = kolorist(42, 49);
exports.bgYellow = kolorist(43, 49);
exports.bgBlue = kolorist(44, 49);
exports.bgMagenta = kolorist(45, 49);
exports.bgCyan = kolorist(46, 49);
exports.bgWhite = kolorist(107, 49);
exports.bgGray = kolorist(100, 49);
exports.bgLightRed = kolorist(101, 49);
exports.bgLightGreen = kolorist(102, 49);
exports.bgLightYellow = kolorist(103, 49);
exports.bgLightBlue = kolorist(104, 49);
exports.bgLightMagenta = kolorist(105, 49);
exports.bgLightCyan = kolorist(106, 49);
exports.bgLightGray = kolorist(47, 49);
// 256 support
const ansi256 = (n) => kolorist('38;5;' + n, 0, 2 /* ansi256 */);
exports.ansi256 = ansi256;
const ansi256Bg = (n) => kolorist('48;5;' + n, 0, 2 /* ansi256 */);
exports.ansi256Bg = ansi256Bg;
// Links
const OSC = '\u001B]';
const BEL = '\u0007';
const SEP = ';';
function link(text, url) {
    return exports.options.enabled
        ? OSC + '8' + SEP + SEP + url + BEL + text + OSC + '8' + SEP + SEP + BEL
        : `${text} (\u200B${url}\u200B)`;
}
exports.link = link;
//# sourceMappingURL=index.js.map