#!/usr/bin/env bash
export GOOS=linux
export GOARCH=amd64
export GOPATH=$HOME/go
go get github.com/aws/aws-lambda-go/events
go get github.com/aws/aws-lambda-go/lambda
go build -o handler main.go
