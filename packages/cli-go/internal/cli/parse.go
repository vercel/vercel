package cli

import (
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/build"
)

// Invocation is the command line, parsed once.
type Invocation struct {
	Name    string     // the first positional argument, "" when none
	Path    []*Command // selected commands below the root; may end at a group
	Args    []string   // positional arguments after Path (or Name)
	FlagErr error      // first error in the command's own flags

	values   map[string]string // by long name
	order    []*Flag           // in the order first given
	shortcut *Shortcut
}

func (inv *Invocation) Command() *Command {
	if len(inv.Path) == 0 {
		return nil
	}
	return inv.Path[len(inv.Path)-1]
}

// HelpPath is Path without a shortcut's child: upstream shows the teams
// help for `vercel switch --help`.
func (inv *Invocation) HelpPath() []*Command {
	if inv.shortcut != nil {
		return inv.Path[:len(inv.Path)-1]
	}
	return inv.Path
}

func (inv *Invocation) Shortcut() *Shortcut { return inv.shortcut }

func (inv *Invocation) Changed(f *Flag) bool { return slices.Contains(inv.order, f) }

func (inv *Invocation) Bool(f *Flag) bool     { return inv.values[f.Name] == "true" }
func (inv *Invocation) String(f *Flag) string { return inv.values[f.Name] }

// Parse parses argv in one pass with the semantics and error messages of
// npm `arg` v5, which the TypeScript CLI uses. At the root and at a group,
// unknown flags are positional and the first positional names the child.
// At a command, unknown flags are errors: the first is kept in FlagErr and
// parsing continues, so a later --help still wins. A global flag error is
// returned. Everything after "help" is parsed globally.
func Parse(root *Command, args []string) (*Invocation, error) {
	p := &parser{args: args, root: root, node: root, known: GlobalFlags, groupToken: -1,
		inv: &Invocation{values: map[string]string{}}}
	if err := p.run(); err != nil {
		return p.inv, err
	}
	inv := p.inv
	if p.node != root && p.node.IsGroup() && len(p.positional) == p.levelStart {
		if d := p.node.DefaultChild(); d != nil {
			p.enter(d, "", p.groupToken)
		}
	}
	if len(p.positional) > 0 {
		inv.Name = p.positional[0]
	}
	switch {
	case len(inv.Path) > 0:
		inv.Args = p.positional[p.levelStart:]
	case len(p.positional) > 1:
		inv.Args = p.positional[1:]
	}
	return inv, nil
}

type parser struct {
	args []string
	inv  *Invocation
	root *Command

	node       *Command
	known      []*Flag
	strict     bool // unknown flags are errors
	positional []string
	levelStart int  // where this level's arguments start in positional
	groupToken int  // argv index of the token that selected the group
	restart    bool // no child matched; reparse as the Default child
}

func (p *parser) run() error {
	for i := 0; i < len(p.args); i++ {
		whole := p.args[i]
		switch {
		case whole == "--":
			for j, a := range p.args[i+1:] {
				if p.addPositional(a, i+1+j); p.restart {
					break
				}
			}
		case len(whole) <= 1 || whole[0] != '-':
			p.addPositional(whole, i)
		default:
			next, err := p.option(i)
			if err != nil {
				return err
			}
			i = next
		}
		if p.restart {
			i = p.restartAsDefault()
			continue
		}
		if whole == "--" {
			return nil
		}
	}
	return nil
}

func (p *parser) enter(c *Command, via string, token int) {
	p.inv.Path = append(p.inv.Path, c)
	p.node, p.levelStart = c, len(p.positional)
	if c.IsGroup() {
		p.groupToken = token
		if sc, ok := c.Shortcuts[via]; ok {
			if sub := c.Child(sc.Child); sub != nil {
				p.inv.Path = append(p.inv.Path, sub)
				p.node, p.inv.shortcut = sub, &sc
			}
		}
	}
	p.known = append([]*Flag{}, GlobalFlags...)
	for _, cmd := range p.inv.Path {
		p.known = append(p.known, cmd.AllFlags()...)
	}
	p.strict = !p.node.IsGroup()
}

func (p *parser) addPositional(s string, token int) {
	p.positional = append(p.positional, s)
	if !p.node.IsGroup() || len(p.positional) != p.levelStart+1 {
		return
	}
	if child := p.node.Child(s); child != nil {
		p.enter(child, s, token)
		p.levelStart = len(p.positional)
		return
	}
	p.restart = p.node != p.root && p.node.DefaultChild() != nil
}

// restartAsDefault reparses the group's arguments as its Default child's.
func (p *parser) restartAsDefault() int {
	p.restart = false
	p.positional = p.positional[:p.levelStart]
	p.inv.FlagErr = nil
	p.enter(p.node.DefaultChild(), "", p.groupToken)
	return p.groupToken
}

