package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"aternos-api/aternos"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api")
	path = strings.TrimSuffix(path, "/")

	switch {
	case path == "" || path == "/":
		handleIndex(w, r)
	case path == "/login":
		handleLogin(w, r)
	case path == "/start":
		handleStart(w, r)
	case path == "/stop":
		handleStop(w, r)
	case path == "/status":
		handleStatus(w, r)
	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"name":    "aternos-api",
		"version": "1.0.0",
		"endpoints": map[string]string{
			"GET  /api":        "this info",
			"POST /api/login":  "login with username/password",
			"POST /api/start":  "start server",
			"POST /api/stop":   "stop server",
			"GET  /api/status": "server status",
		},
	})
}

func getClient(r *http.Request) (*aternos.Client, error) {
	session := r.Header.Get("X-Aternos-Session")
	serverID := r.Header.Get("X-Aternos-Server")

	if session != "" {
		return aternos.NewClientWithSession(session, serverID), nil
	}

	return aternos.NewClient()
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if body.Username == "" || body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username and password required"})
		return
	}

	client := aternos.NewClientWithSession("", "")

	session, err := client.Login(r.Context(), body.Username, body.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Auto-discover server IDs and set ATERNOS_SERVER cookie
	serverID := ""
	ids, err := client.ListServers()
	if err == nil && len(ids) > 0 {
		serverID = ids[0]
	} else {
		// Try to get server ID from header
		serverID = r.Header.Get("X-Aternos-Server")
	}

	resp := map[string]string{
		"status":  "ok",
		"session": session,
	}
	if serverID != "" {
		resp["server"] = serverID
	}

	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func handleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	client, err := getClient(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := client.StartServer(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "server start requested"})
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	client, err := getClient(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := client.StopServer(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "server stop requested"})
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	client, err := getClient(r)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	info, err := client.GetServerInfo()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, info)
}
