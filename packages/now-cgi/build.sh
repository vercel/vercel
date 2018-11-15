#!/usr/bin/env bash
export GOOS=linux
export GOARCH=amd64
go build -o handler main.go
