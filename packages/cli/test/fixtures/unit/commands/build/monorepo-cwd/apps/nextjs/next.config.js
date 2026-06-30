const expected = path.resolve(__dirname, '../..');

if (process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT !== expected) {
  throw new Error(
    `Expected NEXT_PRIVATE_OUTPUT_TRACE_ROOT to be ${expected}, but got ${process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT}`
  );
}

module.exports = {};
