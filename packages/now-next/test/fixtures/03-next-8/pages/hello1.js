function A({ data }) {
  return <div>{data}</div>;
}

A.getInitialProps = () => ({ data: 'Hello World 1' });

export default A;
