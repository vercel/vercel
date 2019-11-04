import AggregateError from 'aggregate-error';
import DetectorFilesystem from './filesystem';
import { Detector, DetectorParameters, DetectorResult } from '../types';

import cra from './create-react-app';
import docusaurus from './docusaurus';
import eleventy from './eleventy';
import ember from './ember';
import gatsby from './gatsby';
import hexo from './hexo';
import hugo from './hugo';
import jekyll from './jekyll';
import next from './next';
import preact from './preact';
import vue from './vue';

export { DetectorFilesystem };

export const pkgDetectors: Detector[] = [
  cra,
  docusaurus,
  eleventy,
  ember,
  gatsby,
  hexo,
  next,
  preact,
  vue,
];

export const detectors: Detector[] = [hugo, jekyll];

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
  // The `package.json` detectors are run first, since they share the common
  // file read of `package.json` and are the most popular frameworks
  let d: Detector[] = params.pkgDetectors || pkgDetectors;
  let result: DetectorResult = await firstTruthy(
    d.map(detector => detector(params))
  );
  if (!result) {
    // If no `package.json` framework was detected then check the non-pkg ones
    d = params.detectors || detectors;
    result = await firstTruthy(d.map(detector => detector(params)));
  }
  return result;
}
