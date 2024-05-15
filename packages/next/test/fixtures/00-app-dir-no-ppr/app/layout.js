export const metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'http://localhost:3000'),
};

export default function Root({ children }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        <title>{`hello world`}</title>
      </head>
      <body className="this-is-the-document-body">{children}</body>
    </html>
  );
}
