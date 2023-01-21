import * as React from 'react';
import { Link } from 'gatsby';

const DSGPage = () => {
  return (
    <>
      <h1>
        This page is <b>DSG</b>
      </h1>
      <Link to="/">Go back to the homepage</Link>
    </>
  );
};

export const Head = () => <title>SSR Gatsby</title>;

export default DSGPage;

export async function config() {
  // Optionally use GraphQL here

  return ({ params }) => {
    return {
      defer: true,
    };
  };
}
