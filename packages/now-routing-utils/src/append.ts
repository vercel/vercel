import { AppendRoutesToPhaseProps } from './types';
import { isHandler } from './index';

export function appendRoutesToPhase({
  routes: prevRoutes,
  newRoutes,
  phase,
}: AppendRoutesToPhaseProps) {
  const routes = prevRoutes ? [...prevRoutes] : [];
  if (newRoutes === null || newRoutes.length === 0) {
    return routes;
  }
  let isInPhase = false;
  let insertIndex = -1;

  routes.forEach((r, i) => {
    if (isHandler(r)) {
      if (r.handle === phase) {
        isInPhase = true;
      } else if (isInPhase) {
        insertIndex = i;
        isInPhase = false;
      }
    }
  });

  if (isInPhase) {
    routes.push(...newRoutes);
  } else if (insertIndex > -1) {
    routes.splice(insertIndex, 0, ...newRoutes);
  } else {
    routes.push({ handle: phase });
    routes.push(...newRoutes);
  }
  return routes;
}
