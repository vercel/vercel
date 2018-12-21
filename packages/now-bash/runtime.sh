import "static-binaries@0.0.6"
static_binaries jq

# These get reset upon each request
_STATUS_CODE="$(mktemp)"
_HEADERS="$(mktemp)"

_lambda_runtime_api() {
	local endpoint="$1"
	shift
	curl -sfLS "http://$AWS_LAMBDA_RUNTIME_API/2018-06-01/runtime/$endpoint" "$@"
}

_lambda_runtime_init() {
	# Initialize user code
	. "$SCRIPT_FILENAME" || {
		local exit_code="$?"
		local error
		error='{"exitCode":'"$exit_code"'}'
		_lambda_runtime_api "init/error" -X POST -d "$error"
		exit "$EXIT_CODE"
	}

	# Process events
	while true; do _lambda_runtime_next; done
}

_lambda_runtime_next() {
	echo 200 > "$_STATUS_CODE"
	echo '{"content-type":"text/plain; charset=utf8"}' > "$_HEADERS"

	local headers
	headers="$(mktemp)"

	# Get an event
	local event
	event="$(mktemp)"
	_lambda_runtime_api invocation/next -D "$headers" | jq -r '.body' > "$event"

	local request_id
	request_id="$(grep -Fi Lambda-Runtime-Aws-Request-Id "$headers" | tr -d '[:space:]' | cut -d: -f2)"
	rm -f "$headers"

	# Execute the handler function from the script
	local body
	body="$(mktemp)"

	local exit_code=0
	REQUEST="$event"

	# Stdin of the `handler` function is the HTTP request body.
	# Need to use a fifo here instead of bash <() because Lambda
	# errors with "/dev/fd/63 not found" for some reason :/
	local stdin
	stdin="$(mktemp --dry-run)"
	mkfifo "$stdin"
	_lambda_runtime_body "$event" > "$stdin" &

	handler "$event" < "$stdin" > "$body" || exit_code="$?"
	rm -f "$event" "$stdin"

	if [ "$exit_code" -eq 0 ]; then
		# Send the response
		local response
		response="$(jq -cnMr \
			--arg statusCode "$(cat "$_STATUS_CODE")" \
			--argjson headers "$(cat "$_HEADERS")" \
			--arg body "$(base64 --wrap=0 < "$body")" \
			'{statusCode:$statusCode|tonumber, headers:$headers, encoding:"base64", body:$body}')"
		rm -f "$body" "$_HEADERS"
		_lambda_runtime_api "invocation/$request_id/response" -X POST -d "$response" > /dev/null
	else
		echo "\`handler\` function return code: $exit_code"
		local error='{"exitCode":'"$exit_code"'}'
		_lambda_runtime_api "invocation/$request_id/error" -X POST -d "$error" > /dev/null
	fi
}

_lambda_runtime_body() {
	if [ "$(jq -r '.body | type' < "$1")" = "string" ]; then
		if [ "$(jq -r '.encoding' < "$1")" = "base64" ]; then
			jq -r '.body' < "$1" | base64 -d
		else
			# assume plain-text body
			jq -r '.body' < "$1"
		fi
	fi
}


# Set the response status code.
http_response_code() {
	echo "$1" > "$_STATUS_CODE"
}

# Sets a response header.
# Overrides existing header if it has already been set.
http_response_header() {
	local name="$1"
	local value="$2"
	local tmp
	tmp="$(mktemp)"
	jq --arg name "$name" --arg value "$value" '.[$name] = $value' < "$_HEADERS" > "$tmp"
	mv -f "$tmp" "$_HEADERS"
}

http_response_redirect() {
	http_response_code "${2:-302}"
	http_response_header "location" "$1"
}

http_response_json() {
	http_response_header "content-type" "application/json; charset=utf8"
}
