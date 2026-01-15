# Go wrapper converts Lambda events to http.Request

## Category

functional

## Description

Go wrapper converts Lambda events to http.Request

## Steps

1. Receive APIGatewayProxyRequest event in Lambda
2. Parse JSON body to extract host, path, method, headers, body
3. Decode base64 body if encoding is 'base64'
4. Create http.Request with correct URL, method, headers, and body
5. Set Host, ContentLength, and RemoteAddr from headers

## Status

- [ ] Passes
