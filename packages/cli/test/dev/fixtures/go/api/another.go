package another

import (
	"fmt"
	"net/http"
)

func HandlerAnother(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "This is another page")
}
