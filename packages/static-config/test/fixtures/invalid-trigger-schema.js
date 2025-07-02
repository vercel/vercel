export const config = {
  runtime: 'nodejs18.x',
  experimentalTriggers: [
    {
      triggerVersion: 2, // Invalid - should be 1
      specversion: '2.0', // Invalid - should be '1.0'
      type: '', // Invalid - cannot be empty
      httpBinding: {
        mode: 'binary', // Invalid - should be 'structured'
        method: 'PUT' // Invalid - should be GET, POST, or HEAD
      }
    }
  ]
};

export default function (req, res) {
  res.end('Invalid trigger config');
}
