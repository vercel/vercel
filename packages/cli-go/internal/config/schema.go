package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// The zod schemas of cli-config/src/schema.zod.ts, in key order, which is
// the order zod reports issues in.

type field struct {
	name     string
	expected string // "string", "boolean", "number" or "object"
	nested   []field
}

var globalSchema = []field{
	{name: "// Note", expected: "string"},
	{name: "// Docs", expected: "string"},
	{name: "credStorage", expected: "credStorage"},
	{name: "currentTeam", expected: "string"},
	{name: "api", expected: "string"},
	{name: "telemetry", expected: "object", nested: []field{{name: "enabled", expected: "boolean"}}},
	{name: "guidance", expected: "object", nested: []field{{name: "enabled", expected: "boolean"}}},
	{name: "updates", expected: "object", nested: []field{{name: "auto", expected: "boolean"}, {name: "bypassMinReleaseAge", expected: "boolean"}}},
	{name: "useNativeBinary", expected: "boolean"},
	{name: "nativeBinaryAutoOptIn", expected: "boolean"},
}

var authSchema = []field{
	{name: "// Note", expected: "string"},
	{name: "// Docs", expected: "string"},
	{name: "skipWrite", expected: "boolean"},
	{name: "token", expected: "string"},
	{name: "userId", expected: "string"},
	{name: "refreshToken", expected: "string"},
	{name: "expiresAt", expected: "number"},
}

type issue struct {
	Expected string   `json:"expected"`
	Code     string   `json:"code"`
	Path     []string `json:"path"`
	Message  string   `json:"message"`
}

func ValidateGlobal(raw []byte) error { return validate(raw, globalSchema) }

func ValidateAuth(raw []byte) error { return validate(raw, authSchema) }

func CredStorageError(value json.RawMessage, source string) error {
	return fmt.Errorf("Invalid value for `%s`: %s. Expected one of: \"auto\", \"file\", \"keyring\".", source, compact(value))
}

func validate(raw []byte, schema []field) error {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(raw, &root); err != nil || root == nil {
		return issues([]issue{{Expected: "object", Code: "invalid_type", Path: []string{}, Message: "Invalid input"}})
	}
	var found []issue
	check(root, schema, nil, &found)
	// A credStorage issue is reported alone, with its own message.
	for _, i := range found {
		if len(i.Path) == 1 && i.Path[0] == "credStorage" {
			return CredStorageError(root["credStorage"], "credStorage")
		}
	}
	if len(found) > 0 {
		return issues(found)
	}
	return nil
}

func check(obj map[string]json.RawMessage, schema []field, path []string, found *[]issue) {
	for _, f := range schema {
		value, ok := obj[f.name]
		if !ok {
			continue
		}
		p := append(append([]string{}, path...), f.name)
		if f.expected == "credStorage" {
			var s string
			if json.Unmarshal(value, &s) != nil || (s != "auto" && s != "file" && s != "keyring") {
				*found = append(*found, issue{Code: "invalid_value", Path: p})
			}
			continue
		}
		if !isType(value, f.expected) {
			*found = append(*found, issue{Expected: f.expected, Code: "invalid_type", Path: p, Message: "Invalid input"})
			continue
		}
		if f.nested != nil {
			var nested map[string]json.RawMessage
			_ = json.Unmarshal(value, &nested)
			check(nested, f.nested, p, found)
		}
	}
}

func isType(v json.RawMessage, expected string) bool {
	s := strings.TrimSpace(string(v))
	switch expected {
	case "string":
		return strings.HasPrefix(s, `"`)
	case "boolean":
		return s == "true" || s == "false"
	case "number":
		return s != "" && (s[0] == '-' || (s[0] >= '0' && s[0] <= '9'))
	case "object":
		return strings.HasPrefix(s, "{")
	}
	return false
}

// issues is zod's error message: JSON.stringify(issues, null, 2).
func issues(list []issue) error { return fmt.Errorf("%s", Stringify(list, "  ")) }

func compact(v json.RawMessage) string {
	var b bytes.Buffer
	if json.Compact(&b, v) == nil {
		return b.String()
	}
	return string(v)
}

// canonical is zod's key order: schema keys first, then unknown keys.
func canonical(o *Object, schema []field) *Object {
	out := &Object{}
	for _, f := range schema {
		raw, ok := o.Raw(f.name)
		if !ok {
			continue
		}
		if f.nested != nil {
			nested := &Object{}
			if json.Unmarshal(raw, nested) == nil {
				raw, _ = json.Marshal(canonical(nested, f.nested))
			}
		}
		out.SetRaw(f.name, raw)
	}
	for _, k := range o.Keys() {
		if !out.Has(k) {
			raw, _ := o.Raw(k)
			out.SetRaw(k, raw)
		}
	}
	return out
}
