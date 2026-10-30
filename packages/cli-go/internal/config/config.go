package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const docsURL = "https://vercel.com/docs/projects/project-configuration/global-configuration"

func DefaultGlobal() *Object {
	o := &Object{}
	o.Set("// Note", "This is your Vercel config file. For more information see the global configuration documentation.")
	o.Set("// Docs", docsURL+"#config.json")
	return o
}

func DefaultAuth() *Object {
	o := &Object{}
	o.Set("// Note", "This is your Vercel credentials file. DO NOT SHARE!")
	o.Set("// Docs", docsURL+"#auth.json")
	return o
}

func GlobalFile(dir string) string { return filepath.Join(dir, "config.json") }
func AuthFile(dir string) string   { return filepath.Join(dir, "auth.json") }

func ReadGlobal(path string) (*Object, error) { return read(path, ValidateGlobal) }

func ReadAuth(path string) (*Object, error) { return read(path, ValidateAuth) }

// ParseAuth parses credentials from the keyring.
func ParseAuth(data []byte) (*Object, error) { return parse(data, ValidateAuth) }

// read ignores a byte-order mark, as cli-config does.
func read(path string, validate func([]byte) error) (*Object, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parse(bytes.TrimPrefix(data, []byte("\ufeff")), validate)
}

func parse(data []byte, validate func([]byte) error) (*Object, error) {
	if !json.Valid(data) {
		o := &Object{}
		return nil, json.Unmarshal(data, o)
	}
	if validate != nil {
		if err := validate(data); err != nil {
			return nil, err
		}
	}
	o := &Object{}
	if err := json.Unmarshal(data, o); err != nil {
		return nil, err
	}
	return o, nil
}

// ReadStrict is JSON.parse: a byte-order mark is an error.
func ReadStrict(path string) (*Object, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parse(data, nil)
}

func WriteGlobal(path string, o *Object) error {
	return Write(path, canonical(o, globalSchema), 0o644)
}

func WriteAuth(path string, o *Object) error {
	return Write(path, canonical(o, authSchema), 0o600)
}

func Write(path string, o *Object, mode os.FileMode) error {
	var b bytes.Buffer
	raw, err := json.Marshal(o)
	if err != nil {
		return err
	}
	if err := json.Indent(&b, raw, "", "  "); err != nil {
		return err
	}
	b.WriteByte('\n')
	return WriteFile(path, b.Bytes(), mode)
}

// WriteFile replaces path atomically.
func WriteFile(path string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := filepath.Join(dir, fmt.Sprintf(".%s.%d.%d.tmp", filepath.Base(path), os.Getpid(), time.Now().UnixNano()))
	defer os.Remove(tmp)
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Stringify is JSON.stringify(v, null, indent).
func Stringify(v any, indent string) []byte {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", indent)
	_ = enc.Encode(v)
	return bytes.TrimSuffix(b.Bytes(), []byte("\n"))
}
