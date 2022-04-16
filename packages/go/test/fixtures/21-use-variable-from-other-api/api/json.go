package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

func Json(w http.ResponseWriter, r *http.Request) {

	var obj = &Circle{Radius: 2.22}

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	resp := make(map[string]string)
	resp["message"] = "Hello World from Go"
	resp["language"] = "go"
	resp["cloud"] = "Hosted on Vercel==="
	resp["circle"] = strconv.FormatFloat(obj.Radius, 'f', 5, 64)
	jsonResp, err := json.Marshal(resp)
	if err != nil {
		fmt.Println("Error happened in JSON marshal. Err: %s", err)
	} else {
		w.Write(jsonResp)
	}
}
