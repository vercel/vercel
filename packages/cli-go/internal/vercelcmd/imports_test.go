package vercelcmd

import (
	"go/parser"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// Startup acts on Needs, never on a command: it imports the command tree
// and no command package.
func TestStartupImportsNoCommand(t *testing.T) {
	const cmds = "github.com/vercel/vercel/packages/cli-go/internal/cmd/"
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, imp := range file.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			if strings.HasPrefix(p, cmds) && p != cmds+"root" {
				t.Errorf("%s imports %q: share the code through a package outside internal/cmd, as loginflow does", path, p)
			}
		}
	}
}
