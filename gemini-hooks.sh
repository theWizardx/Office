#!/bin/bash
# Gemini Office Visualizer Webhook
# Usage: ./gemini-hooks.sh <event_type> <args...>

SERVER="http://localhost:7777"
EVENT_URL="$SERVER/api/event"
INBOX_URL="$SERVER/api/inbox/Gemini"

case "$1" in
  spawn)
    curl -s -X POST $EVENT_URL -H "Content-Type: application/json" \
      -d "{\"type\":\"agent_spawn\",\"name\":\"Gemini\",\"task\":\"${2:-Ready to assist}\"}" > /dev/null
    ;;
  tool_start)
    curl -s -X POST $EVENT_URL -H "Content-Type: application/json" \
      -d "{\"type\":\"tool_start\",\"tool\":\"${2:-Working}\",\"description\":\"${3:-Processing...}\"}" > /dev/null
    # Also ensure Gemini is spawned
    curl -s -X POST $EVENT_URL -H "Content-Type: application/json" \
      -d "{\"type\":\"agent_spawn\",\"name\":\"Gemini\",\"task\":\"Using $2\"}" > /dev/null
    ;;
  tool_end)
    curl -s -X POST $EVENT_URL -H "Content-Type: application/json" \
      -d "{\"type\":\"tool_end\",\"tool\":\"${2:-Working}\"}" > /dev/null
    # Clear Gemini's bubble
    curl -s -X POST $EVENT_URL -H "Content-Type: application/json" \
      -d "{\"type\":\"agent_idle\",\"name\":\"Gemini\"}" > /dev/null
    ;;
  message)
    curl -s -X POST $EVENT_URL -H "Content-Type: application/json" \
      -d "{\"type\":\"agent_message\",\"from\":\"Gemini\",\"to\":\"Everyone\",\"content\":\"$2\"}" > /dev/null
    ;;
  reply)
    # Send a reply from Gemini to a specific agent
    TO="${2:-Claude}"
    CONTENT="${3:-Done}"
    # Use python3 to safely JSON-encode the content
    JSON_BODY=$(printf '%s' "$CONTENT" | python3 -c "import sys,json; print(json.dumps({'from':'Gemini','content':sys.stdin.read()}))")
    curl -s -X POST "$SERVER/api/inbox/$TO/send" -H "Content-Type: application/json" \
      -d "$JSON_BODY" > /dev/null
    ;;
  inbox)
    # Check Gemini's inbox for unread messages
    curl -s "$INBOX_URL"
    ;;
  inbox-ack)
    # Acknowledge all messages (or specific IDs as JSON array)
    if [ -n "$2" ]; then
      curl -s -X POST "$INBOX_URL/ack" -H "Content-Type: application/json" \
        -d "{\"ids\":$2}"
    else
      curl -s -X POST "$INBOX_URL/ack" -H "Content-Type: application/json" \
        -d "{}"
    fi
    ;;
  *)
    echo "Usage: $0 {spawn|tool_start|tool_end|message|reply|inbox|inbox-ack} [args]"
    echo ""
    echo "Commands:"
    echo "  spawn [task]           - Show Gemini as active with a task"
    echo "  tool_start [tool] [desc] - Report tool usage"
    echo "  tool_end [tool]        - Report tool finished"
    echo "  message [text]         - Broadcast a message from Gemini"
    echo "  reply [to] [content]   - Send a reply to a specific agent"
    echo "  inbox                  - Check unread messages for Gemini"
    echo "  inbox-ack [ids_json]   - Acknowledge messages (all or by IDs)"
    exit 1
    ;;
esac
