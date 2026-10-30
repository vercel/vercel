package cli

import (
	"fmt"
	"slices"
	"strings"
)

type FlagType int

const (
	Bool FlagType = iota
	String
	Number // may start with "-"
)

// Flag is an upstream CommandOption. A name has one meaning across the CLI
// (TestFlagNames).
type Flag struct {
	Name        string
	Short       string
	Type        FlagType
	Argument    string // help placeholder, e.g. "FORMAT"
	Description string
	// Deprecated and Hidden flags are parsed but left out of help.
	Deprecated bool
	Hidden     bool
	// Validate runs with the input checks, before any work.
	Validate func(value string) error
}

func (f *Flag) documented() bool { return !f.Deprecated && !f.Hidden && f.Description != "" }

// Global flags, as util/arg-common.ts.
var (
	FlagHelp           = &Flag{Name: "help", Short: "h", Type: Bool, Description: "Output usage information"}
	FlagVersion        = &Flag{Name: "version", Short: "v", Type: Bool, Description: "Output the version number"}
	FlagCwd            = &Flag{Name: "cwd", Type: String, Argument: "DIR", Description: "Sets the current working directory for a single run of a command"}
	FlagLocalConfig    = &Flag{Name: "local-config", Short: "A", Type: String, Argument: "FILE", Description: "Path to the local `vercel.json` file"}
	FlagGlobalConfig   = &Flag{Name: "global-config", Short: "Q", Type: String, Argument: "DIR", Description: "Path to the global `.vercel` directory"}
	FlagDebug          = &Flag{Name: "debug", Short: "d", Type: Bool, Description: "Debug mode (default off)"}
	FlagNoColor        = &Flag{Name: "no-color", Type: Bool, Description: "No color mode (default off)"}
	FlagNonInteractive = &Flag{Name: "non-interactive", Type: Bool, Description: "Run without interactive prompts; when an agent is detected this is the default"}
	FlagScope          = &Flag{Name: "scope", Short: "S", Type: String, Description: "Set a custom scope"}
	FlagToken          = &Flag{Name: "token", Short: "t", Type: String, Argument: "TOKEN", Description: "Login token"}
	FlagTeam           = &Flag{Name: "team", Short: "T", Type: String, Hidden: true}
	FlagAPI            = &Flag{Name: "api", Type: String, Hidden: true}
)

var GlobalFlags = []*Flag{
	FlagHelp, FlagVersion, FlagCwd, FlagLocalConfig, FlagGlobalConfig, FlagDebug,
	FlagNoColor, FlagNonInteractive, FlagScope, FlagToken, FlagTeam, FlagAPI,
}

// Shared flags. The framework adds them: --format and --json with
// RunJSON, --next and --limit with Pagination, --project and --all with
// the needs that take them.
var (
	FlagFormat  = &Flag{Name: "format", Short: "F", Type: String, Argument: "FORMAT", Description: "Specify the output format (json)", Validate: validateFormat}
	FlagJSON    = &Flag{Name: "json", Type: Bool, Description: "Output as JSON"}
	FlagNext    = &Flag{Name: "next", Short: "N", Type: Number, Argument: "MS", Description: "Show next page of results"}
	FlagLimit   = &Flag{Name: "limit", Type: Number, Argument: "NUMBER", Description: "Number of results to return per page"} // help adds the command's Pagination
	FlagProject = &Flag{Name: "project", Type: String, Argument: "NAME_OR_ID", Description: "Project name or ID (defaults to the linked project)"}
	FlagAll     = &Flag{Name: "all", Short: "a", Type: Bool, Description: "List resources across all projects"}
)

var sharedFlags = []*Flag{FlagFormat, FlagJSON, FlagNext, FlagLimit, FlagProject, FlagAll}

// Reserved names belong to the global and shared flags.
var Reserved = func() map[string]*Flag {
	m := map[string]*Flag{}
	for _, f := range append(slices.Clone(GlobalFlags), sharedFlags...) {
		m[f.Name] = f
	}
	return m
}()

// Command flags. Every flag a command takes is declared in this file, so
// a new name is one reviewed line here (TestFlagNames).
var (
	// Deprecated `login` options, still accepted.
	FlagGitHub    = &Flag{Name: "github", Type: Bool, Deprecated: true}
	FlagOOB       = &Flag{Name: "oob", Type: Bool, Deprecated: true}
	FlagGitLab    = &Flag{Name: "gitlab", Type: Bool, Deprecated: true}
	FlagBitbucket = &Flag{Name: "bitbucket", Type: Bool, Deprecated: true}
	FlagFuture    = &Flag{Name: "future", Type: Bool, Deprecated: true}

	// Deprecated `teams ls` options, still accepted.
	FlagSince = &Flag{Name: "since", Type: String, Deprecated: true}
	FlagUntil = &Flag{Name: "until", Type: String, Deprecated: true}
	FlagCount = &Flag{Name: "count", Short: "C", Type: Number, Deprecated: true}
)

// Declared is every flag in this file.
var Declared = append(append(slices.Clone(GlobalFlags), sharedFlags...),
	FlagGitHub, FlagOOB, FlagGitLab, FlagBitbucket, FlagFuture,
	FlagSince, FlagUntil, FlagCount)

// LookAlikes are names for a meaning another name already has, so a new
// flag takes that name instead (TestFlagNames).
var LookAlikes = map[string]string{
	"count": "limit", "per-page": "limit", "page-size": "limit",
	"page": "next", "cursor": "next", "offset": "next",
	"from": "since", "to": "until",
	"proj": "project", "project-id": "project",
	"team-id": "scope", "org": "scope",
	"output": "format",
}

// validateFormat is util/output-format.ts: only "json", in any case.
func validateFormat(v string) error {
	if strings.ToLower(v) != "json" {
		return &Error{Message: fmt.Sprintf("Invalid output format: %q. Valid formats: json", v)}
	}
	return nil
}
