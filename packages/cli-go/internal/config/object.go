// Package config reads and writes config.json and auth.json, keeping
// unknown keys and key order.
package config

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// Object is a JSON object that keeps key order and raw values.
type Object struct {
	keys   []string
	values map[string]json.RawMessage
}

func (o *Object) UnmarshalJSON(data []byte) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	if t, err := d.Token(); err != nil || t != json.Delim('{') {
		return fmt.Errorf("expected a JSON object")
	}
	o.keys, o.values = nil, map[string]json.RawMessage{}
	for d.More() {
		t, err := d.Token()
		if err != nil {
			return err
		}
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return err
		}
		o.SetRaw(t.(string), raw)
	}
	_, err := d.Token()
	return err
}

func (o Object) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			b.WriteByte(',')
		}
		key, _ := json.Marshal(k)
		b.Write(key)
		b.WriteByte(':')
		b.Write(o.values[k])
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// SetRaw keeps an existing key's position.
func (o *Object) SetRaw(key string, value json.RawMessage) {
	if o.values == nil {
		o.values = map[string]json.RawMessage{}
	}
	if _, ok := o.values[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

// Set stores value as JSON.stringify would encode it.
func (o *Object) Set(key string, value any) { o.SetRaw(key, Stringify(value, "")) }

func (o *Object) Delete(key string) {
	if _, ok := o.values[key]; !ok {
		return
	}
	delete(o.values, key)
	for i, k := range o.keys {
		if k == key {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			return
		}
	}
}

func (o *Object) Has(key string) bool {
	_, ok := o.values[key]
	return ok
}

func (o *Object) String(key string) (string, bool) {
	var s string
	if raw, ok := o.values[key]; ok && json.Unmarshal(raw, &s) == nil {
		return s, true
	}
	return "", false
}

func (o *Object) Number(key string) (float64, bool) {
	var n float64
	if raw, ok := o.values[key]; ok && json.Unmarshal(raw, &n) == nil {
		return n, true
	}
	return 0, false
}

func (o *Object) Keys() []string { return append([]string{}, o.keys...) }

func (o *Object) Raw(key string) (json.RawMessage, bool) {
	raw, ok := o.values[key]
	return raw, ok
}
