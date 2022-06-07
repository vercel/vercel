import { IncomingMessage, ServerResponse } from 'http';

export default (req: IncomingMessage, res: ServerResponse) => res.end('Vercel');
