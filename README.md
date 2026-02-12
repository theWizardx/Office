# Claude Code Office

> Watch your AI agents work in a real-time pixel art office

![Claude Code Office](assets/office-preview.png)

A real-time visualization dashboard that brings Claude Code agent activity to life. Every tool call, agent spawn, team creation, and message exchange is rendered as pixel art characters working at desks in a retro-style office — complete with a kitchen, bar, wandering NPCs, and speech bubbles showing what each agent is doing.

---

## Features

### Pixel Art Office
The main view renders a full office scene on HTML Canvas. Agents appear at desks when spawned, show speech bubbles with their current task, and disappear with a poof animation when done. The office includes decorations like plants, a kitchen area, a bar with colorful bottles, and wandering NPC characters (Pixel, Byte, Chip).

### Dashboard Views

The top navigation bar provides multiple views into the same real-time event stream:

| View | Description |
|------|-------------|
| **Office** | Live pixel art office scene with agent avatars and speech bubbles |
| **Tasks** | Kanban board with To Do / In Progress / Done columns and localStorage persistence |
| **Chat** | Activity feed showing all tool usage, agent events, and messages with filters |
| **Council** | Team coordination — message threads, mini task board, agent connection graph |
| **Calendar** | Monthly calendar with day selection and task scheduling |
| **Projects** | Project tracking board with live project status |
| **Memory** | Browse Claude's persistent memory files (`~/.claude/`) with context window gauge |
| **Org** | Dynamic org chart built from active agents and team hierarchy |
| **Captures** | Screenshot and capture management |
| **Docs** | Documentation viewer |
| **People** | Agent profiles and history |
| **Search** | Search across all events and data |

### Real-Time Event System

Events flow through WebSocket connections and are broadcast to all connected clients instantly. The server persists teams, tasks, and messages to `.state.json` so state survives restarts. New clients receive a full state replay on connection.

**Supported events:**
- `agent_spawn` / `agent_complete` / `agent_idle` — Agent lifecycle
- `tool_start` / `tool_end` — Tool usage tracking
- `agent_message` — Inter-agent communication
- `team_create` — Team formation
- `task_create` / `task_update` — Task lifecycle

### Agent Inbox System

Each agent gets a message queue with read/unread tracking. Agents can send messages to each other through the REST API, enabling async communication between Claude and other AI agents (like Gemini).

### Memory Viewer

Browse Claude's persistent memory files directly from the dashboard. See which knowledge files exist, how many lines they use, and monitor context window pressure with a visual gauge (max 200 lines).

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

### Setup

```bash
# Clone the repository
git clone https://github.com/theWizardx/Office.git
cd Office

# Install dependencies
npm install

# Start the server
npm start
```

The server runs on **http://localhost:7777**. Open it in your browser to see the office.

### Connect to Claude Code

Add hooks to your Claude Code settings (`~/.claude/settings.json`) so tool usage events are sent to the visualizer:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/Office/send-event.sh tool_start"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/Office/send-event.sh tool_end"
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/Office` with the actual path where you cloned the repo.

The empty `matcher` fires the hook for every tool call. The script sends a background curl request and always exits 0, so it never blocks or slows down Claude Code.

### Test It

Send a test event without Claude Code running:

```bash
# Simulate a tool usage
echo '{"tool_name":"Read","tool_input":{"description":"reading a file"}}' | bash send-event.sh tool_start

# Simulate an agent spawn
echo '{"tool_name":"Task","tool_input":{"name":"researcher","description":"Exploring the codebase"}}' | bash send-event.sh tool_start
```

---

## Gemini Integration

The project includes optional Gemini AI integration. Gemini appears as a permanent resident in the office with its own inbox.

### Gemini Hooks

`gemini-hooks.sh` provides a webhook interface for Gemini:

```bash
./gemini-hooks.sh spawn "Ready to assist"      # Show Gemini as active
./gemini-hooks.sh tool_start "Search" "Looking" # Report tool usage
./gemini-hooks.sh tool_end "Search"             # Tool finished
./gemini-hooks.sh message "Hello everyone"      # Broadcast a message
./gemini-hooks.sh reply "Claude" "Done!"        # Reply to specific agent
./gemini-hooks.sh inbox                         # Check unread messages
./gemini-hooks.sh inbox-ack                     # Mark all as read
```

### Gemini Worker

`gemini-worker.sh` runs a background daemon that polls Gemini's inbox and auto-executes tasks via the Gemini CLI:

```bash
./gemini-worker.sh        # Run in foreground
./gemini-worker.sh &      # Run in background
./gemini-worker.sh stop   # Stop the background worker
```

---

## API

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/event` | Send an event (tool_start, agent_spawn, etc.) |
| `GET` | `/api/state` | Get full state snapshot |
| `GET` | `/api/messages` | Get message history |
| `DELETE` | `/api/state/clear` | Clear all persisted state |

### Agent Inbox

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inbox/:agent` | Get unread messages for an agent |
| `POST` | `/api/inbox/:agent/ack` | Mark messages as read |
| `POST` | `/api/inbox/:agent/send` | Send a message to an agent |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/memory/files` | List all memory files |
| `GET` | `/api/memory/lines` | Get line counts across all files |
| `GET` | `/api/memory/file?path=...` | Read a specific memory file |
| `POST` | `/api/memory/file` | Save/update a memory file |
| `GET` | `/api/memory/claude-md` | Find CLAUDE.md from project root |

---

## Architecture

```
Claude Code (hooks)  ──>  send-event.sh  ──>  POST /api/event
                                                     │
Gemini CLI           ──>  gemini-hooks.sh ──>        │
                                                     ▼
                                              ┌─────────────┐
                                              │  server.js   │
                                              │  Express +   │
                                              │  WebSocket   │
                                              └──────┬──────┘
                                                     │
                                              broadcast via WS
                                                     │
                                              ┌──────▼──────┐
                                              │   Browser    │
                                              │  Canvas +    │
                                              │  Vanilla JS  │
                                              └─────────────┘
```

## Tech Stack

- **Server:** Express 5, WebSocket (ws)
- **Client:** Vanilla JavaScript, HTML5 Canvas, CSS3
- **Fonts:** Press Start 2P (retro), Inter (UI), JetBrains Mono (code)
- **Integration:** Claude Code hooks, Gemini CLI
- **Zero frameworks** — no React, Vue, or heavy dependencies

---

## License

[MIT](LICENSE)
