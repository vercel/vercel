package auth

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// macKeychain sends commands on stdin with the secret hex-encoded, so it
// never appears in process arguments.
type macKeychain struct{}

var systemKeyring keyring = macKeychain{}

const errSecItemNotFound = 44

func (macKeychain) get(service, account string) (string, error) {
	cmd := exec.Command("/usr/bin/security", "find-generic-password", "-s", service, "-a", account, "-w")
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == errSecItemNotFound {
		return "", errKeyringNotFound
	}
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(out.String(), "\n"), nil
}

func (macKeychain) set(service, account, secret string) error {
	script := fmt.Sprintf("add-generic-password -U -s %s -a %s -X %s\n", service, account, hex.EncodeToString([]byte(secret)))
	cmd := exec.Command("/usr/bin/security", "-i")
	cmd.Stdin = strings.NewReader(script)
	return cmd.Run()
}

func (macKeychain) delete(service, account string) error {
	err := exec.Command("/usr/bin/security", "delete-generic-password", "-s", service, "-a", account).Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == errSecItemNotFound {
		return nil
	}
	return err
}
