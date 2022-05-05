import { withRouter } from 'next/router';

function Index({ router }) {
  const data = {
    pathname: router.pathname,
    query: router.query,
  };
  return <div>{JSON.stringify(data)}</div>;
}

export default withRouter(Index);
