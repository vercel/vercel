//go:build e2e

// Package e2e runs each case with this binary and the TypeScript CLI. It
// passes when stdout, stderr, the exit code, the files written and the API
// requests all match, after normalize.
//
//	make build VERSION=<reference version>
//	go test -tags e2e ./e2e -args -reference=/path/to/packages/cli/scripts/start.js -node=/path/to/node
package e2e

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

var (
	reference = flag.String("reference", "", "path to the TypeScript CLI's scripts/start.js")
	binary    = flag.String("binary", "../bin/vercel", "path to this CLI's binary")
	node      = flag.String("node", "node", "Node.js used to run the reference (the CLI supports Node 20 and later)")
	// goReference compares with another build of this CLI, skipping Differs
	// and TelemetryLookups.
	goReference = flag.Bool("go-reference", false, "the reference is a build of this CLI")
)

type Case struct {
	Name  string
	Args  []string
	Env   map[string]string
	Files map[string]string // relative to the case root; "cfg/" is the global config dir
	API   http.Handler      // serves the --api URL; nil means no API
	HTTPS http.Handler      // serves https://vercel.com and https://api.vercel.com
	// Cwd defaults to "work".
	Cwd string
	// PTY runs on a terminal, without color.
	PTY bool
	// TelemetryLookups are the TypeScript CLI's extra GET /v2/user requests
	// for telemetry, which is not ported.
	TelemetryLookups int
	// UnorderedRequests is for requests the TypeScript CLI sends
	// concurrently.
	UnorderedRequests bool
	Differs           []Difference
}

// Difference is an intended difference from the TypeScript CLI. It is
// applied to the TypeScript outcome before comparing; one that does not
// occur fails the case.
type Difference struct {
	Reason string
	// apply reports whether ts had the difference.
	apply func(c Case, ts *Outcome) bool
}

// savedSessionID shows in requests as "session=saved"; others as
// "session=new".
const savedSessionID = "5e55107a-0000-4000-8000-000000000000"

func savedSession(createdAgo, idle time.Duration) string {
	now := time.Now()
	return fmt.Sprintf(`{"id":%q,"createdAt":%d,"lastSeenAt":%d}`, savedSessionID, now.Add(-createdAgo).UnixMilli(), now.Add(-idle).UnixMilli())
}

// defaultConfig is config.json as both CLIs create it on first run.
const defaultConfig = "{\n" +
	"  \"// Note\": \"This is your Vercel config file. For more information see the global configuration documentation.\",\n" +
	"  \"// Docs\": \"https://vercel.com/docs/projects/project-configuration/global-configuration#config.json\"\n" +
	"}\n mode=644"

// InputCheckedFirst: on invalid input this CLI writes no config.json.
var InputCheckedFirst = Difference{
	Reason: "input is checked before config.json is created",
	apply: func(_ Case, ts *Outcome) bool {
		if ts.Files["cfg/config.json"] != defaultConfig {
			return false
		}
		delete(ts.Files, "cfg/config.json")
		return true
	},
}

// Recovery: the error ends with recovery commands. after is its last
// line; next are label and command pairs.
func Recovery(after string, next ...string) Difference {
	text := "\n"
	for i := 0; i+1 < len(next); i += 2 {
		text += "  " + next[i] + ":\n    " + next[i+1] + "\n"
	}
	return Difference{
		Reason: "the error suggests recovery commands",
		apply: func(_ Case, ts *Outcome) bool {
			i := strings.Index(ts.Stderr, after+"\n")
			if i < 0 || strings.Contains(ts.Stderr, text) {
				return false
			}
			end := i + len(after) + 1
			ts.Stderr = ts.Stderr[:end] + text + ts.Stderr[end:]
			return true
		},
	}
}

// AgentText: instead of a JSON payload on stdout, the text error ends
// stderr.
func AgentText(text string) Difference {
	return Difference{
		Reason: "agents get text errors on stderr",
		apply: func(_ Case, ts *Outcome) bool {
			if !strings.HasPrefix(ts.Stdout, "{\n") || !strings.Contains(ts.Stdout, `"status": `) {
				return false
			}
			ts.Stdout, ts.Stderr = "", ts.Stderr+text
			return true
		},
	}
}

// NextPage: the next-page command is canonical and keeps the context
// flags.
func NextPage(today, want string) Difference {
	return Difference{
		Reason: "the next-page command is canonical and keeps the context flags",
		apply: func(_ Case, ts *Outcome) bool {
			old := "To display the next page run `" + today + "`"
			if !strings.Contains(ts.Stderr, old) {
				return false
			}
			ts.Stderr = strings.Replace(ts.Stderr, old, "To display the next page run `"+want+"`", 1)
			return true
		},
	}
}

