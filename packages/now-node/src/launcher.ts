import { Server } from 'http';
import { Bridge } from './bridge';

let listener;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// PLACEHOLDER

const server = new Server(listener);
const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
