// A second command in the service. `@vercel/go` builds `cmd/server`, one of
// its entrypoint candidates, so the buildpack must build it too.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "migrations must never be the deployed server")
	os.Exit(1)
}
