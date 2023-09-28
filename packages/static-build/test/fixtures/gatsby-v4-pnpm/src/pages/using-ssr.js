import * as React from 'react';

const UsingSSR = ({ serverData }) => {
  return (
    <div>
      <h1>This page is {serverData.message}</h1>
    </div>
  );
};

export const Head = () => <title>Using SSR</title>;

export default UsingSSR;

export async function getServerData() {
  return {
    props: { message: 'rendered server-side'},
  }
}
