process.env.NEXT_BUILDER_INTEGRATION = '1';
process.env.NEXT_TELEMETRY_DISABLED = '1';

const path = require('path');
const builder = require('../../');
const {
  createRunBuildLambda,
} = require('../../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

// A partially prerendered output holds the postponed state followed by the
// prerendered content, and `state-length` is where the CDN cuts the two apart.
// The fixture keys the element around its postponed boundary `Doppelgänger`, so
// React copies that key into the state and the state's byte length ends up one
// greater than its UTF-16 length. Cutting at the wrong one of those two leaves
// a stray byte in front of the prerendered content, which is what these tests
// pin down for both the document and its RSC data route.
describe('postponed state content type', () => {
  const cases = [
    {
      key: 'index',
      origin: 'text/html; charset=utf-8',
      // The prerendered document has to begin at its doctype.
      assertContent: content =>
        expect(content.slice(0, 15)).toBe('<!DOCTYPE html>'),
    },
    {
      key: 'index.rsc',
      origin: 'text/x-component',
      // The data route carries no prerendered content of its own: the flight
      // rows come from the resume, so the state is the whole body and nothing
      // may be left over behind it.
      assertContent: content => expect(content).toBe(''),
    },
  ];

  it.each(cases)('cuts $key at the declared offset', async ({
    key,
    origin,
    assertContent,
  }) => {
    const fixturePath = path.join(__dirname, 'ppr-non-ascii-postponed-state');
    const {
      buildResult: { output },
    } = await runBuildLambda(fixturePath);

    const prerender = output[key];
    expect(prerender).toBeDefined();
    expect(prerender.type).toBe('Prerender');

    const contentType = prerender.initialHeaders['content-type'];
    const declared = contentType.match(
      /^application\/x-nextjs-pre-render; state-length=(\d+); origin=(".*")$/
    );
    expect(declared, `unexpected content type: ${contentType}`).not.toBeNull();
    expect(JSON.parse(declared[2])).toBe(origin);

    const offset = Number(declared[1]);
    const body = Buffer.isBuffer(prerender.fallback.data)
      ? prerender.fallback.data
      : Buffer.from(prerender.fallback.data, 'utf8');

    const state = body.subarray(0, offset).toString('utf8');
    const content = body.subarray(offset).toString('utf8');

    // Guard against the assertion below passing for an uninteresting reason:
    // a pure ASCII state cannot tell the two measurements apart.
    expect(state).toContain('Doppelgänger');
    expect(Buffer.byteLength(state)).toBeGreaterThan(state.length);

    assertContent(content);
  }, 600000);
});
