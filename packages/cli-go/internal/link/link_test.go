package link

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestReadProject(t *testing.T) {
	dir := t.TempDir()
	if p, err := ReadProject(dir); p != nil || err != nil {
		t.Fatalf("unlinked: %v %v", p, err)
	}
	write(t, filepath.Join(dir, ".vercel", "project.json"), `{"projectId":"prj_1","orgId":"team_1"}`)
	if p, err := ReadProject(dir); err != nil || p.ProjectID != "prj_1" || p.OrgID != "team_1" {
		t.Fatalf("linked: %v %v", p, err)
	}
	write(t, filepath.Join(dir, ".vercel", "project.json"), `{"settings":{}}`)
	if p, err := ReadProject(dir); p != nil || err != nil {
		t.Errorf("settings-only project.json: %v %v", p, err)
	}
	write(t, filepath.Join(dir, ".vercel", "project.json"), `{"projectId":"prj_1","orgId":"team_1","projectName":"web"}`)
	if p, err := ReadProject(dir); err != nil || p.ProjectName != "web" {
		t.Errorf("named link: %+v, %v", p, err)
	}
	for content, want := range map[string]string{
		`{not json`: "Project Settings could not be retrieved. To link your project again, remove the " + filepath.Join(dir, ".vercel") + " directory.",
		`{"projectId":"prj_1","orgId":"team_1","projectName":""}`: "Project Settings are invalid. To link your project again, remove the " + filepath.Join(dir, ".vercel") + " directory.",
	} {
		write(t, filepath.Join(dir, ".vercel", "project.json"), content)
		if _, err := ReadProject(dir); err == nil || err.Error() != want {
			t.Errorf("%s: %v", content, err)
		}
	}
}

func TestReadProjectLegacyAndConflictingDirectories(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, ".now", "project.json"), `{"projectId":"prj_now","orgId":"team_1"}`)
	if p, err := ReadProject(dir); err != nil || p.ProjectID != "prj_now" {
		t.Fatalf(".now: %v %v", p, err)
	}
	write(t, filepath.Join(dir, ".vercel", "project.json"), `{"projectId":"prj_1","orgId":"team_1"}`)
	if _, err := ReadProject(dir); err == nil {
		t.Error("both .vercel and .now accepted")
	}
}

func TestReadRepo(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, ".vercel", "repo.json"), `{"orgId":"team_1","projects":[{"id":"p1","name":"web","directory":"apps/web"}]}`)
	cwd := filepath.Join(root, "apps", "web", "src")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatal(err)
	}
	var debug []string
	repo, err := ReadRepo(cwd, func(s string) { debug = append(debug, s) })
	if err != nil {
		t.Fatal(err)
	}
	gotRoot, _ := filepath.EvalSymlinks(repo.Root)
	wantRoot, _ := filepath.EvalSymlinks(root)
	if gotRoot != wantRoot || repo.Config == nil || repo.Config.OrgID != "team_1" {
		t.Errorf("repo %+v", repo)
	}
	if len(debug) == 0 {
		t.Error("no repo-root debug line")
	}
}

func TestProjectsForPath(t *testing.T) {
	projects := []RepoProject{
		{ID: "root", Directory: "."},
		{ID: "web", Directory: "apps/web"},
		{ID: "web2", Directory: "apps/web"},
		{ID: "api", Directory: "apps/api"},
	}
	ids := func(ps []RepoProject) (out []string) {
		for _, p := range ps {
			out = append(out, p.ID)
		}
		return out
	}
	cases := map[string][]string{
		"apps/web":         {"web", "web2"}, // the deepest matches only
		"apps/web/src/lib": {"web", "web2"},
		"apps/webby":       {"root"}, // a prefix of the name is not a match
		"docs":             {"root"},
	}
	for path, want := range cases {
		if got := ids(ProjectsForPath(projects, path)); len(got) != len(want) || (len(got) > 0 && got[0] != want[0]) || (len(got) > 1 && got[1] != want[1]) {
			t.Errorf("%s: %v, want %v", path, got, want)
		}
	}
	if got := ProjectsForPath([]RepoProject{{ID: "api", Directory: "apps/api"}}, "docs"); got != nil {
		t.Errorf("no match: %v", got)
	}
}
