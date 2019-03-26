#!/bin/bash
import "static-binaries@1.0.0"
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
	# shellcheck disable=SC1090
	. "$SCRIPT_FILENAME" || {
		local exit_code="$?"
		local error_message="Initialization failed for '$SCRIPT_FILENAME' (exit code $exit_code)"
		echo "$error_message" >&2
		local error='{"errorMessage":"'"$error_message"'"}'
		_lambda_runtime_api "init/error" -X POST -d "$error"
		exit "$exit_code"
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
	_lambda_runtime_api invocation/next -D "$headers" | jq --raw-output --monochrome-output '.body' > "$event"

	local request_id
	request_id="$(grep -Fi Lambda-Runtime-Aws-Request-Id "$headers" | tr -d '[:space:]' | cut -d: -f2)"
	rm -f "$headers"

	# Execute the handler function from the script
	local body
	body="$(mktemp)"

	# Stdin of the `handler` function is the HTTP request body.
	# Need to use a fifo here instead of bash <() because Lambda
	# errors with "/dev/fd/63 not found" for some reason :/
	local stdin
	stdin="$(mktemp -u)"
	mkfifo "$stdin"
	_lambda_runtime_body < "$event" > "$stdin" &

	local exit_code=0
	handler "$event" < "$stdin" > "$body" || exit_code="$?"

	rm -f "$event" "$stdin"

	if [ "$exit_code" -eq 0 ]; then
		# Send the response
		jq --raw-input --raw-output --compact-output --slurp --monochrome-output \
			--arg statusCode "$(cat "$_STATUS_CODE")" \
			--argjson headers "$(cat "$_HEADERS")" \
			'{statusCode:$statusCode|tonumber, headers:$headers, encoding:"base64", body:.|@base64}' < "$body" \
			| _lambda_runtime_api "invocation/$request_id/response" -X POST -d @- > /dev/null
		rm -f "$body" "$_HEADERS"
	else
		local error_message="Invocation failed for 'handler' function in '$SCRIPT_FILENAME' (exit code $exit_code)"
		echo "$error_message" >&2
		_lambda_runtime_api "invocation/$request_id/error" -X POST -d '{"errorMessage":"'"$error_message"'"}' > /dev/null
	fi
}

_lambda_runtime_body() {
	local event
	event="$(cat)"
	if [ "$(jq --raw-output '.body | type' <<< "$event")" = "string" ]; then
		if [ "$(jq --raw-output '.encoding' <<< "$event")" = "base64" ]; then
			jq --raw-output '.body' <<< "$event" | base64 --decode
		else
			# assume plain-text body
			jq --raw-output '.body' <<< "$event"
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
	jq \
		--arg name "$name" \
		--arg value "$value" \
		'.[$name] = $value' < "$_HEADERS" > "$tmp"
	mv -f "$tmp" "$_HEADERS"
}

http_response_redirect() {
	http_response_code "${2:-302}"
	http_response_header "location" "$1"
}

http_response_json() {
	http_response_header "content-type" "application/json; charset=utf8"
}
