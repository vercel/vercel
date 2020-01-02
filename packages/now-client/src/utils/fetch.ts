import nodeFetch from 'node-fetch';
import zeitFetch from '@zeit/fetch';

const fetch = zeitFetch(nodeFetch);

export default fetch;