// Changed: on purpose, this CLI does something else than today's: it
// exits with exit, prints stdout and stderr, and sends requests.
func Changed(reason string, exit int, stdout, stderr string, requests ...string) Difference {
	return Difference{
		Reason: reason,
		apply: func(_ Case, ts *Outcome) bool {
			if ts.Exit == exit && ts.Stdout == stdout && ts.Stderr == stderr && fmt.Sprint(sorted(ts.Requests)) == fmt.Sprint(sorted(requests)) {
				return false
			}
			ts.Exit, ts.Stdout, ts.Stderr, ts.Requests = exit, stdout, stderr, requests
			return true
		},
	}
}

// KeepsFile: this CLI leaves the case's file name as it was, where
// today's rewrites it.
func KeepsFile(name string) Difference {
	return Difference{
		Reason: name + " is left as it was",
		apply: func(c Case, ts *Outcome) bool {
			want := c.Files[name] + " mode=644"
			if ts.Files[name] == want {
				return false
			}
			ts.Files[name] = want
			return true
		},
	}
}

// Replaced: this CLI prints new where today's prints old, in stdout or
// stderr.
func Replaced(reason, old, new string) Difference {
	return Difference{
		Reason: reason,
		apply: func(_ Case, ts *Outcome) bool {
			for _, out := range []*string{&ts.Stdout, &ts.Stderr} {
				if strings.Contains(*out, old) {
					*out = strings.Replace(*out, old, new, 1)
					return true
				}
			}
			return false
		},
	}
}

// banner is the version line both CLIs print first, at the reference
// version.
const banner = "Vercel CLI 61.1.0\n"

// HelpAdds: help ends with Notes and Related. golden names the help file
// in internal/cmd/root/testdata, e.g. "vercel_teams_list".
func HelpAdds(golden string) Difference {
	return Difference{
		Reason: "help adds notes and related commands",
		apply: func(_ Case, ts *Outcome) bool {
			data, err := os.ReadFile(filepath.Join("..", "internal", "cmd", "root", "testdata", golden+".help"))
			if err != nil {
				return false
			}
			want, today := string(data), strings.TrimSuffix(ts.Stdout, "\n")
			if today == "" || want == ts.Stdout || !strings.HasPrefix(want, today) {
				return false
			}
			added := want[len(today):]
			if !strings.Contains(added, "Notes:") && !strings.Contains(added, "Related:") {
				return false
			}
			ts.Stdout = want
			return true
		},
	}
}

// CheckedBeforeWork: Command.Validate runs before any work. failed is the
// TypeScript CLI's error from that work, if any, replaced by check.
func CheckedBeforeWork(failed, check string) Difference {
	return Difference{
		Reason: "the command's checks run before any work",
		apply: func(c Case, ts *Outcome) bool {
			changed := false
			if _, given := c.Files["cfg/config.json"]; !given && ts.Files["cfg/config.json"] != "" {
				delete(ts.Files, "cfg/config.json")
				changed = true
			}
			if len(ts.Requests) > 0 {
				ts.Requests, changed = nil, true
			}
			if failed != "" {
				if !strings.Contains(ts.Stderr, failed) {
					return false
				}
				ts.Stderr, changed = strings.Replace(ts.Stderr, failed, check, 1), true
			}
			return changed
		},
	}
}

type Outcome struct {
	Stdout, Stderr string
	Exit           int
	Files          map[string]string
	Requests       []string
	start          time.Time
	root           string
}

type recorder struct {
	mu       sync.Mutex
	requests []string
	handler  http.Handler
}

func (r *recorder) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	body, _ := io.ReadAll(req.Body)
	req.Body = io.NopCloser(bytes.NewReader(body))
	host := req.Host
	if strings.HasPrefix(host, "127.0.0.1:") {
		host = "api" // the --api mock; its port differs between runs
	}
	line := req.Method + " " + host + req.URL.EscapedPath()
	if q := req.URL.Query(); len(q) > 0 {
		line += "?" + q.Encode()
	}
	if a := req.Header.Get("Authorization"); a != "" {
		line += " auth=" + a
	}
	if a := req.Header.Get("x-ai-agent"); a != "" {
		line += " agent=" + a
	}
	switch id := req.Header.Get("x-vercel-cli-session-id"); id {
	case "":
	case savedSessionID:
		line += " session=saved"
	default:
		line += " session=new"
	}
	if len(body) > 0 {
		line += " body=" + canonicalBody(req.Header.Get("Content-Type"), body)
	}
	r.mu.Lock()
	r.requests = append(r.requests, line)
	r.mu.Unlock()
	r.handler.ServeHTTP(w, req)
}

