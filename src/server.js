import http from 'http';
import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function proxifyUrl(targetUrl) {
  return `/proxy?url=${encodeURIComponent(targetUrl.toString())}`;
}

function rewriteHtml(html, targetUrl) {
  const proxifyCandidate = (value) => {
    if (!value) return value;
    const trimmed = value.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) {
      return value;
    }

    try {
      const resolved = new URL(trimmed, targetUrl);
      return proxifyUrl(resolved);
    } catch (error) {
      return value;
    }
  };

  const attributePattern = /(href|src|action|poster|data)=("|')([^"']*)(\2)/gi;
  const rewrittenAttributes = html.replace(attributePattern, (match, attr, quote, value) => {
    const proxied = proxifyCandidate(value);
    return `${attr}=${quote}${proxied}${quote}`;
  });

  const srcsetPattern = /srcset=("|')([^"']*)(\1)/gi;
  let rewritten = rewrittenAttributes.replace(srcsetPattern, (match, quote, value) => {
    const candidates = value
      .split(',')
      .map(entry => {
        const trimmed = entry.trim();
        if (!trimmed) return trimmed;
        const parts = trimmed.split(/\s+/);
        const candidateUrl = parts.shift();
        const descriptor = parts.join(' ');
        const proxied = proxifyCandidate(candidateUrl);
        return descriptor ? `${proxied} ${descriptor}` : proxied;
      })
      .join(', ');

    return `srcset=${quote}${candidates}${quote}`;
  });

  rewritten = rewritten.replace(/<base[^>]*>/gi, '');
  if (/<head[^>]*>/i.test(rewritten)) {
    rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${targetUrl.origin}/">`);
  } else {
    rewritten = `<base href="${targetUrl.origin}/">${rewritten}`;
  }

  return rewritten;
}

function buildForwardHeaders(sourceHeaders, targetUrl) {
  const headers = {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    if (key === 'host' || key === 'content-length') continue;
    if (Array.isArray(value)) {
      headers[key] = value.join(',');
    } else if (value !== undefined) {
      headers[key] = value;
    }
  }

  headers['host'] = targetUrl.host;
  headers['origin'] = targetUrl.origin;
  headers['referer'] = targetUrl.href;
  headers['accept-encoding'] = 'identity';
  return headers;
}

function copyResponseHeaders(fetchResponse, res) {
  const rawHeaders = fetchResponse.headers;
  let setCookie;
  if (typeof rawHeaders.getSetCookie === 'function') {
    setCookie = rawHeaders.getSetCookie();
  } else if (typeof rawHeaders.raw === 'function') {
    const raw = rawHeaders.raw();
    setCookie = raw['set-cookie'];
  }
  if (setCookie && setCookie.length) {
    res.setHeader('set-cookie', setCookie);
  }

  for (const [key, value] of rawHeaders.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    if (key === 'set-cookie' || key === 'content-length') continue;
    res.setHeader(key, value);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

async function proxyRequest(req, res, requestUrl) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    });
    res.end();
    return;
  }

  const rawUrl = requestUrl.searchParams.get('url');
  if (!rawUrl) {
    sendJson(res, 400, { error: 'Missing url query parameter' });
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
    if (!/^https?:$/i.test(targetUrl.protocol)) {
      throw new Error('Only http(s) protocols are supported');
    }
  } catch (error) {
    sendJson(res, 400, { error: 'Invalid URL supplied', message: error.message });
    return;
  }

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const init = {
    method: req.method,
    headers: buildForwardHeaders(req.headers, targetUrl),
    signal: controller.signal
  };

  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = req;
    init.duplex = 'half';
  }

  let response;
  try {
    response = await fetch(targetUrl, init);
  } catch (error) {
    sendJson(res, 502, { error: 'Failed to reach upstream', message: error.message });
    return;
  }

  const contentType = response.headers.get('content-type') || '';
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  copyResponseHeaders(response, res);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('x-proxied-by', 'chatprox');
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  if (contentType.includes('text/html')) {
    const html = await response.text();
    const rewritten = rewriteHtml(html, targetUrl);
    res.setHeader('content-type', contentType);
    res.end(rewritten);
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  if (contentType) {
    res.setHeader('content-type', contentType);
  }
  res.end(Buffer.from(arrayBuffer));
}

async function serveStatic(req, res, requestUrl) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname.endsWith('/')) {
    pathname = pathname + 'index.html';
  }
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      throw new Error('Is directory');
    }
  } catch (error) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.setHeader('content-type', contentType);
  res.setHeader('content-length', fileStat.size);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(filePath);
  await pipeline(stream, res);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname === '/proxy') {
      await proxyRequest(req, res, requestUrl);
      return;
    }

    await serveStatic(req, res, requestUrl);
  } catch (error) {
    console.error('Server error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`chatprox listening on http://localhost:${PORT}`);
});
