function Error() {
  return 'custom error';
}

Error.getInitialProps = () => {
  return {
    hello: 'world',
  };
};

export default Error;
