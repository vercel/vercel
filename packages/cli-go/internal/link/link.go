// Package link reads .vercel/project.json and .vercel/repo.json.
package link

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type Project struct {
	ProjectID   string `json:"projectId"`
	OrgID       string `json:"orgId"`
	ProjectName string `json:"projectName,omitempty"`
}

// ReadProject is getLinkFromDir(getVercelDirectory(dir)), so it also
// reads .now/project.json. It is nil when not linked, with today's errors
// for a file that cannot be used.
func ReadProject(dir string) (*Project, error) {
	vercelDir, err := vercelDirectory(dir)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(filepath.Join(vercelDir, "project.json"))
	if errors.Is(err, os.ErrNotExist) || isNotDir(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var v any
	if json.Unmarshal(data, &v) != nil {
		return nil, errors.New("Project Settings could not be retrieved. To link your project again, remove the " + vercelDir + " directory.")
	}
	fields, _ := v.(map[string]any)
	id, _ := fields["projectId"].(string)
	org, _ := fields["orgId"].(string)
	if id == "" || org == "" {
		return nil, nil // settings-only project.json, written for repo links
	}
	name, isString := fields["projectName"].(string)
	if _, given := fields["projectName"]; given && (!isString || name == "") {
		return nil, errors.New("Project Settings are invalid. To link your project again, remove the " + vercelDir + " directory.")
	}
	return &Project{ProjectID: id, OrgID: org, ProjectName: name}, nil
}

func vercelDirectory(dir string) (string, error) {
	primary, fallback := filepath.Join(dir, ".vercel"), filepath.Join(dir, ".now")
	primaryOK, fallbackOK := isDir(primary), isDir(fallback)
	if primaryOK && fallbackOK {
		return "", errors.New("Both `.vercel` and `.now` directories exist. Please remove the `.now` directory.")
	}
	if fallbackOK {
		return fallback, nil
	}
	return primary, nil
}

type RepoProject struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Directory string `json:"directory"`
	OrgID     string `json:"orgId,omitempty"`
}

type Repo struct {
	OrgID    string        `json:"orgId"`
	Projects []RepoProject `json:"projects"`
}

type RepoLink struct {
	Root   string
	Config *Repo
}

// ConfigPath is repo.json's path.
func (r *RepoLink) ConfigPath() string { return filepath.Join(r.Root, ".vercel", "repo.json") }

func ReadRepo(cwd string, debug func(string)) (*RepoLink, error) {
	root := findRepoRoot(cwd, debug)
	if root == "" {
		return nil, nil
	}
	data, err := os.ReadFile(filepath.Join(root, ".vercel", "repo.json"))
	if errors.Is(err, os.ErrNotExist) {
		return &RepoLink{Root: root}, nil
	}
	if err != nil {
		return nil, err
	}
	var cfg Repo
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &RepoLink{Root: root, Config: &cfg}, nil
}

// findRepoRoot: the nearest .vercel/repo.json below $HOME, else the git
// top level, else the nearest .git.
func findRepoRoot(start string, debug func(string)) string {
	home, _ := os.UserHomeDir()
	marker := filepath.Join(".vercel", "repo.json")
	if dir := walkUp(start, home, marker, debug); dir != "" {
		debug(`Found "` + marker + `" - detected "` + dir + `" as repo root`)
		return dir
	}
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	cmd.Dir = start
	if out, err := cmd.Output(); err == nil {
		root := strings.TrimSpace(string(out))
		debug(`Found git root via "git rev-parse --show-toplevel" - detected "` + root + `" as repo root`)
		return root
	}
	if dir := walkUp(start, home, ".git", debug); dir != "" {
		debug(`Found ".git" - detected "` + dir + `" as repo root`)
		return dir
	}
	debug("Aborting search for repo root")
	return ""
}

func walkUp(start, home, marker string, debug func(string)) string {
	for dir := start; ; dir = filepath.Dir(dir) {
		if dir == home {
			debug("Arrived at home directory")
			return ""
		}
		if _, err := os.Lstat(filepath.Join(dir, marker)); err == nil {
			return dir
		}
		if filepath.Dir(dir) == dir {
			return ""
		}
	}
}

// ProjectsForPath keeps only the deepest projects containing path.
func ProjectsForPath(projects []RepoProject, path string) []RepoProject {
	path = filepath.ToSlash(path)
	sorted := append([]RepoProject{}, projects...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return strings.Count(sorted[i].Directory, "/") > strings.Count(sorted[j].Directory, "/")
	})
	var matches []RepoProject
	for _, p := range sorted {
		if p.Directory == "." || path == p.Directory || strings.HasPrefix(path, p.Directory+"/") {
			matches = append(matches, p)
		}
	}
	if len(matches) == 0 {
		return nil
	}
	var deepest []RepoProject
	for _, m := range matches {
		if m.Directory == matches[0].Directory {
			deepest = append(deepest, m)
		}
	}
	return deepest
}

func isDir(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

func isNotDir(err error) bool {
	var pe *os.PathError
	return errors.As(err, &pe) && strings.Contains(pe.Err.Error(), "not a directory")
}
