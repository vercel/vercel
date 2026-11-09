// A second command in the module. `@vercel/go` builds `cmd/api`, the first
// of its entrypoint candidates, so the buildpack must build it too instead
// of refusing to choose between two `main` packages.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "the worker must never be the deployed server")
	os.Exit(1)
}
