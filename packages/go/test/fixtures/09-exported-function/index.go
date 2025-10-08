package function

import (
	"fmt"
	"net/http"
)

// Person struct
type Person struct {
	name string
	age  int
}

// NewPerson struct method
func NewPerson(name string, age int) *Person {
	return &Person{name: name, age: age}
}

// H func
func H(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "RANDOMNESS_PLACEHOLDER")
}
