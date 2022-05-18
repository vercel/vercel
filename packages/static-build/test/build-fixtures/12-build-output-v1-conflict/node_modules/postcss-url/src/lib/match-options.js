'use strict';

const minimatch = require('minimatch');
const path = require('path');

const paths = require('./paths');

const isUrlShouldBeIgnored = paths.isUrlShouldBeIgnored;

/**
 * Returns whether the given asset matches the given pattern
 * Allways returns true if the given pattern is empty
 *
 * @param {PostcssUrl~Asset} asset the processed asset
 * @param {String|RegExp|Function} pattern A minimatch string,
 *   regular expression or function to test the asset
 *
 * @returns {Boolean}
 */
const matchesFilter = (asset, pattern) => {
    const relativeToRoot = path.relative(process.cwd(), asset.absolutePath);

    if (typeof pattern === 'string') {
        pattern = minimatch.filter(pattern);

        return pattern(relativeToRoot);
    }

    if (pattern instanceof RegExp) {
        return pattern.test(relativeToRoot);
    }

    if (pattern instanceof Function) {
        return pattern(asset);
    }

    return true;
};

/**
 * Matching single option
 *
 * @param {PostcssUrl~Asset} asset
 * @param {PostcssUrl~Options} option
 * @returns {Boolean}
 */
const matchOption = (asset, option) => {
    const matched = matchesFilter(asset, option.filter);

    if (!matched) return false;

    return typeof option.url === 'function' || !isUrlShouldBeIgnored(asset.url, option);
};

const isMultiOption = (option) =>
    option.multi && typeof option.url === 'function';

/**
 * Matching options by asset
 *
 * @param {PostcssUrl~Asset} asset
 * @param {PostcssUrl~Options|PostcssUrl~Options[]} options
 * @returns {PostcssUrl~Options|undefined}
 */
const matchOptions = (asset, options) => {
    if (!options) return;

    if (Array.isArray(options)) {
        const optionIndex = options.findIndex((option) => matchOption(asset, option));

        if (optionIndex < 0) return;

        const matchedOption = options[optionIndex];

        // if founded option is last
        if (optionIndex === options.length - 1) return matchedOption;

        const extendOptions = options
            .slice(optionIndex + 1)
            .filter((option) =>
                (isMultiOption(matchedOption) || isMultiOption(option)) && matchOption(asset, option)
            );

        return extendOptions.length
            ? [matchedOption].concat(extendOptions)
            : matchedOption;
    }

    if (matchOption(asset, options)) return options;
};

module.exports = matchOptions;
