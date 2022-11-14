import nodeFetch from 'node-fetch';
import setupZeitFetch from '@zeit/fetch';

const zeitFetch = setupZeitFetch(nodeFetch);

export { zeitFetch, nodeFetch };
