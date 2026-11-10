package main

import "chi-server-go126/internal/api"

func main() {
	if err := api.Run(); err != nil {
		panic(err)
	}
}
