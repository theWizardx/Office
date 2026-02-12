#!/bin/bash
# Claude Code Hooks -> Office Visualizer bridge
# Reads hook JSON from stdin, sends events to the visualizer server.

INPUT=$(cat)

EVENT_TYPE="$1"

if [ "$EVENT_TYPE" = "tool_start" ]; then
  TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name','unknown'))" 2>/dev/null || echo "unknown")
  TOOL_INPUT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); inp=d.get('tool_input',{}); print(inp.get('description',inp.get('command',inp.get('pattern',inp.get('prompt','working...'))))[:80])" 2>/dev/null || echo "working...")

  # Check if this is a Task tool (agent spawn)
  if [ "$TOOL_NAME" = "Task" ]; then
    AGENT_NAME=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
n=ti.get('name','') or ti.get('prompt','') or d.get('name','') or 'agent'
print(re.sub(r'[^a-zA-Z0-9 _-]','',n)[:40])
" 2>/dev/null || echo "agent")
    TASK_DESC=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
desc=ti.get('description','') or 'working'
print(re.sub(r'[^a-zA-Z0-9 _.,-]','',desc)[:60])
" 2>/dev/null || echo "working")
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"agent_spawn\",\"name\":\"$AGENT_NAME\",\"task\":\"$TASK_DESC\"}" > /dev/null 2>&1 &

  elif [ "$TOOL_NAME" = "TeamCreate" ]; then
    TEAM_NAME=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
n=ti.get('team_name','') or 'team'
print(re.sub(r'[^a-zA-Z0-9 _-]','',n)[:40])
" 2>/dev/null || echo "team")
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"team_create\",\"name\":\"$TEAM_NAME\"}" > /dev/null 2>&1 &

  elif [ "$TOOL_NAME" = "SendMessage" ]; then
    MSG_FROM=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
f=ti.get('from','') or 'claude'
print(re.sub(r'[^a-zA-Z0-9 _-]','',f)[:30])
" 2>/dev/null || echo "claude")
    MSG_TO=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
t=ti.get('recipient','') or 'unknown'
print(re.sub(r'[^a-zA-Z0-9 _-]','',t)[:30])
" 2>/dev/null || echo "unknown")
    MSG_CONTENT=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
c=ti.get('summary','') or ti.get('content','') or ''
c=re.sub(r'[^a-zA-Z0-9 _.,-]','',c)[:60]
print(c)
" 2>/dev/null || echo "")
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"agent_message\",\"from\":\"$MSG_FROM\",\"to\":\"$MSG_TO\",\"content\":\"$MSG_CONTENT\"}" > /dev/null 2>&1 &

  elif [ "$TOOL_NAME" = "TaskCreate" ]; then
    TASK_SUBJECT=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
s=ti.get('subject','') or 'task'
print(re.sub(r'[^a-zA-Z0-9 _.,-]','',s)[:60])
" 2>/dev/null || echo "task")
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"task_create\",\"subject\":\"$TASK_SUBJECT\"}" > /dev/null 2>&1 &

  elif [ "$TOOL_NAME" = "TaskUpdate" ]; then
    TASK_ID=$(echo "$INPUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
print(ti.get('taskId','') or '')
" 2>/dev/null || echo "")
    TASK_STATUS=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
s=ti.get('status','') or ''
print(re.sub(r'[^a-zA-Z0-9_]','',s)[:20])
" 2>/dev/null || echo "")
    TASK_OWNER=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
o=ti.get('owner','') or ''
print(re.sub(r'[^a-zA-Z0-9 _-]','',o)[:30])
" 2>/dev/null || echo "")
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"task_update\",\"taskId\":\"$TASK_ID\",\"status\":\"$TASK_STATUS\",\"owner\":\"$TASK_OWNER\"}" > /dev/null 2>&1 &

  else
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"tool_start\",\"tool\":\"$TOOL_NAME\",\"description\":\"$TOOL_INPUT\"}" > /dev/null 2>&1 &
  fi

elif [ "$EVENT_TYPE" = "tool_end" ]; then
  TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name','unknown'))" 2>/dev/null || echo "unknown")

  if [ "$TOOL_NAME" = "Task" ]; then
    # Don't emit agent_complete on tool_end — background agents keep running
    # after the Task tool returns. agent_complete is sent via teammate_terminated
    # system messages or explicit shutdown instead.
    true

  elif [ "$TOOL_NAME" = "TeamCreate" ]; then
    TEAM_NAME=$(echo "$INPUT" | python3 -c "
import sys,json,re
d=json.load(sys.stdin)
ti=d.get('tool_input',{})
n=ti.get('team_name','') or 'team'
print(re.sub(r'[^a-zA-Z0-9 _-]','',n)[:40])
" 2>/dev/null || echo "team")
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"team_create_done\",\"name\":\"$TEAM_NAME\"}" > /dev/null 2>&1 &

  else
    curl -s -X POST http://localhost:7777/api/event \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"tool_end\",\"tool\":\"$TOOL_NAME\"}" > /dev/null 2>&1 &
  fi
fi

exit 0