// canonicalBody sorts form fields; JSON bodies are compacted with numbers
// kept exactly (UseNumber), so numeric differences are not hidden.
func canonicalBody(contentType string, body []byte) string {
	if strings.Contains(contentType, "x-www-form-urlencoded") {
		fields := strings.Split(string(body), "&")
		sort.Strings(fields)
		return strings.Join(fields, "&")
	}
	var b bytes.Buffer
	if json.Compact(&b, body) == nil {
		return b.String()
	}
	return string(body)
}

func run(t *testing.T, c Case, cli []string) Outcome {
	t.Helper()
	root := filepath.Join(os.TempDir(), "vercel-cli-go-e2e", sanitize(t.Name()))
	os.RemoveAll(root)
	t.Cleanup(func() { os.RemoveAll(root) })
	for _, dir := range []string{"work", "cfg", "home", "bin"} {
		must(t, os.MkdirAll(filepath.Join(root, dir), 0o755))
	}
	for name, content := range c.Files {
		path := filepath.Join(root, name)
		must(t, os.MkdirAll(filepath.Dir(path), 0o755))
		must(t, os.WriteFile(path, []byte(content), 0o644))
	}
	// A browser stub records URLs instead of opening them, for both CLIs.
	must(t, os.WriteFile(filepath.Join(root, "bin", "open"), []byte("#!/bin/sh\necho \"$@\" >> \"$VERCEL_E2E_ROOT/opened\"\n"), 0o755))
	must(t, os.WriteFile(filepath.Join(root, "bin", "xdg-open"), []byte("#!/bin/sh\necho \"$@\" >> \"$VERCEL_E2E_ROOT/opened\"\n"), 0o755))

	for _, h := range []http.Handler{c.API, c.HTTPS} {
		if r, ok := h.(interface{ Reset() }); ok {
			r.Reset() // each CLI starts from the same mock state
		}
	}
	var rec *recorder
	env := []string{
		"PATH=" + filepath.Join(root, "bin") + ":" + os.Getenv("PATH"),
		"HOME=" + filepath.Join(root, "home"),
		"VERCEL_E2E_ROOT=" + root,
		"NO_UPDATE_NOTIFIER=1",
		"VERCEL_TELEMETRY_DISABLED=1",
		"VERCEL_TEST_KEYRING_UNAVAILABLE=1",
		"TERM=xterm",
		"TZ=UTC",
	}
	args := append([]string{}, c.Args...)
	args = append([]string{"--global-config", filepath.Join(root, "cfg")}, args...)
	if c.API != nil {
		rec = &recorder{handler: c.API}
		srv := httptest.NewServer(rec)
		t.Cleanup(srv.Close)
		args = append([]string{"--api", srv.URL}, args...)
	}
	if c.HTTPS != nil {
		if rec == nil {
			rec = &recorder{}
		}
		rec.handler = c.HTTPS
		proxyURL, caPath := httpsInterceptor(t, rec, []string{"vercel.com", "api.vercel.com"})
		env = append(env, "HTTPS_PROXY="+proxyURL, "https_proxy="+proxyURL, "NODE_EXTRA_CA_CERTS="+caPath)
	}
	for k, v := range c.Env {
		env = append(env, k+"="+v)
	}
	cwd := c.Cwd
	if cwd == "" {
		cwd = "work"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	start := time.Now()
	var out Outcome
	if c.PTY {
		out = runPTY(t, ctx, append(cli, args...), env, filepath.Join(root, cwd))
	} else {
		cmd := exec.CommandContext(ctx, cli[0], append(cli[1:], args...)...)
		cmd.Env, cmd.Dir = env, filepath.Join(root, cwd)
		cmd.Stdin = strings.NewReader("")
		var stdout, stderr bytes.Buffer
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		err := cmd.Run()
		out.Stdout, out.Stderr = stdout.String(), stderr.String()
		if ee, ok := err.(*exec.ExitError); ok {
			out.Exit = ee.ExitCode()
		} else if err != nil {
			t.Fatalf("run %v: %v", cli, err)
		}
	}
	if rec != nil {
		out.Requests = rec.requests
	}
	out.Files = snapshot(t, root)
	out.start, out.root = start, root
	return out
}

// snapshot captures the config directory, .vercel directories and the
// browser stub's record.
func snapshot(t *testing.T, root string) map[string]string {
	files := map[string]string{}
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		if strings.HasPrefix(rel, "bin/") || strings.HasPrefix(rel, "home/Library/Keychains") {
			return nil
		}
		data, _ := os.ReadFile(path)
		files[rel] = fmt.Sprintf("%s mode=%o", data, info.Mode().Perm())
		return nil
	})
	return files
}

