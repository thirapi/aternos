package handler

import (
	"encoding/json"
	"net/http"
	"runtime"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"name":    "aternos-api",
		"version": "1.0.0",
		"go":      runtime.Version(),
		"endpoints": map[string]string{
			"GET  /api":      "this info",
			"POST /api/start": "start server",
			"POST /api/stop":  "stop server",
			"GET  /api/status": "server status",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}
