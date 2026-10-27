package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"

	"github.com/vercel/vercel/packages/cli-go/internal/config"
)

// Storage is credentials-store.ts's mode; "auto" is the keyring when
// available, else auth.json.
type Storage string

const (
	File    Storage = "file"
	Keyring Storage = "keyring"
	Auto    Storage = "auto"
)

const (
	keyringService     = "com.vercel.vercel-cli"
	keyringUnavailable = "OS keyring support is unavailable. Set `credStorage` to `auto` or `file` to store credentials in auth.json instead."
)

// keyring entries match the TypeScript CLI's: same service and account.
type keyring interface {
	get(service, account string) (string, error)
	set(service, account, secret string) error
	delete(service, account string) error
}

var errKeyringNotFound = errors.New("keyring entry not found")

var ErrNotFound = errors.New("no stored credentials")

type Store struct {
	Path    string // auth.json
	Storage Storage
	Getenv  func(string) string
	keyring keyring
}

// Open reads the mode from credStorage, then $VERCEL_TOKEN_STORAGE, else
// "file".
func Open(dir string, global *config.Object, lookup func(string) (string, bool)) (*Store, error) {
	s := &Store{Path: config.AuthFile(dir), Storage: File, keyring: systemKeyring,
		Getenv: func(k string) string { v, _ := lookup(k); return v }}
	raw, ok := global.Raw("credStorage")
	source := "credStorage"
	if !ok {
		if v, ok := lookup("VERCEL_TOKEN_STORAGE"); ok {
			raw, _ = json.Marshal(v)
			source = "VERCEL_TOKEN_STORAGE"
		}
	}
	if raw != nil {
		var v string
		_ = json.Unmarshal(raw, &v)
		switch s.Storage = Storage(v); s.Storage {
		case File, Keyring, Auto:
		default:
			return nil, config.CredStorageError(raw, source)
		}
	}
	return s, nil
}

// Read migrates between auth.json and the keyring as upstream does.
func (s *Store) Read() (*config.Object, error) {
	switch s.Storage {
	case Keyring:
		creds, err := s.readKeyring()
		if err != nil || creds != nil {
			return creds, err
		}
		file, err := s.readFile()
		if err != nil {
			return nil, err
		}
		if err := s.writeKeyring(file); err != nil {
			return nil, err
		}
		os.Remove(s.Path)
		return file, nil
	case Auto:
		if creds, err := s.readKeyring(); err == nil && creds != nil {
			return creds, nil
		}
		return s.readFile()
	}
	file, err := s.readFile()
	if err == nil && usable(file) {
		return file, nil
	}
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	// A login left in the keyring by another mode moves to auth.json.
	if creds, kerr := s.readKeyring(); kerr == nil && creds != nil && config.WriteAuth(s.Path, creds) == nil {
		s.deleteKeyring()
		return creds, nil
	}
	return file, err
}

// Persist is persistCliAuthConfig: it saves to the mode's storage and
// removes the other copy, or removes both when nothing is usable.
func (s *Store) Persist(creds *config.Object) error {
	if !usable(creds) {
		fileErr := os.Remove(s.Path)
		if errors.Is(fileErr, fs.ErrNotExist) {
			fileErr = nil
		}
		if s.available() == nil {
			if err := s.keyring.delete(keyringService, s.account()); err != nil {
				return err
			}
		}
		return fileErr
	}
	switch s.Storage {
	case Keyring:
		if err := s.writeKeyring(creds); err != nil {
			return err
		}
		os.Remove(s.Path)
		return nil
	case Auto:
		if s.writeKeyring(creds) == nil {
			os.Remove(s.Path)
			return nil
		}
		s.deleteKeyring()
	}
	if err := config.WriteAuth(s.Path, creds); err != nil {
		return err
	}
	s.deleteKeyring()
	return nil
}

func (s *Store) readFile() (*config.Object, error) {
	file, err := config.ReadAuth(s.Path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotFound
	}
	return file, err
}

// usable is authConfigHasUsableTokenData.
func usable(o *config.Object) bool {
	token, _ := o.String("token")
	refresh, _ := o.String("refreshToken")
	return token != "" || refresh != ""
}

// account is upstream's keyring account for auth.json's path.
func (s *Store) account() string {
	sum := sha256.Sum256([]byte(s.Path))
	return "cli:" + hex.EncodeToString(sum[:])[:16]
}

func (s *Store) available() error {
	if s.Getenv("VERCEL_TEST_KEYRING_UNAVAILABLE") == "1" || s.keyring == nil {
		return errors.New(keyringUnavailable)
	}
	return nil
}

func (s *Store) readKeyring() (*config.Object, error) {
	if err := s.available(); err != nil {
		return nil, err
	}
	secret, err := s.keyring.get(keyringService, s.account())
	if errors.Is(err, errKeyringNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.New(keyringUnavailable)
	}
	return config.ParseAuth([]byte(secret))
}

func (s *Store) writeKeyring(creds *config.Object) error {
	if err := s.available(); err != nil {
		return err
	}
	raw, err := json.Marshal(creds)
	if err != nil {
		return err
	}
	if s.keyring.set(keyringService, s.account(), string(raw)) != nil {
		return errors.New(keyringUnavailable)
	}
	return nil
}

func (s *Store) deleteKeyring() {
	if s.available() == nil {
		_ = s.keyring.delete(keyringService, s.account())
	}
}
