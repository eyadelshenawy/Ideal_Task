# IDT Desk MCP server (read-only)

IDT Desk includes a remote MCP server that lets an AI assistant, such as Claude, read tickets over HTTPS. It is **read-only**: it has no tool that creates, changes or deletes anything.

- **Address:** `https://<your IDT Desk address>/api/mcp`
  (live: `https://ideal-tasks-app.onrender.com/api/mcp`)
- **Transport:** MCP Streamable HTTP, stateless; each `POST` gets a plain JSON reply.
- **Authentication:** `Authorization: Bearer <token>`

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_projects` | none | The projects this token may read: `code`, `name` |
| `list_tickets` | `project` (required), `status`, `updated_since` | For one project: `code`, `title`, `status`, `area` (module), `owner` (assignees), `created`, `due`, `closed`. At most 1,000 tickets, ordered by code |
| `get_ticket` | `code` (required) | One ticket in full: the fields above plus priority, type, category, tags, start date, closure reason, parent, subtasks, description and comments (oldest first) |
| `get_status_changes` | `project` (required), `since` (required) | Every status change in the project since that date, oldest first: `code`, `title`, `from`, `to`, `at`. At most 5,000 rows |

Notes:

- `status` accepts the label or its id: New, Ready, In Progress, Waiting, Internal Test, Customer Test, Done.
- Dates accept `2026-11-01` or `2026-11-01T09:00:00Z`. Every date returned is in UTC.
- `closed` is filled only while a ticket is Done.
- In `get_status_changes`, `from` is empty on a ticket's first row (the status it was created in).
- A comment with no author came from the customer, through the tracking page or a shared link. Its author shows as "Customer".

## Rules the server enforces

1. **Read-only.** There are only the four tools above. Any other tool name is refused.
2. **One project per call.** `list_tickets` and `get_status_changes` need a project, and `get_ticket` works on one ticket. Tickets with no project are never returned.
3. **Per-token project list.** Each token can read only the projects ticked when it was created. If a project or ticket is outside that list, the reply is the same as for one that doesn't exist, so a token can't find out which other clients exist.
4. **Hidden tasks.** Private tasks, tasks in Trash and tasks on hold are never returned (the same rule as everywhere else in the app).
5. **The token is never stored or logged.** The database keeps only its SHA-256 hash and its last 4 characters. The token is shown once, when it is created.
6. **Every request is logged.** Each row records the token name, the method or tool, the project and ticket code asked for, the outcome, the number of rows returned, the IP address and the time. Ticket content and the arguments as a whole are never logged. Calls with a missing or wrong token are logged as "Invalid token".
7. **Rate limits:** 120 requests a minute per token and 300 a minute per IP address.

## Setup

### 1. Deploy

Merging this change deploys it. The build runs `prisma migrate deploy`, which applies migration `20261128090000_mcp_server`. That migration:

- adds the tables `TaskStatusChange`, `McpToken`, `McpRequestLog` and `_McpTokenProjects`;
- rebuilds past status history from the task activity log (lines like "Status changed from New to In Progress"), plus one "created" row per task;
- adds a database trigger on `Task` that records every status change from now on, whichever screen or job makes it.

No new environment variables are needed.

### 2. Create a token (Super Admin)

1. Sign in to IDT Desk.
2. Go to **⋯ → Settings → MCP access**.
3. Press **New token**.
4. Give it a name that says who or what will use it, for example "Eyad — Claude weekly report".
5. Tick the projects it may read, for example **ABM**.
6. Press **Create token**, then **Copy token**. It won't be shown again.
7. Copy the **Server address** shown at the top of the screen.

To stop a token, press **Revoke**; it stops working at once. To see what a token has done, open the **Request log** tab.

### 3. Connect a client

**Claude Code**

```bash
claude mcp add --transport http idt-desk https://ideal-tasks-app.onrender.com/api/mcp \
  --header "Authorization: Bearer $IDT_DESK_TOKEN"
```

Put the token in the `IDT_DESK_TOKEN` environment variable first, so it isn't written into your shell history.

**Claude API (MCP connector)**

```json
"mcp_servers": [{
  "type": "url",
  "url": "https://ideal-tasks-app.onrender.com/api/mcp",
  "name": "idt-desk",
  "authorization_token": "<token>"
}]
```

**Any MCP client that supports Streamable HTTP with a custom header** can connect the same way: give it the address and the header `Authorization: Bearer <token>`.

> **Note:** the server uses a fixed bearer token, not OAuth. A client that only supports OAuth sign-in can't connect yet.

### 4. Check it works

```bash
curl -s https://ideal-tasks-app.onrender.com/api/mcp \
  -H "Authorization: Bearer $IDT_DESK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

The request then appears under **Settings → MCP access → Request log**.

## Test run against ABM

The test ran on a local copy of the database, shaped like production, with an **ABM** project. The client was the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`, `StreamableHTTPClientTransport`), and the token could read ABM only.

| Check | Result |
|---|---|
| `initialize` and `tools/list` | 4 tools, all marked read-only |
| `list_projects` | ABM only |
| `list_tickets` ABM | 11 tickets. The private ticket, the trashed ticket and the on-hold ticket were left out |
| `list_tickets` ABM, status Done | 6 tickets, each with a closed date |
| `list_tickets` ABM, updated since 2030-01-01 | 0 |
| `get_ticket` ABM-0003 | Full details plus 1 comment |
| `get_status_changes` ABM since 2026-10-05 | History rebuilt from the activity log, e.g. ABM-0003: In Progress → Waiting → In Progress → Done |
| Another client's project (APEXPH), or ticket (APEX-0001) | Refused, with the same message as "doesn't exist" |
| Private, trashed or on-hold ABM ticket | Refused as not found |
| `update_ticket` (a write) | Refused: unknown tool |
| No token or wrong token | HTTP 401, logged as "Invalid token" |
| Revoked token | HTTP 401 |
| `GET /api/mcp` | HTTP 405 |
| Token in the database, server log or request log | Not found in any of them |
| Status change after the migration | Recorded by the trigger; editing another field adds no row |
| Migration on an empty database and on a production-shaped one | Applies cleanly; `prisma migrate diff` is empty |

## Files

- `src/app/api/mcp/route.ts`: the MCP endpoint (JSON-RPC, auth, logging)
- `src/lib/mcp/tools.ts`: the four tools
- `src/lib/mcp/tokens.ts`: token creation, hashing and checking
- `src/app/api/mcp-tokens/*`: Settings API (create, revoke, request log)
- `src/components/McpAccessModal.tsx`: Settings → MCP access
- `prisma/migrations/20261128090000_mcp_server/`: tables, history rebuild and trigger
