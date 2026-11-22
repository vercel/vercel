package cli

import (
	"regexp"
	"slices"
	"strings"
)

// Next is a command that recovers from an error. Declare it at package
// level with NewNext, so TestNext can check it parses.
type Next struct {
	Label string   // e.g. "List the teams you can switch to"
	Argv  []string // after "vercel"; values to fill in are like <SLUG>
}

var declaredNext []*Next

func NewNext(label string, argv ...string) *Next {
	n := &Next{Label: label, Argv: argv}
	declaredNext = append(declaredNext, n)
	return n
}

func DeclaredNext() []*Next { return slices.Clone(declaredNext) }

// Command is the command line, with the context flags it does not give.
func (n *Next) Command(context [][]string) string {
	args := append([]string{"vercel"}, n.Argv...)
	for _, flag := range context {
		if !slices.Contains(n.Argv, flag[0]) {
			args = append(args, flag...)
		}
	}
	for i, a := range args {
		args[i] = quoteArg(a)
	}
	return strings.Join(args, " ")
}

// contextFlags are kept by suggested commands, so they run in the same
// context as the failed one.
var contextFlags = []*Flag{FlagCwd, FlagLocalConfig, FlagGlobalConfig, FlagScope, FlagTeam, FlagAPI, FlagNonInteractive}

// ContextArgs are the context flags given, never --token, e.g. {"--cwd",
// "dir"}. nonInteractive is whether --non-interactive applies.
func (inv *Invocation) ContextArgs(nonInteractive bool) [][]string {
	var out [][]string
	for _, f := range inv.order {
		if !slices.Contains(contextFlags, f) {
			continue
		}
		v := inv.values[f.Name]
		switch {
		case f == FlagNonInteractive:
			if nonInteractive {
				out = append(out, []string{"--" + f.Name})
			}
			continue
		case f == FlagTeam && inv.Changed(FlagScope):
			continue // --scope wins, as startup applies it
		case f == FlagTeam:
			f = FlagScope
		}
		if v != "" {
			out = append(out, []string{"--" + f.Name, v})
		}
	}
	return out
}

var (
	shellSafe   = regexp.MustCompile(`^[A-Za-z0-9_./@:-]+$`)
	placeholder = regexp.MustCompile(`^<[A-Z][A-Z0-9_]*>$`)
)

// quoteArg is upstream's quoteArg; placeholders stay unquoted.
func quoteArg(s string) string {
	if shellSafe.MatchString(s) || placeholder.MatchString(s) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
