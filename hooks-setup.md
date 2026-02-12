# Claude Office Visualizer - Hooks Setup

## What It Does

The Claude Office Visualizer shows a real-time animated office where Claude agents work at desks, use tools, and spawn sub-agents. It connects to Claude Code via the hooks system to capture tool usage events and display them visually.

## 1. Start the Server

```bash
cd /path/to/claude-office-viz
node server.js
```

The server runs on **http://localhost:7777**.

## 2. Configure Claude Code Hooks

Add the following to your `.claude/settings.json` (create the file if it doesn't exist):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-office-viz/send-event.sh tool_start"
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
            "command": "/path/to/claude-office-viz/send-event.sh tool_end"
          }
        ]
      }
    ]
  }
}
```

The empty `matcher` means the hook fires for every tool call. The script runs curl in the background and always exits 0, so it never blocks or slows down Claude Code.

## 3. Open the Visualizer

Open **http://localhost:7777** in your browser. You should see the office scene.

## 4. Test Manually

You can send a test event without Claude Code running:

```bash
echo '{"tool_name":"Read","tool_input":{"description":"test"}}' | bash /path/to/claude-office-viz/send-event.sh tool_start
```

Check the browser -- you should see the agent react to the tool event.

## 5. Test Agent Spawn

```bash
echo '{"tool_name":"Task","tool_input":{"name":"researcher","description":"Exploring the codebase"}}' | bash /path/to/claude-office-viz/send-event.sh tool_start
```

This simulates a sub-agent being spawned, which should appear as a new character in the office.
