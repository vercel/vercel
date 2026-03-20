//go:build vcdev
// +build vcdev

// vc-init-dev.go - Entry point for the standalone Go dev bootstrap.

package main

import "main/bootstrap"

func main() {
	bootstrap.DevMain()
}
