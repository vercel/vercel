function Index() {
  return 'index page';
}

Index.getInitialProps = () => {
  return {
    hello: 'world',
  };
};

export default Index;
