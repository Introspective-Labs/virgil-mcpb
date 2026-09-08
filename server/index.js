#!/usr/bin/env node
//
// Virgil MCP stdio→HTTP shim.
//
// Claude Desktop can only SPAWN a command; Virgil's MCP server is HTTP on
// localhost. This bridges the two: every JSON-RPC line on stdin is POSTed to
// Virgil, and every response is written back as a line on stdout.
//
// ⚠️ NO DEPENDENCIES, EVER. The whole point of shipping this inside a .mcpb is
// that Claude Desktop runs it on its OWN bundled Node (server.type "node" with
// no `compatibility.runtimes.node` declared), so the user needs no runtime and
// no `npx` fetch. A single `require` of anything outside Node's core library
// would put us straight back to needing an install step — which is the bug
// this whole extension exists to kill (field report 2026-09-05).

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

// Virgil publishes its live port + token here. TWO paths because the App Store
// build is sandboxed and writes inside its container; the Sparkle build writes
// the plain path. Whichever exists, newest wins — a user may have run both.
const DISCOVERY_PATHS = [
  path.join(os.homedir(), 'Library/Application Support/Virgil/mcp.json'),
  path.join(os.homedir(),
            'Library/Containers/com.virgil.browser/Data/Library/Application Support/Virgil/mcp.json'),
]

// Who Claude Desktop said it was, forwarded on every POST as `X-MCP-Client`.
//
// ⚠️ SAYING IT ONCE IN `initialize` IS NOT ENOUGH. Virgil names a session from
// `clientInfo.name`, but a session lasts exactly one TCP connection — and
// Node's global agent closes an idle keep-alive socket after about five
// seconds. A tool call minutes after the handshake therefore lands on a fresh
// connection, in a session that never saw an initialize: without this header it
// is client "unknown", so Virgil stamps no last-seen for Claude Desktop (the
// Agents row stays "Ready" while everything works) and per-tool permission
// grants key to "unknown" instead of to the client that earned them. Virgil
// reads the header on EVERY request, not just the first, so re-sending it is
// the whole fix.
let clientName = null

// HTTP header values are ASCII, and a client name is whatever the client feels
// like sending: a newline or an accented character would make Node throw
// instead of sending the request at all.
function headerSafe(name) {
  return name.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 128)
}

function readDiscovery() {
  // Env wins: it is how `user_config` overrides reach us, and how anyone
  // driving this shim by hand points it at a non-default port.
  if (process.env.VIRGIL_MCP_URL && process.env.VIRGIL_MCP_TOKEN) {
    return { url: process.env.VIRGIL_MCP_URL, token: process.env.VIRGIL_MCP_TOKEN }
  }
  let best = null
  for (const p of DISCOVERY_PATHS) {
    try {
      const stat = fs.statSync(p)
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (!cfg || !cfg.port || !cfg.token) continue
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { mtimeMs: stat.mtimeMs, url: `http://127.0.0.1:${cfg.port}/mcp`, token: cfg.token }
      }
    } catch { /* missing or unreadable is just "not this one" */ }
  }
  return best
}

/// A JSON-RPC error envelope the CLIENT can render, rather than a dead pipe.
/// ⚠️ Exiting on "Virgil isn't running" would be wrong: Claude Desktop starts
/// this at ITS launch, which is routinely before Virgil is open. Staying alive
/// and answering with an error means the connection heals by itself the moment
/// Virgil starts — no reconnect, no restart of Claude Desktop.
function errorReply(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

function post(target, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(target.url)
    const payload = Buffer.from(body, 'utf8')
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': payload.length,
      'Authorization': `Bearer ${target.token}`,
    }
    if (clientName) headers['X-MCP-Client'] = clientName
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function write(line) {
  if (line) process.stdout.write(line + '\n')
}

async function handle(line) {
  let msg
  try { msg = JSON.parse(line) } catch { return }        // not our problem to fix
  const id = Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : undefined
  const isNotification = id === undefined

  // Remember the name for every later POST — see `clientName`.
  if (msg && msg.method === 'initialize' && msg.params && msg.params.clientInfo &&
      typeof msg.params.clientInfo.name === 'string') {
    const safe = headerSafe(msg.params.clientInfo.name)
    if (safe) clientName = safe
  }

  // Re-read per message: Virgil restarts, and the port can walk on a bind
  // conflict. Caching the endpoint would strand us on a stale one.
  const target = readDiscovery()
  if (!target) {
    if (!isNotification) {
      write(errorReply(id, -32001,
        'Virgil is not running, or external agents are switched off. Open Virgil and turn on Settings → AI Features → Agents → Connect External Agents.'))
    }
    return
  }

  try {
    const res = await post(target, line)
    if (res.status === 401) {
      if (!isNotification) {
        // We re-read the token every message, so the only way to be stale is to
        // have read it in the instant between a rotation and the file rewrite —
        // the next message picks the new one up on its own.
        write(errorReply(id, -32002,
          "Virgil rejected the connection token. Try again in a moment. If it keeps happening, switch Connect External Agents off and on again in Virgil's Settings → AI Features → Agents."))
      }
      return
    }
    // 204 = a notification Virgil accepted; there is deliberately no envelope.
    if (res.status === 204 || !res.body) return
    if (!isNotification) write(res.body.trim())
  } catch (e) {
    if (!isNotification) {
      write(errorReply(id, -32001, `Couldn't reach Virgil (${e.message}). Is Virgil running?`))
    }
  }
}

// Serialise: MCP clients may pipeline, and interleaving replies on one stdout
// would corrupt the stream.
let queue = Promise.resolve()
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (line) queue = queue.then(() => handle(line))
  }
})
// ⚠️ DRAIN BEFORE EXITING. stdin ends the moment the client closes the pipe,
// which is normally at shutdown but is IMMEDIATE when the shim is driven by a
// piped script — exiting straight away discarded every in-flight reply and the
// shim looked completely silent.
process.stdin.on('end', () => { queue.then(() => process.exit(0)) })
