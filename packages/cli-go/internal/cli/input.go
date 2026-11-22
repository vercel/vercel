package cli

import (
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// Input is everything a command runs with. The user, the team and the
// project come only from the command's need.
type Input struct {
	Args []string
	UI   *iostreams.UI
	Mode Mode
	Cwd  string // after --cwd

	Client  *api.Client
	Context [][]string

	inv      *Invocation
	resolver Resolver // nil for Validate
}

// NewInput is Run's Input, or Validate's with a nil Resolver.
func NewInput(inv *Invocation, r Resolver) *Input {
	return &Input{Args: inv.Args, inv: inv, resolver: r}
}

type Mode struct {
	CI             bool
	AgentName      string // "" when no agent is detected
	NonInteractive bool
}

// Scope is what get-scope.ts returns.
type Scope struct {
	User       *api.User
	Team       *api.Team // never nil: there is no personal account
	GlobalTeam *api.Team // before a linked project's override; nil when only the link names a team
	TeamID     string
	// ScopeMismatch: a linked project's team differs from the saved team.
	ScopeMismatch bool
	// Explicit: --scope, --team or the local config set it.
	Explicit bool
}

// Reading a flag the command does not declare panics.
func (in *Input) Bool(f *Flag) bool     { in.check(f); return in.inv.Bool(f) }
func (in *Input) String(f *Flag) string { in.check(f); return in.inv.String(f) }

// Number reads the value as JavaScript's Number() does.
func (in *Input) Number(f *Flag) (float64, bool) {
	in.check(f)
	if !in.inv.Changed(f) {
		return 0, false
	}
	return jsNumber(in.inv.String(f)), true
}

// GivenFlags are the command's own flags given, in order.
func (in *Input) GivenFlags() []*Flag {
	var given []*Flag
	for _, f := range in.inv.order {
		if in.declares(f) && !slices.Contains(GlobalFlags, f) {
			given = append(given, f)
		}
	}
	return given
}

func (in *Input) declares(f *Flag) bool {
	return slices.ContainsFunc(in.inv.Path, func(c *Command) bool { return slices.Contains(c.AllFlags(), f) })
}

func (in *Input) check(f *Flag) {
	if !in.declares(f) && !slices.Contains(GlobalFlags, f) {
		panic(fmt.Sprintf("cli: %s reads --%s, which it does not declare", in.inv.Command().Name, f.Name))
	}
}

// jsNumber is JavaScript's Number(s).
func jsNumber(s string) float64 {
	s = strings.TrimSpace(s)
	switch {
	case s == "":
		return 0
	case s == "Infinity" || s == "+Infinity":
		return math.Inf(1)
	case s == "-Infinity":
		return math.Inf(-1)
	case len(s) > 2 && s[0] == '0' && strings.ContainsRune("xXoObB", rune(s[1])):
		if n, err := strconv.ParseInt(s, 0, 64); err == nil {
			return float64(n)
		}
		return math.NaN()
	case strings.ContainsAny(s, "_xXpPnN"): // Go accepts these; Number() does not
		return math.NaN()
	}
	if n, err := strconv.ParseFloat(s, 64); err == nil {
		return n
	}
	return math.NaN()
}
