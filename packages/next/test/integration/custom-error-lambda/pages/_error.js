// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js custom error page convention
function Error() {
  return 'custom error';
}

Error.getInitialProps = () => {
  return {
    hello: 'world',
  };
};

export default Error;
