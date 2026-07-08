package aternos

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	aternos_api "github.com/sleeyax/aternos-api"
)

func NewClient() (*aternos_api.Api, error) {
	cookieStr := os.Getenv("ATERNOS_COOKIES")
	if cookieStr == "" {
		return nil, fmt.Errorf("ATERNOS_COOKIES environment variable is required")
	}

	cookies := parseCookies(cookieStr)

	opts := &aternos_api.Options{
		Cookies: cookies,
	}

	return aternos_api.New(opts), nil
}

func parseCookies(cookieStr string) []*http.Cookie {
	var cookies []*http.Cookie
	pairs := strings.Split(cookieStr, "; ")
	for _, pair := range pairs {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		idx := strings.Index(pair, "=")
		if idx == -1 {
			continue
		}
		cookies = append(cookies, &http.Cookie{
			Name:  pair[:idx],
			Value: pair[idx+1:],
		})
	}
	return cookies
}
