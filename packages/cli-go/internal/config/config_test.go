package config

import "testing"

func TestSetDoesNotEscapeHTML(t *testing.T) {
	o := &Object{}
	o.Set("url", "https://example.com/?a=1&b=<2>")
	raw, _ := o.Raw("url")
	if string(raw) != `"https://example.com/?a=1&b=<2>"` {
		t.Errorf("raw %s", raw)
	}
}
