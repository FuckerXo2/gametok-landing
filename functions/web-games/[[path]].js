// Cloudflare Pages Function: /web-games/*
// Serves web games directly from Cloudflare R2 bucket with edge caching & CORS

const MIME_TYPES = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  wasm: 'application/wasm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  bin: 'application/octet-stream',
};

async function hmacSha256(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? enc.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, typeof message === 'string' ? enc.encode(message) : message);
}

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    typeof data === 'string' ? new TextEncoder().encode(data) : data
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function onRequest(context) {
  const { request, env, params } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawPath = Array.isArray(params.path)
    ? params.path.join('/')
    : params.path || '';

  let subpath = rawPath.replace(/^\/+/, '');
  if (!subpath || subpath.endsWith('/')) {
    subpath += 'index.html';
  } else if (!subpath.includes('.') && !subpath.endsWith('/')) {
    // If accessing directory without trailing slash, redirect with slash
    const url = new URL(request.url);
    url.pathname += '/';
    return Response.redirect(url.toString(), 301);
  }

  const key = `web-games/${subpath}`;

  // If Cloudflare Pages R2 bucket binding is configured:
  if (env && env.BUCKET && typeof env.BUCKET.get === 'function') {
    try {
      const obj = await env.BUCKET.get(key);
      if (obj) {
        const ext = subpath.split('.').pop().toLowerCase();
        const contentType = MIME_TYPES[ext] || obj.httpMetadata?.contentType || 'application/octet-stream';
        const isEntry = subpath.endsWith('index.html');
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', isEntry ? 'no-cache, max-age=0' : 'public, max-age=31536000, immutable');
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(obj.body, { status: 200, headers });
      }
    } catch (_) {}
  }

  // AWS SigV4 signed request to Cloudflare R2 S3 API
  const accountId = env?.R2_ACCOUNT_ID || 'acb5def369b69f492571d42e56057f1a';
  const accessKey = env?.R2_ACCESS_KEY_ID || 'a2137da1ab5f265000da1ccadc54e291';
  const secretKey = env?.R2_SECRET_ACCESS_KEY || '315076dc7536923a28bc62a21da5574b73270302811792dd6fc5b5f27bf32ad8';
  const bucket = env?.R2_BUCKET_NAME || 'gametok-games-assets';

  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = '/' + key.split('/').map(encodeURIComponent).join('/');
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const rangeHeader = request.headers.get('Range');
  let canonicalHeaders = '';
  let signedHeaders = '';

  if (rangeHeader) {
    canonicalHeaders = `host:${host}\nrange:${rangeHeader}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    signedHeaders = 'host;range;x-amz-content-sha256;x-amz-date';
  } else {
    canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  }

  const canonicalRequest = `${request.method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const kDate = await hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await bufferToHex(await hmacSha256(kSigning, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const forwardHeaders = {
    Host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: authHeader,
  };
  if (rangeHeader) {
    forwardHeaders.Range = rangeHeader;
  }

  try {
    const upstreamRes = await fetch(`https://${host}${canonicalUri}`, {
      method: request.method,
      headers: forwardHeaders,
    });

    if (!upstreamRes.ok) {
      if (upstreamRes.status === 404) {
        return new Response(`File not found: ${subpath}`, { status: 404 });
      }
      return new Response(`Upstream error: ${upstreamRes.status}`, { status: upstreamRes.status });
    }

    const ext = subpath.split('.').pop().toLowerCase();
    const contentType = MIME_TYPES[ext] || upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const isEntry = subpath.endsWith('index.html');

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Cache-Control', isEntry ? 'no-cache, max-age=0' : 'public, max-age=31536000, immutable');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');

    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    const contentRange = upstreamRes.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);

    const acceptRanges = upstreamRes.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  } catch (err) {
    return new Response(`Error proxying game asset: ${err.message}`, { status: 502 });
  }
}
