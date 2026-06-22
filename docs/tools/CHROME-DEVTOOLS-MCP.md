# Chrome DevTools MCP: Research & Evaluation

> Historical note. LBH no longer depends on Puppeteer for the automated test
> suite. Current deterministic browser tests use `tests/browser-driver.cjs`, a
> small Chrome DevTools Protocol wrapper around system Chrome.

## What It Is

[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) is an official Google MCP server that gives AI coding agents access to a live Chrome browser through the Chrome DevTools Protocol. Built by the Chrome team (September 2025).

Key fact at the time of evaluation: the MCP wrapped Puppeteer internally. LBH's
current local harness talks CDP directly instead of depending on that package.

29 tools across 6 categories:

| Category | Tools | Highlights |
|----------|-------|-----------|
| Input (9) | click, drag, fill, hover, press_key, type_text... | Full browser interaction |
| Navigation (6) | navigate_page, new_page, list_pages... | Multi-tab support |
| Emulation (2) | emulate, resize_page | Device simulation |
| Performance (4) | performance traces, memory snapshots | LCP/TBT analysis |
| Network (2) | request inspection with source maps | Debug API calls |
| Debugging (6) | evaluate_script, take_screenshot, lighthouse_audit... | The useful stuff |

## Comparison: Local CDP Harness vs Chrome DevTools MCP

| | Local CDP harness | Chrome DevTools MCP |
|---|---|---|
| **Control model** | Programmatic (JS scripts) | Conversational (AI tool calls) |
| **Determinism** | Exact same every run | AI interprets results (non-deterministic) |
| **CI compatible** | Yes (`npm test`, exit code 0/1) | No (needs AI agent in the loop) |
| **Cost per run** | Free (just CPU) | LLM tokens per tool call |
| **Speed** | Fast (~25s for all 7 suites) | Slow (LLM inference per action) |
| **Visual debugging** | Screenshots saved to disk | Screenshots in conversation context |
| **Performance profiling** | Manual | Built-in (traces, Lighthouse, memory) |
| **Console inspection** | Limited | Source-mapped, queryable |
| **WebGL interaction** | Works via `page.evaluate()`-style helpers | [Known weakness (#403)](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/403) |
| **Agent self-verification** | Yes (agents run `npm test` after commits) | Possible but fragile and expensive |

## The Verdict: Use Both

**Don't make MCP the test suite.** The local CDP harness is deterministic,
scriptable, cheap, `exit code 0/1`, and agents self-verify after every commit.

**Do use Chrome DevTools MCP as a development tool when available.** It's
valuable for things deterministic scripts should not pretend to judge:

| Use case | Tool |
|----------|------|
| CI / deterministic testing | Local CDP harness |
| Agent self-verification | Local CDP harness |
| "Does this look right?" visual checks | Chrome DevTools MCP |
| Performance profiling (traces, Lighthouse) | Chrome DevTools MCP |
| Console error debugging | Chrome DevTools MCP |
| Network request inspection | Chrome DevTools MCP |
| Mobile viewport testing | Chrome DevTools MCP |

Think of it this way: **the CDP harness is test infrastructure. Browser tools are an agent's eyes.**

## Setup

One line for Claude Code:
```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

One line for Codex:
```bash
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

Both Claude and Codex support it. Also works with Gemini, Cursor, Copilot, and any MCP-compatible client.

There's also `claude --chrome` mode which uses the Chrome extension for native browser integration (requires Chrome extension v1.0.36+ and Claude Code v2.0.73+). Different from the MCP server — it operates in your actual browser with your login state.

## What Claude Code Could Do With It

Once configured, Claude Code gets 29 new tools. Example workflows:

**Visual verification during development:**
```
"Take a screenshot of localhost:8080 and tell me if the well accretion rings look correct"
→ Claude calls navigate_page, take_screenshot, interprets the image
```

**Performance debugging:**
```
"Profile the game for 10 seconds and tell me what's causing frame drops"
→ Claude calls performance_start_trace, waits, performance_stop_trace, performance_analyze_insight
```

**Console debugging:**
```
"Check if there are any WebGL errors in the console"
→ Claude calls list_console_messages, filters for errors
```

**Responsive testing:**
```
"Resize to 800x600 and screenshot the home screen"
→ Claude calls resize_page, take_screenshot
```

## WebGL Caveat

There's an [open issue (#403)](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/403) about canvas/WebGL interaction. The MCP can see the canvas DOM element but can't interact with rendered WebGL content via coordinate clicks. Our workaround is still `__TEST_API` plus script evaluation; the local harness now does that through CDP directly.

## Codex Compatibility

Yes — OpenAI Codex supports MCP servers including Chrome DevTools MCP. There are [reports of transport reliability issues](https://github.com/openai/codex/issues/13138) (browser MCP connections dropping on macOS during long sessions), but the integration works. Same tool set, same capabilities.

## Recommendation

1. **Keep the local CDP harness for `npm test`** — deterministic scripts own pass/fail
2. **Add Chrome DevTools MCP to both Claude Code and Codex MCP configs** — free visual/perf tools
3. **Use it for exploratory testing** — "does this look right?" is a conversation now, not a screenshot + alt-tab
4. **Use it for performance profiling** — traces and Lighthouse without leaving the coding session
5. **Don't use it for CI** — wrong tool for that job
