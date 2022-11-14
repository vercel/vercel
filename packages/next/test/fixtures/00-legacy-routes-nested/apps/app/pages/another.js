function Another() {
  return 'another page';
}

Another.getInitialProps = () => {
  return {
    hello: 'world',
  };
};

export default Another;
