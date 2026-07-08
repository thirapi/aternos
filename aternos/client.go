package aternos

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/dop251/goja"
	utls "github.com/refraction-networking/utls"
	"golang.org/x/net/http2"
)

var (
	ErrAlreadyStarted  = errors.New("server already started")
	ErrAlreadyStopped  = errors.New("server already stopped")
	ErrUnauthenticated = errors.New("unauthenticated (invalid account)")
	ErrForbidden       = errors.New("forbidden (blocked by Cloudflare)")
)

type ServerStatus int

const (
	Offline   ServerStatus = 0
	Online    ServerStatus = 1
	Preparing ServerStatus = 10
	Starting  ServerStatus = 2
	Stopping  ServerStatus = 3
	Saving    ServerStatus = 5
	Loading   ServerStatus = 6
)

type Queue struct {
	Number     int     `json:"queue"`
	Position   int     `json:"position"`
	Count      int     `json:"count"`
	Percentage float32 `json:"percentage"`
	Status     string  `json:"pending"`
	Time       string  `json:"time"`
	Minutes    int     `json:"minutes"`
	Jointime   int     `json:"jointime"`
}

type ServerInfo struct {
	Brand                string       `json:"brand"`
	Status               ServerStatus `json:"status"`
	LastChanged          int          `json:"change"`
	MaxPlayers           int          `json:"slots"`
	Problems             int          `json:"problems"`
	Players              int          `json:"players"`
	PlayerList           []string     `json:"playerlist"`
	DynIP                string       `json:"dynip"`
	IsBedrock            bool         `json:"bedrock"`
	Host                 string       `json:"host"`
	Port                 int          `json:"port"`
	HeadStarts           int          `json:"headstarts"`
	RAM                  int          `json:"ram"`
	StatusLabel          string       `json:"lang"`
	StatusLabelFormatted string       `json:"label"`
	StatusLabelClass     string       `json:"class"`
	Countdown            int          `json:"countdown"`
	Queue                Queue        `json:"queue"`
	Id                   string       `json:"id"`
	Name                 string       `json:"name"`
	Software             string       `json:"software"`
	SoftwareId           string       `json:"softwareId"`
	SoftwareType         string       `json:"type"`
	Version              string       `json:"version"`
	IsDeprecated         bool         `json:"deprecated"`
	IP                   string       `json:"ip"`
	Address              string       `json:"displayAddress"`
	MOTD                 string       `json:"motd"`
	Icon                 string       `json:"icon"`
}

type Client struct {
	http    *http.Client
	baseURL string
	sec     string
	token   string
}

var defaultBaseURL = "https://aternos.org/"

func NewClient() (*Client, error) {
	cookieStr := os.Getenv("ATERNOS_COOKIES")
	if cookieStr == "" {
		return nil, errors.New("ATERNOS_COOKIES environment variable is required")
	}

	baseURL := os.Getenv("ATERNOS_BASE_URL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/") + "/"

	jar, _ := cookiejar.New(nil)
	u, _ := url.Parse(baseURL)
	jar.SetCookies(u, parseCookies(cookieStr))

	tr := &http2.Transport{
		IdleConnTimeout: 90 * time.Second,
		ReadIdleTimeout: 10 * time.Second,
		PingTimeout:     5 * time.Second,
		DialTLSContext: func(ctx context.Context, network, addr string, cfg *tls.Config) (net.Conn, error) {
			rawConn, err := net.Dial(network, addr)
			if err != nil {
				return nil, err
			}
			uconn := utls.UClient(rawConn, &utls.Config{
				ServerName:         cfg.ServerName,
				NextProtos:         cfg.NextProtos,
				InsecureSkipVerify: cfg.InsecureSkipVerify,
			}, utls.HelloChrome_120)
			if err := uconn.HandshakeContext(ctx); err != nil {
				rawConn.Close()
				return nil, err
			}
			return uconn, nil
		},
	}

	client := &http.Client{
		Transport: tr,
		Jar:       jar,
		Timeout:   30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 3 {
				return errors.New("too many redirects")
			}
			if strings.Contains(req.URL.String(), "go") {
				return ErrUnauthenticated
			}
			return nil
		},
	}

	return &Client{http: client, baseURL: baseURL}, nil
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

