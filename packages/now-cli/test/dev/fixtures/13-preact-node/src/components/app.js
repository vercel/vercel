import { h, Component } from 'preact';
import { Router } from 'preact-router';

import Home from '../routes/home';

export default class App extends Component {
  handleRoute = e => {
    this.currentUrl = e.url;
  };
  render() {
    return (
      <div id="app">
        <Router onChange={this.handleRoute}>
          <Home path="/" />
        </Router>
      </div>
    );
  }
}
