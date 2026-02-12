#!/bin/bash
# Gemini Worker Daemon
# Polls the office inbox and auto-executes tasks via Gemini CLI
#
# Usage: ./gemini-worker.sh        (foreground)
#        ./gemini-worker.sh &      (background)
#        ./gemini-worker.sh stop   (stop background worker)

SERVER="http://localhost:7777"
INBOX_URL="$SERVER/api/inbox/Gemini"
HOOKS="$(dirname "$0")/gemini-hooks.sh"
PIDFILE="/tmp/gemini-worker.pid"
POLL_INTERVAL=3
WORKDIR="$(cd "$(dirname "$0")" && pwd)"

# --- Stop command ---
if [ "$1" = "stop" ]; then
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    kill "$PID" 2>/dev/null && echo "Stopped gemini-worker (PID $PID)" || echo "Process not running"
    rm -f "$PIDFILE"
  else
    echo "No worker running (no pidfile)"
  fi
  exit 0
fi

# --- Write PID ---
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"; exit 0' INT TERM

echo "[gemini-worker] Started (PID $$), polling every ${POLL_INTERVAL}s"
echo "[gemini-worker] Inbox: $INBOX_URL"
echo "[gemini-worker] Working directory: $WORKDIR"

# --- Main loop ---
while true; do
  # Poll for unread messages
  RESPONSE=$(curl -s "$INBOX_URL" 2>/dev/null)

  # Skip if empty or error
  if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "[]" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Parse messages
  MSG_COUNT=$(printf '%s' "$RESPONSE" | python3 -c "import sys,json; msgs=json.load(sys.stdin); print(len(msgs))" 2>/dev/null)

  if [ -z "$MSG_COUNT" ] || [ "$MSG_COUNT" = "0" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  echo "[gemini-worker] Found $MSG_COUNT new message(s)"

  # Process each message
  printf '%s' "$RESPONSE" | python3 -c "
import sys, json
msgs = json.load(sys.stdin)
for m in msgs:
    # tab-separated: id, from, content
    print(f\"{m['id']}\t{m['from']}\t{m['content']}\")
" 2>/dev/null | while IFS=$'\t' read -r MSG_ID MSG_FROM MSG_CONTENT; do

    echo "[gemini-worker] Task from $MSG_FROM (msg #$MSG_ID): $MSG_CONTENT"

    # Show Gemini as working in the office
    bash "$HOOKS" spawn "Working on task from $MSG_FROM" 2>/dev/null

    # Acknowledge the message
    curl -s -X POST "$INBOX_URL/ack" -H "Content-Type: application/json" \
      -d "{\"ids\":[$MSG_ID]}" > /dev/null 2>&1

    # Run Gemini CLI with the task (yolo mode for auto-approval, text output)
    echo "[gemini-worker] Executing via Gemini CLI..."
    GEMINI_OUTPUT=$(cd "$WORKDIR" && gemini -p "$MSG_CONTENT" --yolo -o text 2>&1 | tail -c 500)
    EXIT_CODE=$?

    echo "[gemini-worker] Gemini finished (exit $EXIT_CODE)"

    # Send result back
    RESULT_JSON=$(printf '%s' "$GEMINI_OUTPUT" | python3 -c "
import sys, json
output = sys.stdin.read().strip()
exit_code = $EXIT_CODE
if exit_code == 0:
    msg = output if output else 'Task completed successfully'
else:
    msg = f'Task failed (exit {exit_code}): {output}' if output else f'Task failed with exit code {exit_code}'
print(json.dumps({'from': 'Gemini', 'content': msg[:500]}))
")

    curl -s -X POST "$SERVER/api/inbox/$MSG_FROM/send" \
      -H "Content-Type: application/json" \
      -d "$RESULT_JSON" > /dev/null 2>&1

    # Set Gemini back to idle
    bash "$HOOKS" tool_end "task" 2>/dev/null

    echo "[gemini-worker] Reply sent to $MSG_FROM"
  done

  sleep "$POLL_INTERVAL"
done
