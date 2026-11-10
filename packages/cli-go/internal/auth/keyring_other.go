//go:build !darwin

package auth

// The keyring is macOS-only. Elsewhere it is "unavailable", so "auto"
// falls back to auth.json.
var systemKeyring keyring
