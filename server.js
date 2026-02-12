const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { WebSocketServer } = require("ws");

const PORT = 7777;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();
const activeAgents = new Map();
const messageHistory = [];
const MAX_MESSAGES = 50;
let currentMainTask = null;

// --- Persistent State (survives browser refresh + server restart) ---
const STATE_FILE = path.join(__dirname, ".state.json");
const teamHistory = [];      // team_create events
const taskState = new Map();  // taskId -> latest task state

function loadPersistedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      if (data.teams) teamHistory.push(...data.teams);
      if (data.tasks) {
        for (const t of data.tasks) taskState.set(t.taskId, t);
      }
      if (data.messages) messageHistory.push(...data.messages);
      console.log(`[State] Loaded: ${teamHistory.length} teams, ${taskState.size} tasks, ${messageHistory.length} messages`);
    }
  } catch (err) {
    console.error("[State] Error loading:", err.message);
  }
}

function savePersistedState() {
  try {
    const data = {
      teams: teamHistory,
      tasks: Array.from(taskState.values()),
      messages: messageHistory,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data), "utf-8");
  } catch (err) {
    console.error("[State] Error saving:", err.message);
  }
}

// Debounced save (don't write on every event)
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    savePersistedState();
  }, 2000);
}

loadPersistedState();

// --- Agent Inbox System ---
// Per-agent message queues: Map<agentName, Array<{id, from, content, timestamp, read}>>
const agentInboxes = new Map();
let inboxMsgId = 0;

function getInbox(agentName) {
  const key = agentName.toLowerCase();
  if (!agentInboxes.has(key)) {
    agentInboxes.set(key, []);
  }
  return agentInboxes.get(key);
}

function deliverToInbox(to, from, content) {
  inboxMsgId++;
  const msg = {
    id: inboxMsgId,
    from: from,
    to: to,
    content: content,
    timestamp: new Date().toISOString(),
    read: false,
  };
  const inbox = getInbox(to);
  inbox.push(msg);
  // Cap inbox at 100 messages
  if (inbox.length > 100) inbox.shift();
  return msg;
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total)`);

  // Replay full state to new client
  if (currentMainTask) {
    ws.send(JSON.stringify(currentMainTask));
  }
  for (const agentEvent of activeAgents.values()) {
    ws.send(JSON.stringify(agentEvent));
  }
  // Replay teams
  for (const team of teamHistory) {
    ws.send(JSON.stringify(team));
  }
  // Replay tasks (send as task_create so council rebuilds its board)
  for (const task of taskState.values()) {
    ws.send(JSON.stringify({ ...task, type: "task_create" }));
    // If task has been updated, also send the update
    if (task.status !== "pending" || task.owner) {
      ws.send(JSON.stringify({ type: "task_update", taskId: task.taskId, status: task.status, owner: task.owner }));
    }
  }
  // Replay messages
  for (const msg of messageHistory) {
    ws.send(JSON.stringify(msg));
  }

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });

  ws.on("error", (err) => {
    console.error("[WS] Client error:", err.message);
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function logEvent(event) {
  const timestamp = new Date().toLocaleTimeString();
  switch (event.type) {
    case "tool_start":
      console.log(`[${timestamp}] TOOL START: ${event.tool} - ${event.description}`);
      break;
    case "tool_end":
      console.log(`[${timestamp}] TOOL END:   ${event.tool}`);
      break;
    case "agent_spawn":
      console.log(`[${timestamp}] AGENT SPAWN: ${event.name} - ${event.task}`);
      break;
    case "agent_complete":
      console.log(`[${timestamp}] AGENT DONE:  ${event.name}`);
      break;
    case "team_create":
      console.log(`[${timestamp}] TEAM CREATE: ${event.name}`);
      break;
    case "team_create_done":
      console.log(`[${timestamp}] TEAM READY: ${event.name}`);
      break;
    case "agent_message":
      console.log(`[${timestamp}] MESSAGE: ${event.from} → ${event.to}: ${event.content}`);
      break;
    case "task_create":
      console.log(`[${timestamp}] TASK NEW: ${event.subject}`);
      break;
    case "task_update":
      console.log(`[${timestamp}] TASK UPDATE: #${event.taskId} → ${event.status} (owner: ${event.owner})`);
      break;
    case "agent_idle":
      console.log(`[${timestamp}] AGENT IDLE: ${event.name}`);
      break;
    case "idle":
      console.log(`[${timestamp}] IDLE`);
      break;
    default:
      console.log(`[${timestamp}] UNKNOWN EVENT:`, event);
  }
}

