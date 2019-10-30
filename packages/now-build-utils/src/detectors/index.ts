import AggregateError from 'aggregate-error';
import DetectorFilesystem from './filesystem';
import { Detector, DetectorParameters, DetectorResult } from '../types';

import cra from './create-react-app';
import docusaurus from './docusaurus';
import eleventy from './eleventy';
import ember from './ember';
import hexo from './hexo';
import hugo from './hugo';
import gatsby from './gatsby';
import preact from './preact';

export { DetectorFilesystem };

export const detectors: Detector[] = [
  cra,
  docusaurus,
  eleventy,
  ember,
  gatsby,
  hexo,
  hugo,
  preact,
];

function firstTruthy<T>(promises: Promise<T>[]) {
  return new Promise<T>((resolve, reject) => {
    const errors: Array<Error> = [];
    let unresolved = promises.length;
    for (const p of promises) {
      p.then(v => {
        if (v || --unresolved === 0) {
          resolve(v);
        }
      }).catch(err => {
        errors.push(err);
        if (--unresolved === 0) {
          reject(new AggregateError(errors));
        }
      });
    }
  });
}

export async function detectDefaults(
  params: DetectorParameters
): Promise<DetectorResult> {
  const d: Detector[] = params.detectors || detectors;
  return firstTruthy(d.map(detector => detector(params)));
}
