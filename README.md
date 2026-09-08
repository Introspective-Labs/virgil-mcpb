# Virgil for Claude Desktop

Virgil is a mindmap browser for the Mac. Instead of tabs, your browsing is a
visual map: topics you are researching, the sites inside each one, and the pages
you have kept.

This extension connects Claude Desktop to Virgil, so Claude can read that map
and help you organise it — find the research thread a question belongs to, read
pages you have saved, file new sources into a topic, and reshape a map that has
drifted.

## Requirements

- macOS, with Virgil installed — <https://virgil.app>
- Virgil running (the extension talks to the app, not to a service)
- "Connect External Agents" switched on in Virgil: Settings → AI Features →
  Agents

## Installing

1. Open `Virgil.mcpb`. Claude Desktop shows an install sheet — **it may appear
   behind other windows**, so if nothing seems to happen, switch to Claude
   Desktop and look for it.
2. The sheet says the extension is not verified by Anthropic. That is what every
   extension outside Anthropic's own directory shows.
3. Click Install.

## Trying it out

Everything below runs on one Mac; the extension never leaves it.

1. **Get Virgil.** Download it from <https://virgil.app> (a direct download, or
   the Mac App Store version — both work the same here). It runs on macOS 14 or
   later.
2. **First launch.** Virgil asks you to choose an AI for its own features
   (topic naming, summaries, its built-in chat). On a Mac with Apple
   Intelligence enabled it picks that and asks nothing; otherwise paste an
   Anthropic or OpenAI API key. The extension does not use this — Claude
   Desktop brings its own model — but Virgil will not open without one.
3. **Put something on the map.** Browse a few sites — a search and a couple of
   result pages is enough — or bring in bookmarks with Settings → Default
   Browser → Import from another browser. Claude can only read what is there.
4. **Switch on agents and install.** Settings → AI Features → Agents → turn on
   "Connect External Agents", then click "Install in Claude Desktop" and click
   Install on the sheet (see "Installing" above). The row under the switch
   turns to Working once Claude Desktop has talked to Virgil.
5. **Ask Claude.** Some prompts that exercise each kind of tool:
   - "What topics do I have open in Virgil?" — reads the map.
   - "Read the page I'm looking at in Virgil and summarise it." — reads page
     content.
   - "Start a topic in Virgil about Roman aqueducts and file these three links
     into it: …" — creates a topic and adds pages.
   - "Pin the most useful of those sources." — pins a page.
   - "Propose a tidier structure for my Virgil map." — Virgil shows a
     before/after preview you approve or reject.
   - "Delete that aqueducts topic." — Virgil asks you first; this and merging
     are the two actions it always confirms.

## How it connects

The extension contains a small script that runs on Claude Desktop's built-in
Node runtime — there is nothing to install and no runtime to set up. (The
manifest declares `server.type: "node"` and deliberately declares no
`compatibility.runtimes.node`; that combination is what routes the script to the
built-in runtime. JSON has no comments, hence the note here.)

When Claude calls a tool, the script reads Virgil's discovery file —
`~/Library/Application Support/Virgil/mcp.json`, or the equivalent path inside
the App Store build's container — for the port Virgil is listening on and a
per-install secret token, and forwards the request to
`http://127.0.0.1:<port>/mcp` with that token.

No connection leaves the loopback interface. If Virgil is not running, or
external agents are switched off, the tools answer with an error saying so, and
start working the moment you open Virgil — nothing needs restarting.

## Building from source

The extension's source is public at
<https://github.com/Introspective-Labs/virgil-mcpb>: the manifest, the shim in
`server/`, this README, the licence and the icon — the same files Virgil packs
into its app bundle. The shim has no dependencies, so there is nothing to
install before packing. To build a `.mcpb` yourself, with the official tool:

```
npx @anthropic-ai/mcpb validate manifest.json
npx @anthropic-ai/mcpb pack .
```

Opening the resulting file with Claude Desktop installs it exactly as the copy
inside Virgil does. Virgil itself is not open source; this bundle is.

## Privacy Policy

The extension collects nothing and sends nothing anywhere except to Virgil on
the same Mac.

What Claude may read or change is governed by Virgil's own per-agent, per-action
permissions. Reads are allowed once "Connect External Agents" is on. For
changes, Virgil relies on Claude Desktop's own per-tool approval by default and
adds its own prompt only for deleting or merging a topic; Settings → AI Features
→ Agents can raise that to every direct edit (publishing or unpublishing a page
follows Claude Desktop's approval alone) and lists each agent's grants. A
reorganisation proposal is always shown to you as a before/after preview to
approve. Virgil stores your maps, pages and history locally on your Mac.

The full policy is at <https://virgil.app/privacy>.

Separately, the AI provider Claude Desktop is configured to talk to receives
whatever Claude chooses to send it — including anything it read from your map —
under that provider's own terms.

## Support

<https://virgil.app/support>

## License

This bundle — the manifest and the connecting script — is MIT licensed; see
`LICENSE`. Virgil itself is a separate, closed-source application.
