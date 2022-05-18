"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHtml = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const htmlEscape = (str) => str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const buildHtmlTemplate = (title, script, nodesData, style) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
  <title>${htmlEscape(title)}</title>
  <style>
${style}
  </style>
</head>
<body>
  <main></main>
  <script>
  /*<!--*/
${script}
  /*-->*/
  </script>
  <script>
    /*<!--*/
    const data = ${nodesData};

    const run = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      const chartNode = document.querySelector("main");
      drawChart.default(chartNode, data, width, height);
    };

    window.addEventListener('resize', run);

    document.addEventListener('DOMContentLoaded', run);
    /*-->*/
  </script>
</body>
</html>

`;
async function buildHtml({ title, data, template }) {
    const [script, style] = await Promise.all([
        fs_1.promises.readFile(path_1.default.join(__dirname, "..", "lib", `${template}.js`), "utf8"),
        fs_1.promises.readFile(path_1.default.join(__dirname, "..", "lib", `${template}.css`), "utf8"),
    ]);
    return buildHtmlTemplate(title, script, JSON.stringify(data), style);
}
exports.buildHtml = buildHtml;
