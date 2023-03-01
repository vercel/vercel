Build container has Go 1.18 and this test has a `go.mod` that says to use
Go 1.19. This should be ok because the Go builder will detect it needs to
download 1.19 to build the function.