app.post("/api/event", (req, res) => {
  const event = req.body;

  if (!event || !event.type) {
    res.status(400).json({ error: "Missing event type" });
    return;
  }

  // Update state
  if (event.type === "agent_spawn") {
    activeAgents.set(event.name, event);
  } else if (event.type === "agent_complete") {
    activeAgents.delete(event.name);
  } else if (event.type === "agent_idle") {
    const agent = activeAgents.get(event.name);
    if (agent) {
      agent.task = null;
      agent.status = "idle";
    }
  } else if (event.type === "agent_message") {
    messageHistory.push({
      ...event,
      timestamp: new Date().toISOString()
    });
    if (messageHistory.length > MAX_MESSAGES) messageHistory.shift();
    scheduleSave();
    // Deliver to recipient's inbox
    if (event.to) {
      deliverToInbox(event.to, event.from || "unknown", event.content || "");
    }
  } else if (event.type === "team_create") {
    const exists = teamHistory.some(t => t.name === event.name);
    if (!exists) {
      teamHistory.push({ type: "team_create", name: event.name, timestamp: new Date().toISOString() });
      scheduleSave();
    }
  } else if (event.type === "task_create") {
    const taskId = event.taskId || String(taskState.size + 1);
    const task = {
      type: "task_create",
      taskId: taskId,
      subject: event.subject || "Untitled",
      status: "pending",
      owner: event.owner || null,
      timestamp: new Date().toISOString(),
    };
    taskState.set(taskId, task);
    event.taskId = taskId;
    scheduleSave();
  } else if (event.type === "task_update") {
    const taskId = event.taskId ? String(event.taskId) : null;
    if (taskId && taskState.has(taskId)) {
      const task = taskState.get(taskId);
      if (event.status) task.status = event.status;
      if (event.owner) task.owner = event.owner;
      if (event.subject) task.subject = event.subject;
      task.type = "task_update";
      scheduleSave();
    }
  } else if (event.type === "tool_start") {
    currentMainTask = event;
  } else if (event.type === "tool_end" || event.type === "idle") {
    currentMainTask = null;
  }

  logEvent(event);
  broadcast(event);
  res.json({ ok: true });
});

app.get("/api/messages", (req, res) => {
  res.json(messageHistory);
});

// Full state snapshot for page load
app.get("/api/state", (req, res) => {
  res.json({
    teams: teamHistory,
    tasks: Array.from(taskState.values()),
    messages: messageHistory,
    agents: Array.from(activeAgents.values()),
    mainTask: currentMainTask,
  });
});

// Clear all persisted state
app.delete("/api/state/clear", (req, res) => {
  teamHistory.length = 0;
  taskState.clear();
  messageHistory.length = 0;
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
  console.log("[State] Cleared all persisted state");
  
  // Broadcast clear event to all clients
  broadcast({ type: "clear" });
  
  res.json({ ok: true });
});

// --- Agent Inbox API ---

// Get unread messages for an agent
app.get("/api/inbox/:agent", (req, res) => {
  const agent = req.params.agent;
  const inbox = getInbox(agent);
  const unreadOnly = req.query.unread !== "false";
  const messages = unreadOnly ? inbox.filter((m) => !m.read) : inbox;
  res.json(messages);
});

