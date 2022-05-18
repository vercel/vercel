// Missing type definitions

import { Server } from 'net';

export = wrapShutdown;

interface WithShutdown extends Server {
  shutdown(cb: (err?: Error) => any): void;
  forceShutdown(cb: (err?: Error) => any): void;
}

declare function wrapShutdown<S extends Server>(s: S): S & WithShutdown;
