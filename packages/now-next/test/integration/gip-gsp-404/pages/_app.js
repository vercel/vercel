function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

MyApp.getInitialProps = () => {
  console.log('App.getInitialProps');
  return {
    random: Math.random(),
    hello: 'world',
  };
};

export default MyApp;
