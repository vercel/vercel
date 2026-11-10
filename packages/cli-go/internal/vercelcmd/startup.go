package vercelcmd

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/auth"
	"github.com/vercel/vercel/packages/cli-go/internal/build"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/clisession"
	"github.com/vercel/vercel/packages/cli-go/internal/config"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
	"github.com/vercel/vercel/packages/cli-go/internal/loginflow"
	"github.com/vercel/vercel/packages/cli-go/internal/oauth"
	"github.com/vercel/vercel/packages/cli-go/internal/scope"
)

// startup is one invocation. Each step reads what earlier steps set.
type startup struct {
	env  Env
	ios  *iostreams.IOStreams
	root *cli.Command

	inv          *cli.Invocation
	cwd          string      // after --cwd
	token        string      // the explicit token: --token or VERCEL_TOKEN
	source       auth.Source // where token came from
	localScope   string      // `scope` in the local vercel.json
	mode         cli.Mode
	path         []*cli.Command
	cmd          *cli.Command
	session      *auth.Session
	cliSession   *clisession.Session
	client       *api.Client
	oauth        *oauth.Server
	resolver     *scope.Resolver
	context      [][]string
	invocationID string
}

func (s *startup) getenv(k string) string { v, _ := s.env.LookupEnv(k); return v }

// parseCommandLine: an error in the command's own flags waits for
// validateInput, so --help still wins.
func (s *startup) parseCommandLine(context.Context) error {
	inv, err := cli.Parse(s.root, s.env.Args)
	if err != nil {
		return err
	}
	s.inv = inv
	flag, explicitFalse := nonInteractiveArgs(s.env.Args)
	s.context = inv.ContextArgs(flag && !explicitFalse)
	s.ios.SetDebug(inv.Bool(cli.FlagDebug) || s.getenv("VERCEL_DEBUG") == "1")
	if inv.Bool(cli.FlagNoColor) {
		s.ios.DisableColor()
	}
	s.cwd = s.env.Cwd
	if cwd := inv.String(cli.FlagCwd); cwd != "" {
		s.cwd = resolve(s.env.Cwd, cwd)
	}
	switch {
	case inv.Changed(cli.FlagToken):
		s.token, s.source = inv.String(cli.FlagToken), auth.FromFlag
	case s.getenv("VERCEL_TOKEN") != "":
		s.token, s.source = s.getenv("VERCEL_TOKEN"), auth.FromEnv
	}
	return nil
}

// readLocalConfig reads the scope from vercel.json (or -A) in the
// invocation directory, before --cwd.
func (s *startup) readLocalConfig(context.Context) error {
	given := s.inv.String(cli.FlagLocalConfig)
	files := []string{resolve(s.env.Cwd, "vercel.json"), resolve(s.env.Cwd, "now.json")}
	if given != "" {
		files = []string{resolve(s.env.Cwd, given)}
	}
	for i, file := range files {
		o, err := config.ReadStrict(file)
		switch {
		case errors.Is(err, fs.ErrNotExist):
			continue
		case err != nil:
			return cli.Errorf("Couldn't parse JSON file %s.", file)
		case i == 1:
			return &cli.Error{Message: "The `now.json` file is deprecated and no longer supported. Please rename it to `vercel.json`.", Link: "https://vercel.com/docs/projects/project-configuration"}
		}
		s.localScope, _ = o.String("scope")
		return nil
	}
	if given != "" {
		return cli.Errorf("Couldn't find a project configuration file at \n    %s", humanize(files[0]))
	}
	return nil
}

func (s *startup) printEarly(context.Context) error {
	name := s.inv.Name
	if printsBanner(name, s.env.Args) {
		s.ios.Print(s.ios.ColorScheme().Dim("Vercel CLI "+build.Version) + "\n")
	}
	switch {
	case name == "" && s.inv.Bool(cli.FlagVersion):
		fmt.Fprintln(s.ios.Out, build.Version)
	case name == "" && s.inv.Bool(cli.FlagHelp), name == "help" && len(s.inv.Args) == 0:
		fmt.Fprint(s.ios.Out, cli.RootHelp(s.root, s.ios.TerminalWidth(), s.ios.ColorScheme()))
	default:
		return nil
	}
	return cli.Silent(0)
}

