import * as React from 'react';

import Layout from '../components/layout';
import Seo from '../components/seo';

const UsingDSG = () => (
  <Layout>
    <h1>
      Hello from a DSG Page
    </h1>
  </Layout>
);

export const Head = () => <Seo title="Using DSG" />;

export default UsingDSG;
