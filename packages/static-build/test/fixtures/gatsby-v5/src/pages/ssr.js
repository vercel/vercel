import * as React from 'react';

const UsingSSR = ({ serverData }) => {
  return (
    <>
      <h1>
        This page is {serverData.message}
      </h1>
    </>
  );
};

export const Head = () => <title>SSR Gatsby</title>;

export default UsingSSR;

export async function getServerData() {
  return {
    props: { message: 'rendered server-side' },
  }
}
