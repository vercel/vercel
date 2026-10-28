// Package teams is `vercel teams`. Only ls and switch are ported.
package teams

import "github.com/vercel/vercel/packages/cli-go/internal/cli"

var Command = &cli.Command{
	Name:              "teams",
	Aliases:           []string{"switch", "team"},
	Shortcuts:         map[string]cli.Shortcut{"switch": {Child: "switch", NoToken: true}},
	Description:       "Manage Teams under your Vercel account",
	InvalidSubcommand: "Please specify a valid subcommand: add | ls | switch | invite | request | sso | members",
	Children: []*cli.Command{
		{Name: "add", Aliases: []string{"create"}, Description: "Create a new team", NotPorted: true},
		{Name: "invite", Description: "Invite a new member to a team", Args: []cli.Arg{{Name: "email", Required: true, Multiple: true}}, NotPorted: true},
		listCommand,
		{Name: "request", Aliases: []string{"access-request"}, Description: "Show join-request status for the current team (defaults to the authenticated user)", Args: []cli.Arg{{Name: "userId"}}, NotPorted: true},
		switchCommand,
		{Name: "sso", Description: "Show SAML / SSO configuration for the current team", NotPorted: true},
		{Name: "members", Aliases: []string{"member"}, Description: "List, invite, or remove members from the current team", NotPorted: true},
	},
}