func sanitize(s string) string {
	return regexp.MustCompile(`[^A-Za-z0-9_.-]+`).ReplaceAllString(s, "_")
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// httpsInterceptor serves allowed hosts through a CONNECT proxy with a
// throwaway CA, trusted through NODE_EXTRA_CA_CERTS.
func httpsInterceptor(t *testing.T, handler http.Handler, hosts []string) (proxyURL, caPath string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	must(t, err)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "cli-go e2e CA"}, DNSNames: hosts,
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	must(t, err)
	caPath = filepath.Join(t.TempDir(), "ca.pem")
	must(t, os.WriteFile(caPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600))
	server := httptest.NewUnstartedServer(handler)
	server.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}}
	server.StartTLS()
	t.Cleanup(server.Close)
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowed := false
		for _, h := range hosts {
			allowed = allowed || r.Host == h+":443"
		}
		if r.Method != http.MethodConnect || !allowed {
			http.Error(w, "blocked", http.StatusForbidden)
			return
		}
		upstream, err := net.Dial("tcp", server.Listener.Addr().String())
		if err != nil {
			return
		}
		defer upstream.Close()
		conn, buf, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = buf.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
		_ = buf.Flush()
		go func() { _, _ = io.Copy(upstream, buf); upstream.Close() }()
		_, _ = io.Copy(conn, upstream)
	}))
	t.Cleanup(proxy.Close)
	return proxy.URL, caPath
}

// runPTY returns the terminal transcript as Stdout.
func runPTY(t *testing.T, ctx context.Context, argv, env []string, dir string) Outcome {
	t.Helper()
	script := `
import os, pty, sys, json
argv = json.loads(sys.argv[1])
pid, fd = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)
out = b""
while True:
    try:
        chunk = os.read(fd, 65536)
    except OSError:
        break
    if not chunk:
        break
    out += chunk
_, status = os.waitpid(pid, 0)
sys.stdout.buffer.write(out)
sys.exit(os.waitstatus_to_exitcode(status))
`
	encoded, _ := json.Marshal(argv)
	cmd := exec.CommandContext(ctx, "python3", "-c", script, string(encoded))
	cmd.Env, cmd.Dir = append(env, "NO_COLOR=1"), dir
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	err := cmd.Run()
	out := Outcome{Stdout: strings.ReplaceAll(stdout.String(), "\r\n", "\n")}
	if ee, ok := err.(*exec.ExitError); ok {
		out.Exit = ee.ExitCode()
	} else if err != nil {
		t.Fatal(err)
	}
	return out
}

// Normalizations, each an explicit, documented difference:
//   - The TypeScript banner names its runtime: "(Node.js x.y.z)". This binary
//     prints the native-binary form, as the TypeScript native build does.
//   - Node runtime warnings (e.g. ExperimentalWarning) are not CLI output.
//   - Telemetry is not ported: telemetry-*.json files are ignored. The CLI
//     session in telemetry-session.json is compared through the requests'
//     x-vercel-cli-session-id (savedSessionID).
//   - expiresAt is computed from the clock, so it is compared as seconds
//     after the run started, rounded to the minute.
//   - Debug timestamps and request durations, and the per-invocation
//     invocationId, and the mock API's port, differ between any two runs.
//   - The case directory is shown as <root>; it differs between machines.
var (
	debugTime    = regexp.MustCompile(`\[debug\] \[\d{4}-\d\d-\d\dT[\d:.]+Z\]`)
	duration     = regexp.MustCompile(`\[\d+(\.\d+)?m?s\]`)
	invocationID = regexp.MustCompile(`"invocationId": "[0-9a-f-]+"`)
	mockPort     = regexp.MustCompile(`127\.0\.0\.1:\d+`)
	nodeBanner   = regexp.MustCompile(` \(Node\.js [0-9.]+\)`)
	nodeWarning  = regexp.MustCompile(`(?m)^\(node:\d+\) .*\n|^\(Use ` + "`node --trace-warnings ...`" + ` .*\n`)
	expiresAt    = regexp.MustCompile(`"expiresAt": (\d+)`)
)