func (s *startup) detectMode(context.Context) error {
	s.mode.AgentName = detectAgent(s.getenv)
	s.mode.NonInteractive = nonInteractive(s.env.Args, s.mode.AgentName != "", s.env.StdinTTY)
	s.ios.Debug(modeDebug(s.mode, s.inv.Bool(cli.FlagNonInteractive), s.env))
	s.mode.CI = s.getenv("CI") != ""
	return nil
}

func (s *startup) selectCommand(context.Context) error {
	s.path = s.inv.Path
	if len(s.path) > 0 {
		s.ios.Debug(fmt.Sprintf("user supplied known subcommand: %q", s.inv.Name))
	}
	switch {
	case s.inv.Name == "help":
		s.path = cli.Find(s.root, s.inv.Args)
	case s.inv.Bool(cli.FlagHelp):
		s.path = s.inv.HelpPath()
	}
	if len(s.path) == 0 {
		// Also upstream's deploy and extension fallbacks, not ported.
		return cli.Errorf("The %s subcommand does not exist", s.ios.ColorScheme().Param(s.inv.Name))
	}
	s.cmd = s.path[len(s.path)-1]
	return nil
}

func (s *startup) parent() *cli.Command {
	if len(s.path) < 2 {
		return nil
	}
	return s.path[len(s.path)-2]
}

// printCommandHelp: help wins over invalid input.
func (s *startup) printCommandHelp(context.Context) error {
	if (s.inv.Name != "help" && !s.inv.Bool(cli.FlagHelp)) || s.cmd.NotPorted {
		return nil
	}
	fmt.Fprint(s.ios.Out, s.help(s.cmd))
	return cli.Silent(0)
}

func (s *startup) help(cmd *cli.Command) string {
	return cli.CommandHelp(s.root, cmd, s.parent(), s.ios.TerminalWidth(), s.ios.ColorScheme())
}

func (s *startup) validateInput(context.Context) error {
	cs := s.ios.ColorScheme()
	tokenGiven := s.inv.Changed(cli.FlagToken)
	switch {
	case s.cmd.NotPorted:
		names := make([]string, len(s.path))
		for i, c := range s.path {
			names[i] = c.Name
		}
		return cli.Errorf("The %s subcommand does not exist", cs.Param(strings.Join(names, " ")))
	case s.cmd.IsGroup():
		return &cli.Error{Message: s.cmd.InvalidSubcommand, Help: s.help(s.cmd), Exit: 2}
	case s.inv.FlagErr != nil:
		return s.inv.FlagErr
	}
	if err := s.inv.Validate(); err != nil {
		return err
	}
	switch sc := s.inv.Shortcut(); {
	case sc != nil && sc.NoToken && tokenGiven:
		return &cli.Error{Message: "This command doesn't work with " + cs.Param("--token") + ". Please use " + cs.Param("--scope") + ".", Link: "https://err.sh/vercel/no-token-allowed"}
	case s.source != auth.FromStore:
		if err := checkToken(cs, s.token); err != nil {
			return err
		}
	}
	if s.cmd.Validate != nil {
		if err := s.cmd.Validate(s.checkedInput(s.inv)); err != nil {
			return err
		}
	}
	return s.inv.ValidatePage()
}

var nonWord = regexp.MustCompile(`\W`)

func checkToken(cs *iostreams.ColorScheme, token string) error {
	if token == "" {
		return &cli.Error{Message: "You defined " + cs.Param("--token") + ", but it's missing a value", Link: "https://err.sh/vercel/missing-token-value"}
	}
	var invalid []string
	for _, c := range nonWord.FindAllString(token, -1) {
		if !slices.Contains(invalid, c) {
			invalid = append(invalid, c)
		}
	}
	if len(invalid) == 0 {
		return nil
	}
	sort.Strings(invalid)
	for i, c := range invalid {
		q, _ := json.Marshal(c)
		invalid[i] = string(q)
	}
	return &cli.Error{Message: "You defined " + cs.Param("--token") + ", but its contents are invalid. Must not contain: " + strings.Join(invalid, ", "), Link: "https://err.sh/vercel/invalid-token-value"}
}

