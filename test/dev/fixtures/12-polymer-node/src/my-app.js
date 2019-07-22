/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';
import {
  setPassiveTouchGestures,
  setRootPath
} from '@polymer/polymer/lib/utils/settings.js';
// import '@polymer/app-layout/app-drawer/app-drawer.js';
// import '@polymer/app-layout/app-drawer-layout/app-drawer-layout.js';
// import '@polymer/app-layout/app-header/app-header.js';
// import '@polymer/app-layout/app-header-layout/app-header-layout.js';
// import '@polymer/app-layout/app-scroll-effects/app-scroll-effects.js';
// import '@polymer/app-layout/app-toolbar/app-toolbar.js';
// import '@polymer/app-route/app-location.js';
// import '@polymer/app-route/app-route.js';
// import '@polymer/iron-pages/iron-pages.js';
// import '@polymer/iron-selector/iron-selector.js';
// import '@polymer/paper-icon-button/paper-icon-button.js';
// import './my-icons.js';

import '@polymer/iron-ajax/iron-ajax.js';

// Gesture events like tap and track generated from touch will not be
// preventable, allowing for better scrolling performance.
setPassiveTouchGestures(true);

// Set Polymer's root path to the same value we passed to our service worker
// in `index.html`.
setRootPath(MyAppGlobals.rootPath);

class MyApp extends PolymerElement {
  static get template() {
    return html`
      <style>
        :host {
          display: block;
        }
        main {
          align-content: center;
          box-sizing: border-box;
          display: grid;
          font-family: 'SF Pro Text', 'SF Pro Icons', 'Helvetica Neue',
            'Helvetica', 'Arial', sans-serif;
          hyphens: auto;
          line-height: 1.65;
          margin: 0 auto;
          max-width: 680px;
          min-height: 100vh;
          padding: 72px 0;
          text-align: center;
        }
        h1 {
          font-size: 45px;
        }
        h2 {
          margin-top: 1.5em;
        }
        p {
          font-size: 16px;
        }
        a {
          border-bottom: 1px solid white;
          color: #0076ff;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        a:hover {
          border-bottom: 1px solid #0076ff;
        }
        code,
        pre {
          color: #d400ff;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace,
            serif;
          font-size: 0.92em;
        }
        code:before,
        code:after {
          content: '\`';
        }
      </style>
      <main>
        <h1>Polymer + Node.js API</h1>
        <h2>
          Deployed with
          <a
            href="https://zeit.co/docs"
            target="_blank"
            rel="noreferrer noopener"
            >ZEIT Now</a
          >!
        </h2>
        <p>
          <a
            href="https://github.com/zeit/now-examples/blob/master/polymer-node"
            target="_blank"
            rel="noreferrer noopener"
            >This project</a
          >
          is a
          <a href="https://polymer-library.polymer-project.org/3.0/api/"
            >Polymer</a
          >
          app with four directories,
          <code>/images</code>
          for static assets,
          <code>/src</code> for components and content, <code>/test</code> for
          unit tests, and
          <code>/api</code>
          which contains a serverless
          <a href="https://nodejs.org/en/">Node.js</a>
          function. See
          <a href="/api/date">
            <code>api/date</code> for the Date API with Node.js</a
          >.
        </p>
        <br />
        <h2>The date according to Node.js is:</h2>
        <p>[[date]]</p>
        <iron-ajax
          auto
          url="/api/date"
          handle-as="text"
          debounce-duration="300"
          last-response="{{date}}"
        >
        </iron-ajax>
      </main>
    `;
  }

  //   static get properties() {
  //     return {
  //       page: {
  //         type: String,
  //         reflectToAttribute: true,
  //         observer: '_pageChanged'
  //       },
  //       routeData: Object,
  //       subroute: Object
  //     };
  //   }

  //   static get observers() {
  //     return [
  //       '_routePageChanged(routeData.page)'
  //     ];
  //   }

  //   _routePageChanged(page) {
  //      // Show the corresponding page according to the route.
  //      //
  //      // If no page was found in the route data, page will be an empty string.
  //      // Show 'view1' in that case. And if the page doesn't exist, show 'view404'.
  //     if (!page) {
  //       this.page = 'view1';
  //     } else if (['view1', 'view2', 'view3'].indexOf(page) !== -1) {
  //       this.page = page;
  //     } else {
  //       this.page = 'view404';
  //     }

  //     // Close a non-persistent drawer when the page & route are changed.
  //     if (!this.$.drawer.persistent) {
  //       this.$.drawer.close();
  //     }
  //   }

  //   _pageChanged(page) {
  //     // Import the page component on demand.
  //     //
  //     // Note: `polymer build` doesn't like string concatenation in the import
  //     // statement, so break it up.
  //     switch (page) {
  //       case 'view1':
  //         import('./my-view1.js');
  //         break;
  //       case 'view2':
  //         import('./my-view2.js');
  //         break;
  //       case 'view3':
  //         import('./my-view3.js');
  //         break;
  //       case 'view404':
  //         import('./my-view404.js');
  //         break;
  //     }
  //   }
}

window.customElements.define('my-app', MyApp);
