"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

exports.__esModule = true;
exports.webVitals = webVitals;

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

var _webVitals2 = require("web-vitals");

var isRegistered = false;

function onError(err) {
  console.error("[gatsby-plugin-vercel]", err); // eslint-disable-line no-console
}

function onDebug(label, payload) {
  console.log(label, payload); // eslint-disable-line no-console
}

function sendToAnalytics(metric, options) {
  var _$exec, _document$querySelect;

  // Scrape the intial component name from the DOM:
  var pageScript = [].slice.call((_$exec = /^\/component---(.+)\-(.+?)\-.{20}\.js$/.exec((_document$querySelect = document.querySelector("script[src^=\"/component---\"]")) === null || _document$querySelect === void 0 ? void 0 : _document$querySelect.getAttribute("src"))) !== null && _$exec !== void 0 ? _$exec : []).slice(1).join("-");
  var chunkMapping = self.___chunkMapping ? typeof self.___chunkMapping === "string" ? JSON.parse(self.___chunkMapping) : self.___chunkMapping : {}; // Verify page name is correct:

  var pageName = "component---" + pageScript in chunkMapping ? pageScript : null;

  if (options.debug && !pageName) {
    onDebug("[gatsby-plugin-vercel]", "Unable to detect Page Name, skipping reporting.");
  }

  var body = {
    dsn: options.analyticsId,
    id: metric.id,
    page: pageName !== null && pageName !== void 0 ? pageName : "",
    href: location.href,
    event_name: metric.name,
    value: metric.value.toString(),
    speed: "connection" in navigator && navigator["connection"] && "effectiveType" in navigator["connection"] ? navigator["connection"]["effectiveType"] : ""
  };

  if (options.debug) {
    onDebug(metric.name, JSON.stringify(body, null, 2));
  }

  var blob = new Blob([new URLSearchParams(body).toString()], {
    // This content type is necessary for `sendBeacon`:
    type: "application/x-www-form-urlencoded"
  });
  var vitalsUrl = "https://vitals.vercel-analytics.com/v1/vitals";
  navigator.sendBeacon && navigator.sendBeacon(vitalsUrl, blob) || fetch(vitalsUrl, {
    body: blob,
    method: "POST",
    credentials: "omit",
    keepalive: true
  });
}

function webVitals(_x) {
  return _webVitals.apply(this, arguments);
}

function _webVitals() {
  _webVitals = (0, _asyncToGenerator2.default)( /*#__PURE__*/_regenerator.default.mark(function _callee(_ref) {
    var options;
    return _regenerator.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            options = _ref.options;

            if (!isRegistered) {
              _context.next = 3;
              break;
            }

            return _context.abrupt("return");

          case 3:
            isRegistered = true;

            try {
              (0, _webVitals2.getFID)(function (metric) {
                return sendToAnalytics(metric, options);
              });
              (0, _webVitals2.getTTFB)(function (metric) {
                return sendToAnalytics(metric, options);
              });
              (0, _webVitals2.getLCP)(function (metric) {
                return sendToAnalytics(metric, options);
              });
              (0, _webVitals2.getCLS)(function (metric) {
                return sendToAnalytics(metric, options);
              });
              (0, _webVitals2.getFCP)(function (metric) {
                return sendToAnalytics(metric, options);
              });
            } catch (err) {
              onError(err);
            }

          case 5:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));
  return _webVitals.apply(this, arguments);
}
