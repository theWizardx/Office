// Main Application - WebSocket client + state management + game loop + tab navigation

(function () {
  // --- Tab Navigation ---

  const navTabs = document.querySelectorAll('.nav-tab');
  const pages = document.querySelectorAll('.page');

  function switchTab(tabName) {
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    pages.forEach(page => {
      const pageId = page.id.replace('page-', '');
      page.classList.toggle('active', pageId === tabName);
    });
    localStorage.setItem('mission-active-tab', tabName);
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = tab.dataset.tab;
      const pageEl = document.getElementById(`page-${tabName}`);
      if (pageEl) {
        switchTab(tabName);
      }
    });
  });

  // Restore last active tab
  const savedTab = localStorage.getItem('mission-active-tab');
  if (savedTab && document.getElementById(`page-${savedTab}`)) {
    switchTab(savedTab);
  }

  // --- Office Canvas ---

  const canvas = document.getElementById('office-canvas');
  const scene = new OfficeScene(canvas);

  // State
  // Gemini is a permanent resident at workstation 1
  const geminiAgent = {
    name: 'Gemini',
    task: null,
    status: 'idle',
    avatarType: 'gemini',
    workstationIndex: 1,
    spawnTime: 0,
    permanent: true,
  };

  const state = {
    mainAvatar: { status: 'idle', currentTask: null },
    agents: [geminiAgent],
    teams: [],
    messages: [],
    disconnected: true,
    eventCount: 0,
  };

  // Sync org chart whenever state changes
  function syncOrgChart() {
    if (typeof updateOrgChart === 'function') {
      updateOrgChart(state);
    }
  }

  // Sync live projects whenever state changes
  function syncLiveProjects(event) {
    if (typeof updateLiveProjects === 'function') {
      updateLiveProjects(state, event);
    }
  }

  // Init org chart + live projects with default state
  syncOrgChart();
  syncLiveProjects();

  // Init calendar
  if (typeof initCalendar === 'function') {
    initCalendar();
  }

  // Init tasks board
  if (typeof initTasksBoard === 'function') {
    initTasksBoard();
  }

  // Init projects
  if (typeof initProjects === 'function') {
    initProjects();
  }

  // Init chat
  if (typeof initChat === 'function') {
    initChat();
  }

  // Init council
  if (typeof initCouncil === 'function') {
    initCouncil();
  }

  // Init memory
  if (typeof initMemory === 'function') {
    initMemory();
  }

  // Cross-tab navigation: calendar -> tasks board
  if (window.MissionEvents) {
    window.MissionEvents.on('navigate:tasks', function (detail) {
      switchTab('tasks');
      if (window.TasksAPI && detail.taskId) {
        setTimeout(function () {
          window.TasksAPI.highlightTask(detail.taskId);
        }, 100);
      }
    });

    // Cross-tab navigation: tasks board -> calendar
    window.MissionEvents.on('navigate:calendar', function (detail) {
      switchTab('calendar');
      if (window.CalendarAPI && detail.dueDate) {
        setTimeout(function () {
          window.CalendarAPI.navigateToDate(detail.dueDate);
        }, 100);
      }
    });
  }

  // UI elements
  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  const eventCounter = document.getElementById('event-counter');
  const activeAgents = document.getElementById('active-agents');
  const currentTime = document.getElementById('current-time');

  let idleTimeout = null;
  let ws = null;
  let reconnectTimer = null;

  // --- WebSocket ---

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => {
      state.disconnected = false;
      connectionDot.className = 'connection-dot connected';
      connectionText.className = 'connected';
      connectionText.textContent = 'Connected';
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onclose = () => {
      state.disconnected = true;
      connectionDot.className = 'connection-dot disconnected';
      connectionText.className = 'disconnected';
      connectionText.textContent = 'Disconnected';
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.warn('Invalid event:', e);
      }
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  // --- Event Handling ---

  function handleEvent(event) {
    state.eventCount++;
    eventCounter.textContent = state.eventCount;

    // Feed event to chat
    if (window.ChatAPI) {
      window.ChatAPI.addMessage(event);
    }

    // Feed event to council
    if (window.CouncilAPI) {
      window.CouncilAPI.addEvent(event);
    }

    switch (event.type) {
      case 'clear':
        state.eventCount = 0;
        if (window.ChatAPI && typeof window.ChatAPI.clearFeed === 'function') {
          window.ChatAPI.clearFeed();
        }
        // Council module's clear logic is handled via addEvent internally if we add it
        break;
      case 'tool_start':
        handleToolStart(event);
        break;
      case 'tool_end':
        handleToolEnd(event);
        break;
      case 'agent_spawn':
        handleAgentSpawn(event);
        break;
      case 'agent_complete':
        handleAgentComplete(event);
        break;
      case 'agent_idle':
        handleAgentIdle(event);
        break;
      case 'idle':
        handleIdle();
        break;
      case 'team_create':
        state.teams.push({ name: event.name, createdAt: Date.now() });
        break;
      case 'team_create_done':
        break;
      case 'agent_message':
        handleAgentMessage(event);
        break;
      case 'task_create':
      case 'task_update':
        break;
    }

    // Update status bar + org chart + live projects
    activeAgents.textContent = state.agents.length;
    syncOrgChart();
    syncLiveProjects(event);
  }

  function handleToolStart(event) {
    state.mainAvatar.status = 'working';
    state.mainAvatar.currentTask = event.description || event.tool || 'Working...';

    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
  }

  function handleToolEnd(event) {
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      state.mainAvatar.status = 'idle';
      state.mainAvatar.currentTask = null;
      syncOrgChart();
      syncLiveProjects();
    }, 3000);
  }

  function handleAgentSpawn(event) {
    const isGemini = (event.name || '').toLowerCase() === 'gemini';

    // If Gemini, update the permanent agent instead of creating a new one
    if (isGemini) {
      const gem = state.agents.find(a => a.permanent && a.name === 'Gemini');
      if (gem) {
        const newStatus = event.status || 'working';
        gem.status = newStatus;
        gem.task = newStatus === 'working' ? (event.task || 'Working...') : null;
        return;
      }
    }

    // Find an empty workstation (skip index 1, reserved for Gemini)
    const usedStations = new Set(state.agents.map(a => a.workstationIndex));
    let stationIndex = -1;
    for (let i = 2; i < WORKSTATIONS.length; i++) {
      if (!usedStations.has(i)) {
        stationIndex = i;
        break;
      }
    }

    // No empty station: replace the oldest done agent (never replace permanent)
    if (stationIndex === -1) {
      const doneAgents = state.agents
        .filter(a => a.status === 'done' && !a.permanent)
        .sort((a, b) => a.spawnTime - b.spawnTime);
      if (doneAgents.length > 0) {
        const replaced = doneAgents[0];
        stationIndex = replaced.workstationIndex;
        state.agents.splice(state.agents.indexOf(replaced), 1);
      } else {
        // All working, replace the oldest non-permanent
        const nonPerm = state.agents.filter(a => !a.permanent);
        if (nonPerm.length > 0) {
          const oldest = nonPerm.reduce((a, b) => a.spawnTime < b.spawnTime ? a : b);
          stationIndex = oldest.workstationIndex;
          state.agents.splice(state.agents.indexOf(oldest), 1);
        } else {
          return; // All slots are permanent, can't spawn
        }
      }
    }

    const agent = {
      name: event.name || 'agent',
      task: event.task || (event.status === 'idle' ? null : 'Working...'),
      status: event.status || 'working',
      avatarType: 'agent',
      workstationIndex: stationIndex,
      spawnTime: Date.now(),
    };

    state.agents.push(agent);

    const station = WORKSTATIONS[stationIndex];
    scene.addPoof(station.x, station.y - 10);

    activeAgents.textContent = state.agents.length;
  }

  function handleAgentComplete(event) {
    // Try exact name match first
    let agentIndex = state.agents.findIndex(a => a.name === event.name);

    // Fallback: case-insensitive match
    if (agentIndex === -1) {
      const lowerName = (event.name || '').toLowerCase();
      agentIndex = state.agents.findIndex(a => a.name.toLowerCase() === lowerName);
    }

    // No match found — ignore rather than killing a random agent
    if (agentIndex === -1) return;

    // Permanent agents (Gemini) go back to idle, never removed
    if (state.agents[agentIndex].permanent) {
      state.agents[agentIndex].status = 'idle';
      state.agents[agentIndex].task = null;
      return;
    }

    // Mark as done - agent stays visible briefly so user sees the green/checkmark
    state.agents[agentIndex].status = 'done';

    // Auto-remove after 10 seconds so done agents don't pile up
    const agentRef = state.agents[agentIndex];
    setTimeout(() => {
      const idx = state.agents.indexOf(agentRef);
      if (idx !== -1) {
        state.agents.splice(idx, 1);
        activeAgents.textContent = state.agents.length;
        syncOrgChart();
        syncLiveProjects();
      }
    }, 10000);
  }

  function handleAgentMessage(event) {
    state.messages.push({
      from: event.from || 'claude',
      to: event.to || 'unknown',
      content: event.content || '',
      timestamp: Date.now()
    });
    if (state.messages.length > 10) state.messages.shift();

    // Trigger envelope effect in office view
    const fromName = (event.from || '').toLowerCase();
    const toName = (event.to || '').toLowerCase();
    let fromIdx = 0; // default to main Claude
    let toIdx = 0;
    for (const a of state.agents) {
      if (a.name.toLowerCase() === fromName) {
        fromIdx = a.workstationIndex;
      }
      if (a.name.toLowerCase() === toName) {
        toIdx = a.workstationIndex;
      }
    }
    if (fromIdx !== toIdx) {
      scene.addMessageEffect(WORKSTATIONS[fromIdx], WORKSTATIONS[toIdx]);
    }
  }

  function handleIdle() {
    state.mainAvatar.status = 'idle';
    state.mainAvatar.currentTask = null;
  }

  function handleAgentIdle(event) {
    const name = (event.name || '').toLowerCase();
    const agent = state.agents.find(a => a.name.toLowerCase() === name);
    if (agent) {
      agent.status = 'idle';
      agent.task = null;
      // Permanent agents stay forever — just clear their task
      syncOrgChart();
      syncLiveProjects();
    }
  }

  // --- Game Loop ---

  function gameLoop() {
    scene.render(state);
    requestAnimationFrame(gameLoop);
  }

  // --- Clock ---

  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    currentTime.textContent = `${h}:${m}:${s}`;
  }

  // --- Init ---

  connect();
  gameLoop();
  updateClock();
  setInterval(updateClock, 1000);

})();
