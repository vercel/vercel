package main

import "gin-buildpack/internal/server"

func main() {
	if err := server.Run(); err != nil {
		panic(err)
	}
}
