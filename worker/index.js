export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const target = new URL('https://aternos.org' + url.pathname + url.search)
    const headers = new Headers(request.headers)

    headers.set('Host', 'aternos.org')
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    headers.set('Accept', '*/*')
    headers.set('Accept-Language', 'en-US,en;q=0.9')
    headers.set('Accept-Encoding', 'gzip, deflate, br, zstd')
    headers.set('Referer', 'https://aternos.org/')
    headers.set('Origin', 'https://aternos.org')

    const clientHeaders = ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
      'sec-ch-ua-platform-version', 'sec-ch-ua-arch', 'sec-ch-ua-bitness',
      'sec-ch-ua-full-version', 'sec-ch-ua-full-version-list', 'sec-ch-ua-model',
      'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'priority']
    for (const h of clientHeaders) {
      const v = request.headers.get(h)
      if (v) headers.set(h, v)
    }

    const resp = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'follow',
    })

    const text = await resp.text()
    const snippet = text.substring(0, 300)

    const respHeaders = new Headers(resp.headers)
    respHeaders.set('Access-Control-Allow-Origin', '*')
    respHeaders.set('X-Debug-Status', String(resp.status))
    respHeaders.set('X-Debug-Length', String(text.length))
    respHeaders.set('X-Debug-Snippet', snippet.replace(/\n/g, ' ').substring(0, 200))

    return new Response(text, {
      status: resp.status,
      headers: respHeaders,
    })
  },
}
