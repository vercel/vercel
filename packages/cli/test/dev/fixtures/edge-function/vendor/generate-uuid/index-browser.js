// This uses the `crypto` globaly,
// which will work fine in a browser or Edge Runtime environment

export default function generateUUID(message) {
  return crypto.randomUUID();
}
