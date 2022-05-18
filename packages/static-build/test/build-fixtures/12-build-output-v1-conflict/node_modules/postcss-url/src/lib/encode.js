'use strict';

/**
 * Optimize encoding SVG files (IE9+, Android 3+)
 * @see https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
 *
 * @param {String} svgContent
 * @returns {String}
 */
const optimizedSvgEncode = (svgContent) => {
    const result = encodeURIComponent(svgContent)
        .replace(/%3D/g, '=')
        .replace(/%3A/g, ':')
        .replace(/%2F/g, '/')
        .replace(/%22/g, "'")
        .replace(/%2C/g, ',')
        .replace(/%3B/g, ';');

    // Lowercase the hex-escapes for better gzipping
    return result.replace(/(%[0-9A-Z]{2})/g, (matched, AZ) => {
        return AZ.toLowerCase();
    });
};
/**
 * Encoding file contents to string
 *
 * @param {PostcssUrl~File} file
 * @param {String} [encodeType=base64|encodeURI|encodeURIComponent]
 * @param {Boolean} [shouldOptimizeURIEncode]
 * @returns {string}
 */

module.exports = (file, encodeType, shouldOptimizeSvgEncode) => {
    const dataMime = `data:${file.mimeType}`;

    if (encodeType === 'base64') {
        return `${dataMime};base64,${file.contents.toString('base64')}`;
    }

    const encodeFunc = encodeType === 'encodeURI' ? encodeURI : encodeURIComponent;

    const content = file.contents.toString('utf8')
        // removing new lines
        .replace(/\n+/g, '');

    let encodedStr = (shouldOptimizeSvgEncode && encodeType === 'encodeURIComponent')
        ? optimizedSvgEncode(content)
        : encodeFunc(content);

    encodedStr = encodedStr
        .replace(/%20/g, ' ')
        .replace(/#/g, '%23');

    return `${dataMime},${encodedStr}`;
};