// option parses the flag at argv[i] and returns the last index it used.
func (p *parser) option(i int) (int, error) {
	whole := p.args[i]
	parts := []string{whole}
	if whole[1] != '-' && len(whole) > 2 {
		parts = parts[:0]
		for _, r := range whole[1:] {
			parts = append(parts, "-"+string(r))
		}
	}
	consumed := false
	for j, part := range parts {
		name, value, hasValue := part, "", false
		if part[1] == '-' {
			name, value, hasValue = strings.Cut(part, "=")
		}
		f := lookup(p.known, name)
		if f == nil {
			if !p.strict {
				if p.addPositional(part, i); p.restart {
					return i, nil
				}
				continue
			}
			return p.fail(i, unknownOption(p.known, name), nil)
		}
		var err error
		switch {
		case f.Type != Bool && j+1 < len(parts):
			err = &Error{Message: "option requires argument (but was followed by another short argument): " + name}
		case f.Type == Bool:
			p.inv.values[f.Name] = "true"
		case !hasValue:
			if i+1 >= len(p.args) || (len(p.args[i+1]) > 1 && p.args[i+1][0] == '-' && !isNumber(f, p.args[i+1])) {
				alias := ""
				if name != "--"+f.Name {
					alias = " (alias for --" + f.Name + ")"
				}
				err = &Error{Message: "option requires argument: " + name + alias}
			} else {
				p.inv.values[f.Name], consumed = p.args[i+1], true
			}
		default:
			p.inv.values[f.Name] = value
		}
		if err != nil {
			return p.fail(i, err, f)
		}
		if !p.inv.Changed(f) {
			p.inv.order = append(p.inv.order, f)
		}
	}
	if consumed {
		return i + 1, nil
	}
	return i, nil
}

// fail ends parsing on a global flag error. Any other is kept in FlagErr
// and the token is parsed again with global flags only.
func (p *parser) fail(i int, err error, f *Flag) (int, error) {
	if f != nil && slices.Contains(GlobalFlags, f) {
		return i, err
	}
	if p.inv.FlagErr == nil {
		p.inv.FlagErr = err
	}
	p.known, p.strict = GlobalFlags, false
	return i - 1, nil
}

func lookup(known []*Flag, name string) *Flag {
	for _, f := range known {
		if name == "--"+f.Name || (f.Short != "" && name == "-"+f.Short) {
			return f
		}
	}
	return nil
}

var numberRe = regexp.MustCompile(`^-?\d*(\.(?:\d))?\d*$`)

// isNumber lets a Number flag's value start with "-".
func isNumber(f *Flag, v string) bool { return f.Type == Number && numberRe.MatchString(v) }

var optionRe = regexp.MustCompile(`^--?[A-Za-z0-9-]+$`)

// unknownOption is arg's error, with get-args.ts's hint: the accepted
// flags and a one-edit suggestion.
func unknownOption(known []*Flag, name string) *Error {
	e := &Error{Message: "unknown or unexpected option: " + name}
	if !optionRe.MatchString(name) {
		return e
	}
	var allowed []string
	for _, f := range known {
		if !slices.Contains(allowed, "--"+f.Name) {
			allowed = append(allowed, "--"+f.Name)
		}
	}
	sort.Strings(allowed)
	e.Hint = fmt.Sprintf("Vercel CLI %s accepts: %s.", build.Version, strings.Join(allowed, ", "))
	if s := suggest(name, allowed); s != "" {
		e.Hint += " Did you mean " + s + "?"
	}
	return e
}

// suggest is suggestCorrection: the only choice one edit away.
func suggest(input string, choices []string) string {
	if len(strings.TrimLeft(input, "-")) < 3 || slices.Contains(choices, input) {
		return ""
	}
	var matches []string
	for _, choice := range choices {
		if oneEdit(input, choice) {
			matches = append(matches, choice)
		}
	}
	if len(matches) == 1 {
		return matches[0]
	}
	return ""
}

func oneEdit(a, b string) bool {
	if d := len(a) - len(b); d > 1 || d < -1 {
		return false
	}
	i := 0
	for i < len(a) && i < len(b) && a[i] == b[i] {
		i++
	}
	at := func(s string, n int) string {
		if n > len(s) {
			return ""
		}
		return s[n:]
	}
	switch {
	case len(a) == len(b):
		if at(a, i+1) == at(b, i+1) {
			return true
		}
		return i+1 < len(a) && a[i] == b[i+1] && a[i+1] == b[i] && at(a, i+2) == at(b, i+2)
	case len(a) > len(b):
		return at(a, i+1) == at(b, i)
	default:
		return at(a, i) == at(b, i+1)
	}
}

// Validate runs the given flags' Validate checks.
func (inv *Invocation) Validate() error {
	for _, c := range inv.Path {
		for _, f := range c.AllFlags() {
			if f.Validate != nil && inv.Changed(f) {
				if err := f.Validate(inv.values[f.Name]); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
