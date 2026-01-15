# Go wrapper converts http.Response to Lambda response

## Category

functional

## Description

Go wrapper converts http.Response to Lambda response

## Steps

1. Capture response from http.Handler via custom ResponseWriter
2. Collect status code, headers, and body
3. Encode body as base64
4. Return Response struct with statusCode, headers, encoding, and body

## Status

- [ ] Passes
