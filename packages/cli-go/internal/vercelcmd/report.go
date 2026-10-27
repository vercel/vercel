package vercelcmd

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"regexp"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
)

// report prints err as upstream's printError does, as text on stderr in
// every mode, and returns the exit code.
func (s *startup) report(err error) int {
	ui, cs := s.ios.UI, s.ios.ColorScheme()
	ui.StopSpinner()
	var cliErr *cli.Error
	var apiErr *api.Error
	var dnsErr *net.DNSError
	switch {
	case errors.As(err, &cliErr) && cliErr.Silent:
	case errors.Is(err, context.Canceled):
		return 130 // Ctrl-C: Node exits 130 without output
	case errors.As(err, &cliErr) && cliErr.Hint != "":
		ui.Fatal(cliErr.Message)
		ui.Print("  " + cliErr.Hint + "\n" + s.next(cliErr.Next) + cliErr.Help)
	case errors.As(err, &cliErr):
		ui.Error(cliErr.Message, cliErr.Link, cliErr.Action)
		ui.Print(s.next(cliErr.Next) + cliErr.Help)
	case errors.As(err, &apiErr):
		link := apiErr.Link
		if apiErr.Slug != "" {
			link = "https://err.sh/vercel/" + apiErr.Slug
		}
		switch {
		case apiErr.Status >= 400 && apiErr.Status <= 499:
			ui.Error(apiErr.ServerMessage, link, apiErr.Action)
		case apiErr.Code != "":
			ui.Error(apiErr.Message, link, apiErr.Action)
		default:
			ui.Error(s.unexpected(apiErr.Message), "", "")
		}
		if hint := s.recoveryHint(apiErr); hint != "" && s.mode.NonInteractive {
			ui.Print("  " + hint + "\n")
		}
	case errors.As(err, &dnsErr) && dnsErr.IsNotFound:
		ui.Error(fmt.Sprintf("The hostname %s could not be resolved. Please verify your internet connectivity and DNS configuration.",
			cs.Bold(cs.Underline(dnsErr.Name))), "", "")
	case strings.Contains(err.Error(), "connection reset by peer"):
		if m := hostRe.FindStringSubmatch(err.Error()); m != nil {
			ui.Error(fmt.Sprintf("Connection to %s interrupted. Please verify your internet connectivity and DNS configuration.",
				cs.Bold(cs.Underline(m[1]))), "", "")
		}
	default:
		ui.Error(s.unexpected(err.Error()), "", "")
	}
	if cliErr != nil {
		return cliErr.ExitCode()
	}
	return 1
}

var hostRe = regexp.MustCompile(`https://(.*?)/`)

func (s *startup) next(next []*cli.Next) string {
	if len(next) == 0 {
		return ""
	}
	cs := s.ios.ColorScheme()
	var b strings.Builder
	b.WriteString("\n")
	for _, n := range next {
		b.WriteString("  " + n.Label + ":\n    " + cs.Cyan(n.Command(s.context)) + "\n")
	}
	return b.String()
}

func (s *startup) unexpected(message string) string {
	name := ""
	if s.cmd != nil {
		name = s.cmd.Name
	}
	return fmt.Sprintf("An unexpected error occurred in %s: Error: %s", name, message)
}

// recoveryHint is getErrorRecovery's hint, for agents.
func (s *startup) recoveryHint(e *api.Error) string {
	switch e.Status {
	case 403:
		team := ""
		if scope := s.errorScope(); scope != "" {
			team = " (" + scope + ")"
		}
		return "Check that the selected team is correct" + team + ". If it is, ask a team owner to grant the required access. Retry only after the team or access changes."
	case 402:
		return paymentHint(e.ServerMessage)
	case 401:
		return "Provide valid credentials for the intended account and team, then retry."
	case 429:
		if e.RetryAfterMs != nil && *e.RetryAfterMs > 0 {
			return fmt.Sprintf("Wait at least %d seconds before trying again.", int64(math.Ceil(float64(*e.RetryAfterMs)/1000)))
		}
		return "The request limit was reached. Wait before trying again; no retry time was provided."
	}
	return ""
}

var (
	featureDisabled = regexp.MustCompile(`(?i)(?:disabled|switched off|re-enable)`)
	billingIssue    = regexp.MustCompile(`(?i)(?:overdue|payment method|unpaid|balance)`)
	planRequired    = regexp.MustCompile(`(?i)(?:plan|subscription)`)
)

// paymentHint is getErrorRecovery's 402 wording, without the
// Observability Plus variants.
func paymentHint(message string) string {
	switch {
	case featureDisabled.MatchString(message):
		return "Enable the feature for the selected team or project, then retry."
	case billingIssue.MatchString(message):
		return "Ask a team owner to resolve the billing issue, then retry."
	case planRequired.MatchString(message):
		return "Ask a team owner to confirm the required plan or subscription before changing billing. Retry after access is enabled."
	}
	return "Check the billing or feature requirement reported above with a team owner. Retry after that requirement is resolved."
}

// errorScope is the loaded team's slug, else the username.
func (s *startup) errorScope() string {
	if s.client == nil {
		return ""
	}
	if team := s.client.Team(); team != "" {
		return s.client.CachedTeamSlug(team)
	}
	if u := s.resolver.CachedUser(); u != nil {
		return cmp.Or(u.Username, u.Email)
	}
	return ""
}