// Acknowledge (mark as read) messages by ID or all
app.post("/api/inbox/:agent/ack", (req, res) => {
  const agent = req.params.agent;
  const inbox = getInbox(agent);
  const { ids } = req.body || {};

  if (ids && Array.isArray(ids)) {
    // Mark specific messages as read
    const idSet = new Set(ids);
    for (const msg of inbox) {
      if (idSet.has(msg.id)) msg.read = true;
    }
  } else {
    // Mark all as read
    for (const msg of inbox) {
      msg.read = true;
    }
  }

  res.json({ ok: true });
});

// Send a message to an agent (shortcut — also broadcasts to UI)
app.post("/api/inbox/:agent/send", (req, res) => {
  const to = req.params.agent;
  const { from, content } = req.body || {};

  if (!from || !content) {
    return res.status(400).json({ error: "Missing 'from' or 'content'" });
  }

  // Deliver to inbox
  const msg = deliverToInbox(to, from, content);

  // Also broadcast as agent_message so UI shows it
  const event = {
    type: "agent_message",
    from: from,
    to: to,
    content: content,
  };
  messageHistory.push({ ...event, timestamp: msg.timestamp });
  if (messageHistory.length > MAX_MESSAGES) messageHistory.shift();

  logEvent(event);
  broadcast(event);

  res.json({ ok: true, messageId: msg.id });
});

// --- Memory API endpoints ---

app.get("/api/memory/files", (req, res) => {
  try {
    const home = os.homedir();
    const files = [];

    // Global CLAUDE.md
    const globalClaude = path.join(home, ".claude", "CLAUDE.md");
    if (fs.existsSync(globalClaude)) {
      const stat = fs.statSync(globalClaude);
      files.push({
        name: "CLAUDE.md (global)",
        path: ".claude/CLAUDE.md",
        size: stat.size,
        modified: stat.mtime,
      });
    }

    // Project memory directory - scan for project dirs that contain memory/
    const projectsDir = path.join(home, ".claude", "projects");
    if (fs.existsSync(projectsDir)) {
      const projectDirs = fs.readdirSync(projectsDir);
      for (const projDir of projectDirs) {
        const projPath = path.join(projectsDir, projDir);
        if (!fs.statSync(projPath).isDirectory()) continue;

        // Check for CLAUDE.md in project dir
        const projClaude = path.join(projPath, "CLAUDE.md");
        if (fs.existsSync(projClaude)) {
          const stat = fs.statSync(projClaude);
          files.push({
            name: `CLAUDE.md (${projDir})`,
            path: `.claude/projects/${projDir}/CLAUDE.md`,
            size: stat.size,
            modified: stat.mtime,
          });
        }

        // Check for memory/ subdirectory
        const memoryDir = path.join(projPath, "memory");
        if (fs.existsSync(memoryDir) && fs.statSync(memoryDir).isDirectory()) {
          const memFiles = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
          for (const memFile of memFiles) {
            const memPath = path.join(memoryDir, memFile);
            const stat = fs.statSync(memPath);
            files.push({
              name: `${memFile} (${projDir})`,
              path: `.claude/projects/${projDir}/memory/${memFile}`,
              size: stat.size,
              modified: stat.mtime,
            });
          }
        }
      }
    }

    res.json(files);
  } catch (err) {
    console.error("[Memory] Error listing files:", err.message);
    res.status(500).json({ error: "Failed to list memory files" });
  }
});

