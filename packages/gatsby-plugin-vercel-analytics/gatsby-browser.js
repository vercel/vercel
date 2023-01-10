"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

exports.__esModule = true;
exports.onClientEntry = void 0;

var _extends2 = _interopRequireDefault(require("@babel/runtime/helpers/extends"));

var _webVitals = require("./web-vitals");

var onClientEntry = function onClientEntry(_, pluginOptions) {
  if (pluginOptions === void 0) {
    pluginOptions = {};
  }

  var options = (0, _extends2.default)({
    debug: false
  }, pluginOptions, {
    analyticsId: process.env.GATSBY_VERCEL_ANALYTICS_ID
  });

  if (!options.analyticsId) {
    return null;
  }

  if (options.debug || process.env.NODE_ENV === "production") {
    (0, _webVitals.webVitals)({
      options: options
    });
  }
};

exports.onClientEntry = onClientEntry;
