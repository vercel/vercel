// Command vercel is the Vercel CLI.
package main

import (
	"os"

	"github.com/vercel/vercel/packages/cli-go/internal/vercelcmd"
)

func main() {
	os.Exit(vercelcmd.Main())
}
