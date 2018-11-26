import Convert from 'ansi-to-html';

import humanizePath from '../../util/humanize-path';
import sleep from '../../util/sleep';
import installBuilds from './install-builds';
import runBuilds from './run-builds';

module.exports = function createOnboard({ localConfig, output }) {
  const { builds } = localConfig;

  return async function onboard(req, res) {
    // TODO Next will request __next/*, so this should build _once_
    // and the output should be shared *before* it's handled
    if (req.url !== '/') {
      throw new Error(`Cannot build for ${req.url}`);
    }

    // Secret sauce to stream the logs in a pretty way
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
    });

    // Initial styling & structure to send live output to
    res.write(`
      <html>
      <style>
        html { box-sizing: border-box; font-size: 14px; }
        *, *:before, *:after { box-sizing: inherit; }

        ::selection {
          background-color: #79FFE1;
          color: #000;
        }

        @keyframes fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes fadeout {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        body {
          animation: fadein 2s;
          background: #fafafa;
          color: #000;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
          margin: 0;
          padding: 100px 60px;
          text-rendering: optimizeLegibility;
        }

        h1 {
          display: flex;
          font-size: 32px;
          font-weight: 400;
          justify-content: center;
          line-height: 42px;
        }

        h1 img {
          margin-right: 16px;
        }

        h6 {
          color: #999;
          font-size: 12px;
          margin: 20px 0;
        }

        p {
          font-size: 14px;
          font-weight: 400;
          line-height: 24px;
          margin: 0 0 20px 0;
        }

        ol,
        ul {
          padding: 0px;
          margin-left: 15px;
        }

        ul {
          list-style-type: none;
        }

        ul li::before {
          color: rgb(153, 153, 153);
          content: "–";
          display: inline-block;
          margin-left: -15px;
          position: absolute;
        }

        ol li,
        ul li {
          animation: fadein 1s;
          font-size: 14px;
          line-height: 24px;
          margin-bottom: 10px;
        }

        main {
          margin: auto;
          max-width: 80ch;
        }

        section {
          animation: fadein 2s;
          background: #fff;
          border-radius: 5px;
          box-shadow: 0px 2px 5px 0px rgba(0,0,0,0.12);
          margin: 0 auto 50px;
          padding: 10px 30px;
          transition: all 0.2s ease;
        }

        section:hover {
          box-shadow: 0px 5px 10px 0px rgba(0,0,0,0.12);
        }

        pre {
          animation: fadein 2s;
          margin: 40px 0px;
          padding: 0 15px;
        }

        pre code {
          background: #000;
          color: #fff;
          display: block;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace, serif;
          font-size: 13px;
          line-height: 20px;
          margin: 40px 0px;
          overflow: auto;
          padding: 20px;
        }
      </style>

      <body>

        <main>
          <h1>
            <img height="42" src="https://assets.zeit.co/image/upload/front/assets/design/now-black.svg" alt="Now Logo" />
            Now Dev
          </h1>

          <h6>
            ${humanizePath(process.cwd())}
          </h6>

          <section>
            <ol>
    `);

    //
    const streamOutput = new Proxy(output, {
      get(target, prop) {
        // Only wrap output.log
        if (prop !== 'log') {
          return target[prop];
        }

        const { print } = target;
        const convert = new Convert({
          fg: '#fff',
          bg: '#000',
          newline: true,
          escapeXML: true,
          stream: true,
        });

        return function stream(data) {
          res.write(convert.toHtml(`${data}\n`));
          print(data);
        };
      },
    });

    res.write(`<li>Installing&hellip;`);
    await sleep(2000); // Let the page fade-in
    res.write(`<pre><code>`);
    await installBuilds({ builds, output: streamOutput });
    res.write(`</code></pre></li>`);

    res.write(`<li>Initializing&hellip;`);
    await sleep(100); // Wait for the stream
    res.write(`<pre><code>`);
    await runBuilds({ builds, output: streamOutput });
    res.write(`</code></pre></li>`);

    await sleep(100); // Wait for the stream
    res.write(`<li>Reloading&hellip;</li>`);

    res.write(`<style>body { animation: fadeout 1s forwards; }</style>`);
    res.write(`<script>window.location.reload();</script>`);
    res.end();
  };
};