func (s *startup) loadGlobalConfig(context.Context) error {
	dir := config.GlobalDir()
	if d := s.inv.String(cli.FlagGlobalConfig); d != "" {
		dir = resolve(s.env.Cwd, d)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return cli.Errorf("An unexpected error occurred while trying to create the global directory %q %s", humanize(dir), err)
	}
	path := config.GlobalFile(dir)
	global, err := config.ReadGlobal(path)
	if errors.Is(err, fs.ErrNotExist) {
		global = config.DefaultGlobal()
		if err := config.WriteGlobal(path, global); err != nil {
			return cli.Errorf("An unexpected error occurred while trying to save the config to %q %s", humanize(path), err)
		}
	} else if err != nil {
		return cli.Errorf("An unexpected error occurred while trying to read the config in %q %s", humanize(path), err)
	}
	s.session = &auth.Session{Global: global, GlobalDir: dir, Source: s.source, UI: s.ios.UI, Creds: config.DefaultAuth()}
	return nil
}

func (s *startup) loadCredentials(context.Context) error {
	sess := s.session
	readErr := func(err error) error {
		return cli.Errorf("An unexpected error occurred while trying to read the auth config in %q %s", humanize(config.AuthFile(sess.GlobalDir)), err)
	}
	store, err := auth.Open(sess.GlobalDir, sess.Global, s.env.LookupEnv)
	if err != nil {
		return readErr(err)
	}
	sess.Store = store
	if sess.Explicit() {
		// An explicit token ignores the saved team, as upstream.
		sess.Creds = &config.Object{}
		sess.Creds.Set("token", s.token)
		sess.Global.Delete("currentTeam")
		return nil
	}
	creds, err := store.Read()
	switch {
	case err == nil:
		// {...defaults, ...stored}, as readAuthConfigFile does
		for _, k := range creds.Keys() {
			raw, _ := creds.Raw(k)
			sess.Creds.SetRaw(k, raw)
		}
	case !errors.Is(err, auth.ErrNotFound):
		return readErr(err)
	}
	return nil
}

func (s *startup) connect(context.Context) error {
	apiURL := "https://api.vercel.com"
	if v := s.inv.String(cli.FlagAPI); v != "" {
		apiURL = v
	} else if v, _ := s.session.Global.String("api"); v != "" {
		apiURL = v
	}
	if u, err := url.Parse(apiURL); err != nil || u.Scheme == "" {
		return cli.Errorf("Please provide a valid URL instead of %s.", s.ios.ColorScheme().Bold(apiURL))
	}
	s.oauth = oauth.New(s.env.HTTP, api.UserAgent())
	s.oauth.Debug = s.ios.Debug
	if s.env.Issuer != "" {
		s.oauth.Issuer = s.env.Issuer
	}
	s.session.OAuth = s.oauth
	s.client = api.New(apiURL, s.session, s.env.HTTP, s.ios.UI)
	s.client.AgentName = s.mode.AgentName
	s.cliSession = clisession.Load(s.session.GlobalDir, time.Now(), uuid)
	s.client.SessionID, s.client.InvocationID = s.cliSession.ID, s.invocationID
	saved, _ := s.session.Global.String("currentTeam")
	s.client.SetTeam(saved)
	s.resolver = &scope.Resolver{Client: s.client, Session: s.session, UI: s.ios.UI, Cwd: s.cwd, Getenv: s.getenv,
		Explicit: s.inv.Changed(cli.FlagScope) || s.inv.Changed(cli.FlagTeam) || s.localScope != ""}
	return nil
}

