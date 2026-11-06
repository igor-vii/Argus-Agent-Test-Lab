#!/usr/bin/env node
// Argus MCP stdio bridge.
// A real MCP server (Model Context Protocol, stdio transport) that connects
// local MCP clients — Claude Desktop, Claude Code, Cursor, VS Code, etc. —
// to the hosted Argus Console endpoint (adversarial testing for AI agents
// that move money): https://console.argus-lab.tech/mcp
//
// Zero dependencies: Node.js 18+ stdlib only. No npm install needed.
//
// Usage:
//   ARGUS_MCP_KEY=argmcp_yourkey node mcp-server.mjs
//
// Environment:
//   ARGUS_MCP_URL  remote MCP endpoint (default: https://console.argus-lab.tech/mcp)
//   ARGUS_MCP_KEY  your personal connector key (argmcp_...). initialize and
//                  tools/list work without it; tools/call requires it.
//                  Get yours: Console -> Agents -> cheat sheet -> MCP.
//
// Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio transport).

import { createInterface } from "node:readline";

const REMOTE = (process.env.ARGUS_MCP_URL || "https://console.argus-lab.tech/mcp").replace(/\/+$/, "");
const KEY = process.env.ARGUS_MCP_KEY || process.env.ARGUS_KEY || "";

const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

async function forward(body) {
  const headers = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
  };
  if (KEY) {
    headers["authorization"] = `Bearer ${KEY}`;
    headers["x-argus-key"] = KEY;
  }
  const res = await fetch(REMOTE, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();

  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text).error?.message || detail;
    } catch {
      /* keep raw text */
    }
    return {
      jsonrpc: "2.0",
      id: body?.id ?? null,
      error: { code: -32000, message: `Argus endpoint ${res.status}: ${detail}` },
    };
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    // Stateless endpoint: extract the first data payload from an SSE body, if any.
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            return JSON.parse(payload);
          } catch {
            /* ignore malformed event */
          }
        }
      }
    }
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null; // empty 202 for notifications, etc.
  }
}

let pending = 0;
let stdinClosed = false;

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // not JSON — ignore
  }

  pending++;
  forward(msg)
    .then((resp) => {
      if (resp) {
        if (typeof msg?.id !== "undefined") {
          write(resp); // request — always answer
        } else if (resp.error) {
          write(resp); // server-side error on a notification — surface it
        }
      }
    })
    .catch((err) => {
      if (typeof msg?.id !== "undefined") {
        write({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32603, message: `Argus bridge error: ${err?.message || err}` },
        });
      }
    })
    .finally(() => {
      pending--;
      if (stdinClosed && pending === 0) process.exit(0);
    });
});

rl.on("close", () => {
  stdinClosed = true;
  if (pending === 0) process.exit(0);
  // otherwise: exit happens in .finally() when the last in-flight call drains
});
process.on("SIGINT", () => process.exit(0));
