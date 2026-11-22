package auth

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/config"
)

// fakeKeyring stands in for the OS keyring; tests never touch the real one.
type fakeKeyring struct {
	entries map[string]string
	fail    bool
}

func (k *fakeKeyring) get(service, account string) (string, error) {
	if k.fail {
		return "", errors.New("locked")
	}
	v, ok := k.entries[service+"/"+account]
	if !ok {
		return "", errKeyringNotFound
	}
	return v, nil
}

func (k *fakeKeyring) set(service, account, secret string) error {
	if k.fail {
		return errors.New("locked")
	}
	k.entries[service+"/"+account] = secret
	return nil
}

func (k *fakeKeyring) delete(service, account string) error {
	delete(k.entries, service+"/"+account)
	return nil
}

func newStore(t *testing.T, mode Storage) (*Store, *fakeKeyring) {
	t.Helper()
	k := &fakeKeyring{entries: map[string]string{}}
	return &Store{Path: filepath.Join(t.TempDir(), "auth.json"), Storage: mode, Getenv: func(string) string { return "" }, keyring: k}, k
}

func creds(token string) *config.Object {
	o := &config.Object{}
	o.Set("token", token)
	return o
}

func token(t *testing.T, o *config.Object) string {
	t.Helper()
	s, _ := o.String("token")
	return s
}

func TestOpenResolvesStorage(t *testing.T) {
	lookup := func(env map[string]string) func(string) (string, bool) {
		return func(k string) (string, bool) { v, ok := env[k]; return v, ok }
	}
	global := &config.Object{}
	s, err := Open(t.TempDir(), global, lookup(nil))
	if err != nil || s.Storage != File {
		t.Fatalf("default: %v %v", s, err)
	}
	if s, _ := Open(t.TempDir(), global, lookup(map[string]string{"VERCEL_TOKEN_STORAGE": "auto"})); s.Storage != Auto {
		t.Errorf("env: %v", s.Storage)
	}
	global.Set("credStorage", "keyring") // config wins over the environment
	if s, _ := Open(t.TempDir(), global, lookup(map[string]string{"VERCEL_TOKEN_STORAGE": "auto"})); s.Storage != Keyring {
		t.Errorf("config: %v", s.Storage)
	}
	global.Set("credStorage", "vault")
	if _, err := Open(t.TempDir(), global, lookup(nil)); err == nil || !strings.Contains(err.Error(), "Invalid value for `credStorage`: \"vault\"") {
		t.Errorf("invalid: %v", err)
	}
}

func TestFileMode(t *testing.T) {
	s, k := newStore(t, File)
	if _, err := s.Read(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty store: %v", err)
	}
	if err := s.Persist(creds("tok")); err != nil {
		t.Fatal(err)
	}
	got, err := s.Read()
	if err != nil || token(t, got) != "tok" {
		t.Fatalf("read back: %v %v", got, err)
	}
	if info, _ := os.Stat(s.Path); info.Mode().Perm() != 0o600 {
		t.Errorf("auth.json mode %v", info.Mode().Perm())
	}
	if len(k.entries) != 0 {
		t.Errorf("file mode wrote to the keyring: %v", k.entries)
	}
}

func TestFileModeMigratesFromKeyring(t *testing.T) {
	s, k := newStore(t, File)
	k.entries[keyringService+"/"+s.account()] = `{"token":"from-keyring"}`
	got, err := s.Read()
	if err != nil || token(t, got) != "from-keyring" {
		t.Fatalf("read: %v %v", got, err)
	}
	if _, err := os.Stat(s.Path); err != nil {
		t.Errorf("auth.json not written: %v", err)
	}
	if len(k.entries) != 0 {
		t.Errorf("keyring entry not removed: %v", k.entries)
	}
}

func TestKeyringModeMigratesTheFile(t *testing.T) {
	s, k := newStore(t, Keyring)
	if err := config.WriteAuth(s.Path, creds("from-file")); err != nil {
		t.Fatal(err)
	}
	got, err := s.Read()
	if err != nil || token(t, got) != "from-file" {
		t.Fatalf("read: %v %v", got, err)
	}
	if _, err := os.Stat(s.Path); !os.IsNotExist(err) {
		t.Errorf("auth.json not removed after moving it to the keyring")
	}
	if len(k.entries) != 1 {
		t.Errorf("keyring entries %v", k.entries)
	}
}

func TestAutoModeFallsBackToTheFile(t *testing.T) {
	s, k := newStore(t, Auto)
	k.fail = true
	if err := s.Persist(creds("tok")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.Path); err != nil {
		t.Fatalf("auth.json not written: %v", err)
	}
	k.fail = false
	if err := s.Persist(creds("tok2")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.Path); !os.IsNotExist(err) {
		t.Error("auth.json kept after the keyring became available")
	}
	got, _ := s.Read()
	if token(t, got) != "tok2" {
		t.Errorf("read %v", got)
	}
}

func TestKeyringUnavailable(t *testing.T) {
	s, _ := newStore(t, Keyring)
	s.Getenv = func(k string) string {
		if k == "VERCEL_TEST_KEYRING_UNAVAILABLE" {
			return "1"
		}
		return ""
	}
	if _, err := s.Read(); err == nil || err.Error() != keyringUnavailable {
		t.Errorf("read: %v", err)
	}
}

func TestPersistRemovesUnusableCredentials(t *testing.T) {
	s, k := newStore(t, File)
	if err := s.Persist(creds("tok")); err != nil {
		t.Fatal(err)
	}
	k.entries["stale"] = "x"
	k.entries[keyringService+"/"+s.account()] = "{}"
	if err := s.Persist(&config.Object{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.Path); !os.IsNotExist(err) {
		t.Error("auth.json kept for empty credentials")
	}
	if _, ok := k.entries[keyringService+"/"+s.account()]; ok {
		t.Error("keyring entry kept for empty credentials")
	}
}

func TestAccountIsStablePerPath(t *testing.T) {
	a := &Store{Path: "/a/auth.json"}
	b := &Store{Path: "/b/auth.json"}
	if a.account() == b.account() || !strings.HasPrefix(a.account(), "cli:") || len(a.account()) != len("cli:")+16 {
		t.Errorf("accounts %q %q", a.account(), b.account())
	}
}
