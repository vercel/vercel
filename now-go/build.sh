#!/usr/bin/env bash

mkdir -p bin
cd util
GOOS=linux GOARCH=amd64 go build get-exported-function-name.go
mv get-exported-function-name ../bin/