// Get actual line counts for all memory files
app.get("/api/memory/lines", (req, res) => {
  try {
    const home = os.homedir();
    const projectsDir = path.join(home, ".claude", "projects");
    const results = [];
    let grandTotal = 0;

    if (fs.existsSync(projectsDir)) {
      const projectDirs = fs.readdirSync(projectsDir);
      for (const projDir of projectDirs) {
        const memoryDir = path.join(projectsDir, projDir, "memory");
        if (!fs.existsSync(memoryDir) || !fs.statSync(memoryDir).isDirectory()) continue;

        const memFiles = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
        for (const memFile of memFiles) {
          const fullPath = path.join(memoryDir, memFile);
          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n").length;
          results.push({
            name: memFile,
            project: projDir,
            path: `.claude/projects/${projDir}/memory/${memFile}`,
            lines: lines,
          });
          grandTotal += lines;
        }
      }
    }

    // Also count global CLAUDE.md
    const globalClaude = path.join(home, ".claude", "CLAUDE.md");
    if (fs.existsSync(globalClaude)) {
      const content = fs.readFileSync(globalClaude, "utf-8");
      const lines = content.split("\n").length;
      results.push({
        name: "CLAUDE.md",
        project: "global",
        path: ".claude/CLAUDE.md",
        lines: lines,
      });
      grandTotal += lines;
    }

    res.json({ files: results, totalLines: grandTotal, maxLines: 200 });
  } catch (err) {
    console.error("[Memory] Error counting lines:", err.message);
    res.status(500).json({ error: "Failed to count lines" });
  }
});

app.get("/api/memory/file", (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: "Missing path parameter" });
    }

    // Validate: must be within .claude/
    const normalized = path.normalize(relPath);
    if (!normalized.startsWith(".claude/") && !normalized.startsWith(".claude\\")) {
      return res.status(403).json({ error: "Path must be within .claude/" });
    }
    if (normalized.includes("..")) {
      return res.status(403).json({ error: "Directory traversal not allowed" });
    }

    const fullPath = path.join(os.homedir(), normalized);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const stat = fs.statSync(fullPath);
    const content = fs.readFileSync(fullPath, "utf-8");

    res.json({
      name: path.basename(fullPath),
      content,
      modified: stat.mtime,
    });
  } catch (err) {
    console.error("[Memory] Error reading file:", err.message);
    res.status(500).json({ error: "Failed to read memory file" });
  }
});

// Save/update a memory file
app.post("/api/memory/file", (req, res) => {
  try {
    const { path: relPath, content } = req.body || {};
    if (!relPath || typeof content !== "string") {
      return res.status(400).json({ error: "Missing 'path' or 'content'" });
    }

    const normalized = path.normalize(relPath);
    if (!normalized.startsWith(".claude/") && !normalized.startsWith(".claude\\")) {
      return res.status(403).json({ error: "Path must be within .claude/" });
    }
    if (normalized.includes("..")) {
      return res.status(403).json({ error: "Directory traversal not allowed" });
    }

    const fullPath = path.join(os.homedir(), normalized);

    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf-8");
    const stat = fs.statSync(fullPath);

    console.log(`[Memory] Saved: ${normalized} (${stat.size} bytes)`);
    res.json({ ok: true, size: stat.size, modified: stat.mtime });
  } catch (err) {
    console.error("[Memory] Error saving file:", err.message);
    res.status(500).json({ error: "Failed to save memory file" });
  }
});

app.get("/api/memory/claude-md", (req, res) => {
  try {
    // Search from cwd upward for CLAUDE.md
    let dir = process.cwd();
    const root = path.parse(dir).root;

    while (dir !== root) {
      const candidate = path.join(dir, "CLAUDE.md");
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, "utf-8");
        return res.json({ content, path: candidate });
      }
      dir = path.dirname(dir);
    }

    // Check root as well
    const rootCandidate = path.join(root, "CLAUDE.md");
    if (fs.existsSync(rootCandidate)) {
      const content = fs.readFileSync(rootCandidate, "utf-8");
      return res.json({ content, path: rootCandidate });
    }

    res.json({ content: null });
  } catch (err) {
    console.error("[Memory] Error reading CLAUDE.md:", err.message);
    res.status(500).json({ error: "Failed to read CLAUDE.md" });
  }
});

server.listen(PORT, () => {
  console.log(`Claude Office Visualizer running on http://localhost:${PORT}`);
});