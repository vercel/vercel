import { removeInlinedSourceMap } from '../../src/sourcemapped';

describe('removeInlinedSourceMap', () => {
  it('removes inlined source map', () => {
    expect(
      removeInlinedSourceMap(`
function foo() {
  return 1;
}
/*# sourceMappingURL=data:application/json;base64,abcdabcd12341234 */
`)
    ).toEqual(`
function foo() {
  return 1;
}

`);
  });

  it('removes multiple inlined source maps', () => {
    expect(
      removeInlinedSourceMap(`
function foo() {
  return 1;
}

/*# sourceMappingURL=data:application/json;base64,abcdabcd12341234 */
/*# sourceMappingURL=data:application/json;base64,cdefAB+/== */
`)
    ).toEqual(`
function foo() {
  return 1;
}


`);
  });

  it('preserves non-base64 source map comments', () => {
    expect(
      removeInlinedSourceMap(`
function foo() {
  return 1;
}

//# sourceMappingURL=script.min.js.map
`)
    ).toEqual(`
function foo() {
  return 1;
}

//# sourceMappingURL=script.min.js.map
`);
  });

  it('preserves source map comments in the middle', () => {
    expect(
      removeInlinedSourceMap(`
function foo() {
  console.log('/*# sourceMappingURL=data:application/json;base64,abcdabcd12341234 */')
}
`)
    ).toEqual(`
function foo() {
  console.log('/*# sourceMappingURL=data:application/json;base64,abcdabcd12341234 */')
}
`);
  });

  it(`doesn't remove sourceMappingURL inside string literal`, () => {
    expect(
      removeInlinedSourceMap(`
  css += \`
/*# sourceMappingURL=data:application/json;base64,\${btoa(
    unescape(encodeURIComponent(JSON.stringify(sourceMap)))
  )} */\`
`)
    ).toEqual(`
  css += \`
/*# sourceMappingURL=data:application/json;base64,\${btoa(
    unescape(encodeURIComponent(JSON.stringify(sourceMap)))
  )} */\`
`);
  });
});
