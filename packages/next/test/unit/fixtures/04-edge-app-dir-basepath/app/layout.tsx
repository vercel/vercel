export const runtime = 'edge';

const Layout = ({ children }: any) => {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
};

export default Layout;
