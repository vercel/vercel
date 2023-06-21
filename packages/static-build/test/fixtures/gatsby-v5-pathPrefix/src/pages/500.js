import * as React from 'react';
import { Link } from 'gatsby';

const pageStyles = {
  color: '#232129',
  padding: '96px',
  fontFamily: '-apple-system, Roboto, sans-serif, serif',
};
const headingStyles = {
  marginTop: 0,
  marginBottom: 64,
  maxWidth: 320,
};

const paragraphStyles = {
  marginBottom: 48,
};
const codeStyles = {
  color: '#8A6534',
  padding: 4,
  backgroundColor: '#FFF4DB',
  fontSize: '1.25rem',
  borderRadius: 4,
};

const Error500Page = () => {
  return (
    <main style={pageStyles}>
      <h1 style={headingStyles}>Broke!</h1>
      <p style={paragraphStyles}>
        This is a custom 500 page.
        <br />
        <Link to="/">Go home</Link>.
      </p>
    </main>
  );
};

export default Error500Page;

export const Head = () => <title>Error!</title>;
