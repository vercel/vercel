package main

import "chi-buildpack/internal/api"

func main() {
	if err := api.Run(); err != nil {
		panic(err)
	}
}