func (c *Client) newRequest(path string) (*http.Request, error) {
	req, err := http.NewRequest("GET", c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "gzip, deflate, br, zstd")
	req.Header.Set("Sec-CH-UA", `"Chromium";v="120", "Google Chrome";v="120", "Not?A_Brand";v="99"`)
	req.Header.Set("Sec-CH-UA-Mobile", "?0")
	req.Header.Set("Sec-CH-UA-Platform", `"Windows"`)
	req.Header.Set("Sec-CH-UA-Platform-Version", `"15.0.0"`)
	req.Header.Set("Sec-CH-UA-Arch", `"x86"`)
	req.Header.Set("Sec-CH-UA-Bitness", `"64"`)
	req.Header.Set("Sec-CH-UA-Full-Version", `"120.0.6099.109"`)
	req.Header.Set("Sec-CH-UA-Full-Version-List", `"Chromium";v="120.0.6099.109", "Google Chrome";v="120.0.6099.109", "Not?A_Brand";v="99.0.0.0"`)
	req.Header.Set("Sec-CH-UA-Model", `""`)
	req.Header.Set("Sec-Fetch-Dest", "empty")
	req.Header.Set("Sec-Fetch-Mode", "cors")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Set("Priority", "u=1, i")
	return req, nil
}

func (c *Client) getDocument(path string) (*goquery.Document, error) {
	req, err := c.newRequest(path)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusForbidden {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("%w: proto=%s status=403 headers=%v body=%q",
			ErrForbidden, res.Proto, res.Header, truncate(string(body), 500))
	}

	return goquery.NewDocumentFromReader(res.Body)
}

func (c *Client) getJSON(path string, v interface{}) error {
	req, err := c.newRequest(path)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusForbidden {
		body, _ := io.ReadAll(res.Body)
		return fmt.Errorf("%w: proto=%s status=403 headers=%v body=%q",
			ErrForbidden, res.Proto, res.Header, truncate(string(body), 500))
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}

	return json.Unmarshal(body, v)
}

func (c *Client) genSec() {
	key := randomString(11) + "00000"
	value := randomString(11) + "00000"
	c.sec = fmt.Sprintf("%s:%s", key, value)

	u, _ := url.Parse(c.baseURL)
	c.http.Jar.SetCookies(u, []*http.Cookie{
		{Name: "ATERNOS_SEC_" + key, Value: value},
	})
}

func (c *Client) extractAjaxToken(doc *goquery.Document) error {
	var script string
	doc.Find("script[type='text/javascript']").EachWithBreak(func(i int, s *goquery.Selection) bool {
		script = strings.TrimSpace(s.Text())
		return !strings.Contains(script, "window")
	})
	if script == "" {
		return errors.New("failed to find token script")
	}

	vm := goja.New()
	if err := vm.Set("atob", atob); err != nil {
		return err
	}

	window := "{document: {}, setTimeout: (f, t) => {}, setInterval: (f, i) => {}, clearTimeout: (f) => {}, clearInterval: (f) => {}, Map: () => {}}"
	exec := fmt.Sprintf("window = %s; %s window['AJAX_TOKEN'];", window, script)

	v, err := vm.RunString(exec)
	if err != nil {
		return err
	}

	c.token = v.String()
	return nil
}

func (c *Client) GetServerInfo() (ServerInfo, error) {
	doc, err := c.getDocument("server")
	if err != nil {
		return ServerInfo{}, err
	}

	html, _ := doc.Html()

	var script string
	doc.Find("script:not([src])").EachWithBreak(func(i int, s *goquery.Selection) bool {
		script = strings.TrimSpace(s.Text())
		return !strings.HasPrefix(script, "var lastStatus =")
	})
	if script == "" {
		return ServerInfo{}, fmt.Errorf("failed to find server info in page: page=%q", truncate(html, 1000))
	}

	data := strings.TrimSuffix(
		strings.Replace(script, "var lastStatus =", "", 1),
		";",
	)

	var info ServerInfo
	if err := json.Unmarshal([]byte(data), &info); err != nil {
		return ServerInfo{}, err
	}

	c.genSec()
	if err := c.extractAjaxToken(doc); err != nil {
		return ServerInfo{}, err
	}

	return info, nil
}

func (c *Client) StartServer() error {
	info, err := c.GetServerInfo()
	if err != nil {
		return err
	}
	if info.Status == Online {
		return ErrAlreadyStarted
	}

	path := fmt.Sprintf("ajax/server/start?headstart=false&access-credits=false&SEC=%s&TOKEN=%s", c.sec, c.token)
	var result map[string]interface{}
	if err := c.getJSON(path, &result); err != nil {
		return err
	}

	success, _ := result["success"].(bool)
	if !success {
		msg, _ := result["message"].(string)
		if msg == "" {
			msg = "Aternos failed to start the server"
		}
		return errors.New(msg)
	}

	return nil
}

func (c *Client) StopServer() error {
	info, err := c.GetServerInfo()
	if err != nil {
		return err
	}
	if info.Status == Offline {
		return ErrAlreadyStopped
	}

	path := fmt.Sprintf("ajax/server/stop?SEC=%s&TOKEN=%s", c.sec, c.token)
	var result map[string]interface{}
	return c.getJSON(path, &result)
}

func atob(s string) (string, error) {
	decoded, err := hex.DecodeString(s)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}

func randomString(length int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		result[i] = chars[n.Int64()]
	}
	return string(result)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
