package other

import (
	"fmt"
	"net/http"
)

// "Handler" conflicts with the other files' exported function,
// but not in the same package
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "from other-package.go")
}
