# chatprox
# ChatProx

ChatProx is a lightweight, self-hosted web proxy inspired by [Ultraviolet](https://github.com/titaniumnetwork-dev/Ultraviolet). It rewrites HTML responses so that navigation stays within the proxy, enabling quick previews of sites from a single interface.

> **Note:** This proxy is intended for educational and personal use. Respect target sites' terms of service.

## Features

- ✨ Single-page interface with a built-in viewer
- 🔁 HTML rewriting that keeps links, forms, and media routed through the proxy
- 🛡️ CORS headers that allow the proxied content to load within the embedded iframe
- 🚀 Runs on the Node.js standard library—no third-party dependencies required

## Getting started

1. Install dependencies (optional for Node.js >= 18, which ships with `fetch`):

   ```bash
   npm install
   ```

2. Start the server (Node.js 18+ recommended):

   ```bash
   npm start
   ```

3. Visit `http://localhost:3000` and enter any `http://` or `https://` URL to launch it through the proxy.

## Project structure

```
.
├── public
│   ├── index.html     # User interface
│   ├── script.js      # Front-end logic for launching proxied sessions
│   └── styles.css     # Styling for the landing page and viewer
├── src
│   └── server.js      # HTTP server implementing the proxy logic
├── package.json
└── README.md
```

## How it works

The `/proxy` endpoint forwards requests to the requested origin with the original headers (minus hop-by-hop headers). When responses contain HTML, ChatProx rewrites key attributes—`href`, `src`, `action`, `poster`, `data`, and `srcset`—so any subsequent navigation or resource loading continues through `/proxy`.

Binary and non-HTML content is streamed back without modification, and permissive CORS headers allow the proxied content to render inside the iframe viewer.

## Limitations

- Sites with complex Content Security Policies, service workers, or WebSockets may not function correctly.
- Authentication flows that rely on cross-origin cookies or popups are likely to fail.
- Streaming media and very large downloads are proxied but not aggressively optimized.

Feel free to fork and expand ChatProx to suit your needs!

## Deploying to Render

Render runs a build command before each deploy. If the command is simply `npm`,
the build fails with the "`npm <command>`" usage message. Ensure your service's
build command is `npm install` and the start command is `npm start`.

The included `render.yaml` automates this configuration. Commit it to your
repository before connecting to Render, or trigger a new deploy after adding it.
Render will detect the file and apply the configuration:

```yaml
services:
  - type: web
    env: node
    buildCommand: npm install
    startCommand: npm start
```

With the correct commands in place, Render will install dependencies and boot
the proxy server successfully.
