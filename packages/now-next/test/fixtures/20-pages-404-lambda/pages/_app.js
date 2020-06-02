const App = ({ Component, pageProps }) => <Component {...pageProps} />;

App.getInitialProps = () => ({ hello: 'world' });

export default App;
