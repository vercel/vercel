# API Fallback and Request Traces

Use the API when first-class CLI operations are absent or omit required fields. Discover the endpoint through the CLI's API listing or canonical API documentation rather than guessing versions, identifiers, or request bodies.

Keep requests scoped and paginated. Reduce large results before presenting them. A generated curl command is not a JSON response; select the response format appropriate to the downstream parser. Typed field conversion can turn a string such as `false` into a boolean: preserve string types when the API expects them.

API deletion has its own confirmation requirements. Do not use the API or a permission-bypass option to evade a first-class command's authorization boundary.

Captured request traces describe individual requests. Use a request identifier from evidence; do not treat aggregate metrics or firewall configuration as a request trace.
