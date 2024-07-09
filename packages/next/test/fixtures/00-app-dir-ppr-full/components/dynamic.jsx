import React from 'react'
import { headers } from 'next/headers'

export const Dynamic = ({ pathname, fallback }) => {
  if (fallback) {
    return <div>Loading...</div>
  }

  const messages = [];
  const names = ['x-test-input', 'user-agent'];
  const list = headers();

  for (const name of names) {
    messages.push({ name, value: list.get(name) });
  }

  return (
    <div id="needle">
      <dl>
        {pathname && (
          <>
            <dt>Pathname</dt>
            {/* We're encoding this using the following format so that even if
                the HTML is sent as flight data, it will still retain the same
                content, and can be inspected without having to run the
                javascript. */}
            <dd data-pathname={`data-pathname=${pathname}`}>{pathname}</dd>
          </>
        )}
        {messages.map(({ name, value }) => (
          <React.Fragment key={name}>
            <dt>
              Header: <code>{name}</code>
            </dt>
            <dd>{value ?? 'null'}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};
