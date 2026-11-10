package main

import "gin-server-go126/internal/server"

func main() {
	if err := server.Run(); err != nil {
		panic(err)
	}
}
