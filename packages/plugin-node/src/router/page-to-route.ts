import { getRouteRegex } from './route-regex';

export function pageToRoute(page: string) {
  const routeRegex = getRouteRegex(page);
  return {
    page,
    regex: normalizeRouteRegex(routeRegex.re.source),
    routeKeys: routeRegex.routeKeys,
    namedRegex: routeRegex.namedRegex,
  };
}

export function normalizeRouteRegex(regex: string) {
  // clean up un-necessary escaping from regex.source which turns / into \\/
  return regex.replace(/\\\//g, '/');
}