func normalize(o Outcome) Outcome {
	clean := func(s string) string {
		s = nodeWarning.ReplaceAllString(nodeBanner.ReplaceAllString(s, ""), "")
		s = debugTime.ReplaceAllString(s, "[debug] [<time>]")
		s = duration.ReplaceAllString(s, "[<duration>]")
		s = mockPort.ReplaceAllString(s, "127.0.0.1:<port>")
		if o.root != "" {
			s = strings.ReplaceAll(s, o.root, "<root>")
		}
		return invocationID.ReplaceAllString(s, `"invocationId": "<id>"`)
	}
	o.Stderr, o.Stdout = clean(o.Stderr), clean(o.Stdout)
	files := map[string]string{}
	for name, content := range o.Files {
		if strings.HasPrefix(filepath.Base(name), "telemetry-") {
			continue
		}
		files[name] = expiresAt.ReplaceAllStringFunc(content, func(m string) string {
			var n int64
			fmt.Sscanf(m, `"expiresAt": %d`, &n)
			rel := (n - o.start.Unix() + 30) / 60 * 60
			return fmt.Sprintf(`"expiresAt": <start+%ds>`, rel)
		})
	}
	o.Files = files
	return o
}

func compare(t *testing.T, c Case) (goOut, tsOut Outcome) {
	t.Helper()
	if *reference == "" {
		t.Skip("set -reference to the TypeScript CLI's scripts/start.js")
	}
	bin, err := filepath.Abs(*binary)
	must(t, err)
	goOut = normalize(run(t, c, []string{bin}))
	tsOut = normalize(run(t, c, []string{*node, *reference}))
	if *goReference {
		c.Differs, c.TelemetryLookups = nil, 0
	}
	for _, d := range c.Differs {
		if !d.apply(c, &tsOut) {
			t.Errorf("declared difference %q did not occur; remove it from the case", d.Reason)
		}
	}
	if goOut.Exit != tsOut.Exit {
		t.Errorf("exit: go=%d ts=%d", goOut.Exit, tsOut.Exit)
	}
	if goOut.Stdout != tsOut.Stdout {
		t.Errorf("stdout differs\n--- ts\n%s\n--- go\n%s", tsOut.Stdout, goOut.Stdout)
	}
	if goOut.Stderr != tsOut.Stderr {
		t.Errorf("stderr differs\n--- ts\n%s\n--- go\n%s", tsOut.Stderr, goOut.Stderr)
	}
	tsRequests := tsOut.Requests
	for i := 0; i < c.TelemetryLookups; i++ {
		j := slices.IndexFunc(tsRequests, func(r string) bool { return strings.HasPrefix(r, "GET api.vercel.com/v2/user") })
		if j < 0 {
			t.Errorf("expected %d telemetry user lookups from the TypeScript CLI", c.TelemetryLookups)
			break
		}
		tsRequests = slices.Delete(slices.Clone(tsRequests), j, j+1)
	}
	goRequests := goOut.Requests
	if c.UnorderedRequests {
		goRequests, tsRequests = sorted(goRequests), sorted(tsRequests)
	}
	if fmt.Sprint(goRequests) != fmt.Sprint(tsRequests) {
		t.Errorf("requests differ\n--- ts\n%s\n--- go\n%s", strings.Join(tsOut.Requests, "\n"), strings.Join(goOut.Requests, "\n"))
	}
	for name := range union(goOut.Files, tsOut.Files) {
		if goOut.Files[name] != tsOut.Files[name] {
			t.Errorf("file %s differs\n--- ts\n%s\n--- go\n%s", name, tsOut.Files[name], goOut.Files[name])
		}
	}
	return goOut, tsOut
}

func sorted(s []string) []string {
	s = slices.Clone(s)
	sort.Strings(s)
	return s
}

func union(a, b map[string]string) map[string]bool {
	m := map[string]bool{}
	for k := range a {
		m[k] = true
	}
	for k := range b {
		m[k] = true
	}
	return m
}

// jsonHandler serves fixed JSON responses by "METHOD /path".
type jsonHandler map[string]reply

type reply struct {
	Status int
	Body   string
	Header map[string]string
}

func (h jsonHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rep, ok := h[r.Method+" "+r.URL.Path]
	if !ok {
		rep = reply{Status: 404, Body: `{"error":{"code":"not_found","message":"Not found: ` + r.URL.Path + `"}}`}
	}
	for k, v := range rep.Header {
		w.Header().Set(k, v)
	}
	w.Header().Set("Content-Type", "application/json")
	if rep.Status == 0 {
		rep.Status = 200
	}
	w.WriteHeader(rep.Status)
	_, _ = io.WriteString(w, rep.Body)
}
