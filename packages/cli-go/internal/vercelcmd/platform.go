package vercelcmd

import (
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// httpClient also trusts NODE_EXTRA_CA_CERTS, as Node does.
func httpClient(ios *iostreams.IOStreams) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if path := os.Getenv("NODE_EXTRA_CA_CERTS"); path != "" {
		pool, err := x509.SystemCertPool()
		if err != nil {
			pool = x509.NewCertPool()
		}
		pem, err := os.ReadFile(path)
		if err != nil || !pool.AppendCertsFromPEM(pem) {
			ios.Warn("Ignoring extra certs from `" + path + "`, load failed")
		} else {
			transport.TLSClientConfig = &tls.Config{RootCAs: pool}
		}
	}
	return &http.Client{Transport: transport}
}

// openBrowser waits for the launcher, so the URL is not lost if the CLI
// exits right after.
func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Run()
}

func resolve(base, p string) string {
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	return filepath.Join(base, p)
}

// humanize replaces the home directory with "~", as humanize-path does.
func humanize(p string) string {
	if home, err := os.UserHomeDir(); err == nil && strings.HasPrefix(p, home) {
		return "~" + p[len(home):]
	}
	return p
}

func uuid() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
