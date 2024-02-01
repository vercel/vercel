import crypto from 'crypto';

// this uses a core Node library,
// which will fail to execute in a browser or Edge Runtime context

export default function say(message) {
  return crypto.generateUUID();
}
