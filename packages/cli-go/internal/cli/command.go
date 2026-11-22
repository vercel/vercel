// Package cli is the command framework. A command is one Command value;
// its fields mirror upstream's src/commands/<name>/command.ts.
package cli

import (
	"context"
	"slices"
)

type Command struct {
	Name         string
	Aliases      []string
	Description  string
	Args         []Arg // for help only; not counted
	Flags        []*Flag
	Examples     []Example
	HelpSections []HelpSection // after the examples: what the options don't show
	Related      []string      // canonical paths, e.g. "teams switch"

	// Children make this a group. With no matching child, the Default
	// child runs; without one, InvalidSubcommand and the help print.
	Children          []*Command
	Default           bool
	InvalidSubcommand string
	// Shortcuts are aliases that also select a child: `vercel switch`.
	Shortcuts map[string]Shortcut

	Basic             bool // listed under "Basic" in root help
	Hidden            bool
	NotPorted         bool    // listed in help, fails like an unknown command
	HiddenGlobalFlags []*Flag // left out of help, still parsed

	// Needs is what startup resolves before and during Run (needs.go).
	// Every command that runs declares one.
	Needs Need
	// Pagination adds --next and --limit and checks them with the input.
	Pagination *Pagination
	// Validate runs with the other input checks, before any write or
	// request, so its Input has only Args, flags, UI, Mode and Cwd.
	Validate func(*Input) error
	// A command sets Run, or RunJSON to also print its result as JSON:
	// RunJSON adds --json and --format, and its result must have JSON().
	Run     func(context.Context, *Input) (Result, error)
	RunJSON func(context.Context, *Input) (JSONResult, error)
}

type Shortcut struct {
	Child   string
	NoToken bool
}

type Arg struct {
	Name     string
	Required bool
	Multiple bool
}

type HelpSection struct {
	Title string
	Body  []string // word-wrapped lines; "" is a blank line
}

type Example struct {
	Name  string
	Value []string
}

func (c *Command) IsGroup() bool { return len(c.Children) > 0 }

// AllFlags are Flags, plus --next and --limit with Pagination, the need's
// flags, and --format and --json with RunJSON.
func (c *Command) AllFlags() []*Flag {
	flags := slices.Clip(c.Flags)
	if c.Pagination != nil {
		flags = append(flags, FlagNext, FlagLimit)
	}
	if c.Needs != nil {
		flags = append(flags, c.Needs.base().flags()...)
	}
	if c.RunJSON != nil {
		flags = append(flags, FlagFormat, FlagJSON)
	}
	return flags
}

func (c *Command) Child(name string) *Command {
	for _, child := range c.Children {
		if child.Name == name || slices.Contains(child.Aliases, name) {
			return child
		}
	}
	return nil
}

func (c *Command) DefaultChild() *Command {
	for _, child := range c.Children {
		if child.Default {
			return child
		}
	}
	return nil
}

// Find walks names down from root as far as they name children, for
// `vercel help a b`. Shortcuts do not apply: upstream shows the teams help
// for `vercel switch --help`.
func Find(root *Command, names []string) []*Command {
	var path []*Command
	for _, name := range names {
		if root = root.Child(name); root == nil {
			break
		}
		path = append(path, root)
	}
	return path
}
