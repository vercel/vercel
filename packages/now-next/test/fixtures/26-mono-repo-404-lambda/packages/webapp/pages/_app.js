const App = ({ Component, pageProps }) => <Component {...pageProps} />;

App.getInitialProps = async ({ ctx, Component }) => {
  let pageProps = {};

  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx);
  }
  return { pageProps };
};

export default App;
