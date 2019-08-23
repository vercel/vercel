import { h, Component } from 'preact';

class Home extends Component {
  state = {
    date: undefined
  };
  componentDidMount() {
    fetch('/api/date')
      .then(res => res.text())
      .then(date => this.setState({ date }));
  }
  render() {
    const { date } = this.state;
    return (
      <main>
        <h1>Preact + Node.js API</h1>
        <h2>
          Deployed with{' '}
          <a
            href="https://zeit.co/docs"
            target="_blank"
            rel="noreferrer noopener"
          >
            ZEIT Now
          </a>
          !
        </h2>
        <p>
          <a
            href="https://github.com/zeit/now-examples/blob/master/preact-node"
            target="_blank"
            rel="noreferrer noopener"
          >
            This project
          </a>{' '}
          is a <a href="https://preactjs.com/">Preact</a> app and contains two
          directories, <code>/src</code> for components, routing and content,
          and <code>/api</code> which contains a serverless{' '}
          <a href="https://nodejs.org/en/">Node.js</a> function. See{' '}
          <a href="/api/date">
            <code>api/date</code> for the Date API with Node.js
          </a>
          .
        </p>
        <br />
        <h2>The date according to Node.js is:</h2>
        <p>{date ? date : 'Loading date...'}</p>
      </main>
    );
  }
}

export default Home;
