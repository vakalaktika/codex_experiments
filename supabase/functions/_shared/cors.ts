/**
 * CORS for the edge functions.
 *
 * The allow list is explicit rather than `*` because these functions spend the
 * project's Anthropic quota and GitHub rate limit. `*` would let any page on
 * the internet drive them with a stolen JWT.
 *
 * Note the GitHub Pages origin has no path — every site published under that
 * account shares it. That is a known consequence of hosting in a shared repo
 * and is called out in docs/ARCHITECTURE.md §6a.
 */

const DEFAULT_ORIGINS = [
  'https://vakalaktika.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
  if (!configured) return DEFAULT_ORIGINS
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = allowedOrigins().includes(origin)

  return {
    // Echoing only a matched origin keeps the header honest; an unmatched
    // origin gets no ACAO at all and the browser blocks the response.
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export function json(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

export function fail(request: Request, message: string, status: number): Response {
  return json(request, { error: message }, status)
}
