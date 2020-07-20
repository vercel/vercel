function B({ data }) {
  return <div>{data}</div>;
}

B.getInitialProps = () => ({ data: 'Hello World 2' });

export default B;
