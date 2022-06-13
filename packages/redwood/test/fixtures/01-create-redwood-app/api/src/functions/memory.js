async function handler() {
  return {
    statusCode: 200,
    headers: {},
    body: `Memory is: ${process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE}`,
  }
}

module.exports = { handler }