// requireLogin is promptMissingCredentials: log in first on a terminal or
// for an agent, outside CI; fail elsewhere.
func (s *startup) requireLogin(ctx context.Context) error {
	if !s.cmd.LogsInFirst() || s.session.Token() != "" {
		return nil
	}
	cs := s.ios.ColorScheme()
	switch {
	case s.mode.CI || !s.ios.IsStdoutTTY() && s.mode.AgentName == "":
		return &cli.Error{Message: "No existing credentials found. Please run " + cs.Cmd("vercel login") + " or pass " + cs.Param("--token"), Link: "https://err.sh/vercel/no-credentials-found"}
	case s.ios.IsStdoutTTY():
		s.ios.Log("No existing credentials found. Please log in:")
	default:
		s.ios.Log("No existing credentials found. Starting login flow...")
	}
	if err := s.login(ctx); err != nil {
		return err
	}
	s.ios.Success("Logged in.")
	s.ios.Debug(fmt.Sprintf("Saved credentials in %q", humanize(s.session.GlobalDir)))
	// Login may have selected a team; later requests use it.
	team, _ := s.session.Global.String("currentTeam")
	s.client.SetTeam(team)
	return nil
}

func (s *startup) resolveExplicitScope(ctx context.Context) error {
	team := s.inv.String(cli.FlagTeam)
	if team != "" {
		cs := s.ios.ColorScheme()
		s.ios.Warn("The " + cs.Param("--team") + " option is deprecated. Please use " + cs.Param("--scope") + " instead.")
	}
	name := cmp.Or(s.inv.String(cli.FlagScope), team, s.localScope)
	if name == "" || s.cmd.IgnoresScope() {
		return nil
	}
	id, err := s.resolver.ResolveExplicit(ctx, name)
	if err != nil {
		return err
	}
	s.client.SetTeam(id)
	return nil
}

// login is the device login, for needs that log in first and for
// `vercel login` (Input.Login).
func (s *startup) login(ctx context.Context) error {
	flow := &loginflow.Flow{UI: s.ios.UI, Mode: s.mode, OAuth: s.oauth, OpenBrowser: s.env.OpenBrowser,
		Session: s.session, Client: s.client, User: s.resolver.User}
	return flow.Run(ctx)
}

// checkedInput is what Command.Validate gets: no client, and no need to
// read.
func (s *startup) checkedInput(inv *cli.Invocation) *cli.Input {
	in := cli.NewInput(inv, nil)
	in.UI, in.Mode, in.Cwd = s.ios.UI, s.mode, s.cwd
	return in
}

func (s *startup) input(inv *cli.Invocation) *cli.Input {
	in := cli.NewInput(inv, resolver{s.resolver, s.login})
	in.UI, in.Mode, in.Cwd = s.ios.UI, s.mode, s.cwd
	in.Client, in.Context = s.client, s.context
	return in
}

// resolver is what commands' needs resolve with: internal/scope, and the
// device login for `vercel login`.
type resolver struct {
	*scope.Resolver
	login func(context.Context) error
}

func (r resolver) Login(ctx context.Context) error { return r.login(ctx) }

// runCommand writes JSON only for RunJSON, the only commands that take
// --json and --format.
func (s *startup) runCommand(ctx context.Context) error {
	in := s.input(s.inv)
	var res cli.Result
	var err error
	if s.cmd.RunJSON != nil {
		res, err = s.cmd.RunJSON(ctx, in)
	} else {
		res, err = s.cmd.Run(ctx, in)
	}
	if err != nil || res == nil {
		return err
	}
	if j, ok := res.(cli.JSONResult); ok && (s.inv.String(cli.FlagFormat) != "" || s.inv.Bool(cli.FlagJSON)) {
		cli.WriteJSON(s.ios.Out, j.JSON())
	} else {
		res.Render(s.ios.Out, s.ios.UI)
	}
	if e, ok := res.(cli.Exiter); ok && e.ExitCode() != 0 {
		return cli.Silent(e.ExitCode())
	}
	return nil
}
