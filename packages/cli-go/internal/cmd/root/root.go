// Package root is the command tree.
package root

import (
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/cmd/login"
	"github.com/vercel/vercel/packages/cli-go/internal/cmd/teams"
	"github.com/vercel/vercel/packages/cli-go/internal/cmd/whoami"
)

var Command = &cli.Command{
	Name: "vercel",
	Children: []*cli.Command{
		login.Command,
		teams.Command,
		whoami.Command,
	},
}
