import * as React from 'react';

const DSGPage = () => {
  return (
    <>
      <h1>
        This page is DSG
      </h1>
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
