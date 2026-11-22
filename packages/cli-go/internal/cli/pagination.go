package cli

import (
	"fmt"
	"math"
	"strconv"
)

// Pagination makes a command page with --next and --limit, which it adds
// to the command's flags.
type Pagination struct {
	Default, Max int
}

func (inv *Invocation) ValidatePage() error {
	p := inv.Command().Pagination
	if p == nil {
		return nil
	}
	if inv.Changed(FlagNext) && !isInteger(jsNumber(inv.String(FlagNext))) {
		return Errorf("Please provide a number for flag `--next`")
	}
	if inv.Changed(FlagLimit) {
		if n := jsNumber(inv.String(FlagLimit)); !isInteger(n) || n < 1 || n > float64(p.Max) {
			return Errorf("Please provide an integer from 1 to %d for option --limit", p.Max)
		}
	}
	return nil
}

func (p *Pagination) limitDescription() string {
	return fmt.Sprintf("%s (default: %d, max: %d)", FlagLimit.Description, p.Default, p.Max)
}

func isInteger(n float64) bool { return !math.IsInf(n, 0) && n == math.Trunc(n) }

// Page is --next (0 when not given) and --limit (Default when not given).
func (in *Input) Page() (next int64, limit int) {
	p := in.inv.Command().Pagination
	if p == nil {
		panic("cli: " + in.inv.Command().Name + " reads a page without declaring Pagination")
	}
	limit = p.Default
	if n, ok := in.Number(FlagLimit); ok {
		limit = int(n)
	}
	if n, ok := in.Number(FlagNext); ok {
		next = int64(n)
	}
	return next, limit
}

// NextPage is the command for the next page: the canonical path, the
// flags given except --next and --format, then the context flags.
func (in *Input) NextPage(next int64) string {
	args := []string{}
	for _, c := range in.inv.Path {
		args = append(args, c.Name)
	}
	for _, f := range in.GivenFlags() {
		switch {
		case f == FlagNext || f == FlagFormat:
		case f.Type == Bool:
			args = append(args, "--"+f.Name)
		case f.Type == Number:
			n, _ := in.Number(f)
			args = append(args, "--"+f.Name, strconv.FormatFloat(n, 'f', -1, 64))
		default:
			args = append(args, "--"+f.Name, in.String(f))
		}
	}
	args = append(args, "--next", strconv.FormatInt(next, 10))
	return (&Next{Argv: args}).Command(in.Context)
}
