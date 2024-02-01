import React from 'react';

function MyApp({ Component, pageProps }) {
  return React.createElement(Component, pageProps);
}

MyApp.getInitialProps = () => {
  console.log('App.getInitialProps');
  return {
    random: Math.random(),
    hello: 'world',
  };
};

export default MyApp;
