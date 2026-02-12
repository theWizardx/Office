// Council Module - Agent team communication view with message thread, mini task board, and connection graph

(function () {
  // --- State ---

  var teams = [];
  var agentMessages = [];
  var teamTasks = [];
  var activeFilter = null;
  var senderColors = {};
  var colorPool = ['#FF6B00', '#4A90D9', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B'];
  var colorIndex = 0;
  var autoScroll = true;
  var contentRevealed = false;

  // --- DOM Refs ---

  var toolbar = null;
  var messagesFeed = null;
  var msgEmpty = null;
  var taskPending = null;
  var taskActive = null;
  var taskDone = null;
  var pendingCount = null;
  var activeCount = null;
  var doneCount = null;
  var graphCanvas = null;
  var graphCtx = null;
  var teamsEmpty = null;

  // --- Helpers ---

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function getSenderColor(name) {
    if (!name) return '#999';
    var key = name.toLowerCase();
    if (senderColors[key]) return senderColors[key];
    senderColors[key] = colorPool[colorIndex % colorPool.length];
    colorIndex++;
    return senderColors[key];
  }

  // --- Toolbar ---

  function renderToolbar() {
    if (!toolbar) return;
    toolbar.innerHTML = '';

    var allBtn = document.createElement('button');
    allBtn.className = 'council-filter-btn' + (activeFilter === null ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', function () {
      activeFilter = null;
      renderToolbar();
      applyFilter();
    });
    toolbar.appendChild(allBtn);

    for (var i = 0; i < teams.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'council-filter-btn' + (activeFilter === teams[i].name ? ' active' : '');
      btn.textContent = teams[i].name;
      btn.setAttribute('data-team', teams[i].name);
      btn.addEventListener('click', function (e) {
        var teamName = e.currentTarget.getAttribute('data-team');
        activeFilter = teamName;
        renderToolbar();
        applyFilter();
      });
      toolbar.appendChild(btn);
    }

    // Always add clear button at the end
    var clearBtn = document.createElement('button');
    clearBtn.className = 'council-clear-btn';
    clearBtn.textContent = 'Clear All';
    clearBtn.addEventListener('click', clearAll);
    toolbar.appendChild(clearBtn);
  }

  // --- Filter ---

  function applyFilter() {
    if (!messagesFeed) return;
    var items = messagesFeed.querySelectorAll('.council-msg');
    var anyVisible = false;

    for (var i = 0; i < items.length; i++) {
      if (activeFilter === null) {
        items[i].style.display = '';
        anyVisible = true;
      } else {
        var team = items[i].getAttribute('data-team');
        if (team === activeFilter) {
          items[i].style.display = '';
          anyVisible = true;
        } else {
          items[i].style.display = 'none';
        }
      }
    }

    if (msgEmpty) {
      msgEmpty.style.display = (agentMessages.length === 0 || !anyVisible) ? '' : 'none';
    }
  }

  // --- Messages ---

  function findTeamForAgent(agentName) {
    // Simple heuristic: check if agent name contains a team name
    var lower = (agentName || '').toLowerCase();
    for (var i = teams.length - 1; i >= 0; i--) {
      if (lower.indexOf(teams[i].name.toLowerCase()) !== -1) {
        return teams[i].name;
      }
    }
    // Default to the most recent team if any
    return teams.length > 0 ? teams[teams.length - 1].name : '';
  }

  function renderMessage(msg) {
    if (!messagesFeed) return;

    var el = document.createElement('div');
    el.className = 'council-msg';
    var teamName = msg.team || '';
    el.setAttribute('data-team', teamName);

    var fromColor = getSenderColor(msg.from);
    var toColor = getSenderColor(msg.to);

    el.innerHTML =
      '<div class="council-msg-header">' +
        '<span class="council-msg-from" style="color:' + fromColor + '">' + escapeHTML(msg.from || 'unknown') + '</span>' +
        '<span class="council-msg-arrow">&rarr;</span>' +
        '<span class="council-msg-to" style="color:' + toColor + '">' + escapeHTML(msg.to || 'unknown') + '</span>' +
        (teamName ? '<span class="council-msg-team">' + escapeHTML(teamName) + '</span>' : '') +
        '<span class="council-msg-time">' + formatTime(msg.timestamp) + '</span>' +
      '</div>' +
      '<div class="council-msg-body">' + escapeHTML(msg.content || '') + '</div>';

    // Check filter before displaying
    if (activeFilter !== null && teamName !== activeFilter) {
      el.style.display = 'none';
    }

    messagesFeed.appendChild(el);

    if (msgEmpty) {
      msgEmpty.style.display = 'none';
    }

    // Auto-scroll
    if (autoScroll) {
      messagesFeed.scrollTop = messagesFeed.scrollHeight;
    }
  }

  // --- Task Board ---

  function renderTaskCard(task) {
    var card = document.createElement('div');
    card.className = 'council-task-card council-task-' + (task.status || 'pending');
    card.setAttribute('data-task-id', task.taskId);

    card.innerHTML =
      '<div class="council-task-subject">' + escapeHTML(task.subject || 'Task #' + task.taskId) + '</div>' +
      (task.owner ? '<div class="council-task-owner">' + escapeHTML(task.owner) + '</div>' : '');

    return card;
  }

  function updateTaskColumns() {
    if (!taskPending || !taskActive || !taskDone) return;

    taskPending.innerHTML = '';
    taskActive.innerHTML = '';
    taskDone.innerHTML = '';

    var pCount = 0;
    var aCount = 0;
    var dCount = 0;

    for (var i = 0; i < teamTasks.length; i++) {
      var task = teamTasks[i];
      var card = renderTaskCard(task);

      if (task.status === 'completed' || task.status === 'done') {
        taskDone.appendChild(card);
        dCount++;
      } else if (task.status === 'in_progress') {
        taskActive.appendChild(card);
        aCount++;
      } else {
        taskPending.appendChild(card);
        pCount++;
      }
    }

    if (pendingCount) pendingCount.textContent = pCount;
    if (activeCount) activeCount.textContent = aCount;
    if (doneCount) doneCount.textContent = dCount;
  }

  // --- Connection Graph ---

  function renderGraph() {
    if (!graphCanvas || !graphCtx) return;

    var width = graphCanvas.width;
    var height = graphCanvas.height;
    graphCtx.clearRect(0, 0, width, height);

    // Collect unique names
    var nameSet = {};
    for (var i = 0; i < agentMessages.length; i++) {
      var msg = agentMessages[i];
      if (msg.from) nameSet[msg.from.toLowerCase()] = msg.from;
      if (msg.to) nameSet[msg.to.toLowerCase()] = msg.to;
    }

    var names = [];
    for (var key in nameSet) {
      if (nameSet.hasOwnProperty(key)) {
        names.push(nameSet[key]);
      }
    }

    if (names.length === 0) return;

    // Count edges
    var edges = {};
    for (var j = 0; j < agentMessages.length; j++) {
      var m = agentMessages[j];
      if (!m.from || !m.to) continue;
      var a = m.from.toLowerCase();
      var b = m.to.toLowerCase();
      var edgeKey = a < b ? a + '|' + b : b + '|' + a;
      edges[edgeKey] = (edges[edgeKey] || 0) + 1;
    }

    // Position nodes in a circle
    var cx = width / 2;
    var cy = height / 2;
    var radius = Math.min(cx, cy) - 20;
    var nodePositions = {};

    for (var n = 0; n < names.length; n++) {
      var angle = (2 * Math.PI * n) / names.length - Math.PI / 2;
      nodePositions[names[n].toLowerCase()] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        name: names[n]
      };
    }

    // Draw edges
    for (var edgeK in edges) {
      if (!edges.hasOwnProperty(edgeK)) continue;
      var parts = edgeK.split('|');
      var p1 = nodePositions[parts[0]];
      var p2 = nodePositions[parts[1]];
      if (!p1 || !p2) continue;

      var count = edges[edgeK];
      var lineWidth = Math.min(1 + count, 5);

      graphCtx.beginPath();
      graphCtx.moveTo(p1.x, p1.y);
      graphCtx.lineTo(p2.x, p2.y);
      graphCtx.strokeStyle = 'rgba(255,255,255,0.2)';
      graphCtx.lineWidth = lineWidth;
      graphCtx.stroke();
    }

    // Draw nodes
    var nodeRadius = names.length > 6 ? 5 : 7;
    for (var nd = 0; nd < names.length; nd++) {
      var pos = nodePositions[names[nd].toLowerCase()];
      var color = getSenderColor(names[nd]);

      graphCtx.beginPath();
      graphCtx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
      graphCtx.fillStyle = color;
      graphCtx.fill();

      // Label
      graphCtx.fillStyle = '#ccc';
      graphCtx.font = '9px sans-serif';
      graphCtx.textAlign = 'center';
      graphCtx.textBaseline = 'bottom';
      graphCtx.fillText(names[nd], pos.x, pos.y - nodeRadius - 2);
    }
  }

  // --- Event Handler ---

  function addEvent(event) {
    if (!event || !event.type) return;

    if (event.type === 'clear') {
      teams.length = 0;
      agentMessages.length = 0;
      teamTasks.length = 0;
      senderColors = {};
      colorIndex = 0;
      contentRevealed = false;

      if (messagesFeed) messagesFeed.innerHTML = '';
      if (msgEmpty) {
        messagesFeed.appendChild(msgEmpty);
        msgEmpty.style.display = '';
      }
      if (teamsEmpty) teamsEmpty.style.display = '';
      if (toolbar) toolbar.style.display = 'none';
      var contentEl = document.getElementById('council-content');
      if (contentEl) contentEl.style.display = 'none';

      renderToolbar();
      updateTaskColumns();
      renderGraph();
      return;
    }

    // Show toolbar and content on first meaningful event
    if (!contentRevealed && (event.type === 'team_create' || event.type === 'agent_message' ||
        event.type === 'task_create' || event.type === 'task_update')) {
      contentRevealed = true;
      if (teamsEmpty) teamsEmpty.style.display = 'none';
      if (toolbar) toolbar.style.display = 'flex';
      var contentEl = document.getElementById('council-content');
      if (contentEl) contentEl.style.display = 'grid';
    }

    switch (event.type) {
      case 'team_create':
        handleTeamCreate(event);
        break;
      case 'agent_message':
        handleAgentMessage(event);
        break;
      case 'task_create':
        handleTaskCreate(event);
        break;
      case 'task_update':
        handleTaskUpdate(event);
        break;
      case 'agent_spawn':
        // Tracked for potential future use
        break;
      case 'agent_complete':
        // Tracked for potential future use
        break;
    }
  }

  function handleTeamCreate(event) {
    var name = event.name || 'Team ' + (teams.length + 1);

    // Avoid duplicates
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].name === name) return;
    }

    teams.push({ name: name, createdAt: event.timestamp || Date.now() });
    renderToolbar();
  }

  function handleAgentMessage(event) {
    var msg = {
      from: event.from || 'unknown',
      to: event.to || 'unknown',
      content: event.content || '',
      timestamp: event.timestamp || Date.now(),
      team: findTeamForAgent(event.from)
    };

    agentMessages.push(msg);
    renderMessage(msg);
    renderGraph();
  }

  function handleTaskCreate(event) {
    var task = {
      taskId: event.taskId || String(teamTasks.length + 1),
      subject: event.subject || 'Untitled task',
      status: 'pending',
      owner: event.owner || null,
      timestamp: event.timestamp || Date.now()
    };

    teamTasks.push(task);
    updateTaskColumns();
  }

  function handleTaskUpdate(event) {
    var taskId = event.taskId ? String(event.taskId) : null;
    if (!taskId) return;

    for (var i = 0; i < teamTasks.length; i++) {
      if (String(teamTasks[i].taskId) === taskId) {
        if (event.status) teamTasks[i].status = event.status;
        if (event.owner) teamTasks[i].owner = event.owner;
        if (event.timestamp) teamTasks[i].timestamp = event.timestamp;
        updateTaskColumns();
        return;
      }
    }

    // Task not seen yet via task_create, add it now
    var newTask = {
      taskId: taskId,
      subject: event.subject || 'Task #' + taskId,
      status: event.status || 'pending',
      owner: event.owner || null,
      timestamp: event.timestamp || Date.now()
    };
    teamTasks.push(newTask);
    updateTaskColumns();
  }

  // --- Scroll Management ---

  function handleScroll() {
    if (!messagesFeed) return;
    var distanceFromBottom = messagesFeed.scrollHeight - messagesFeed.scrollTop - messagesFeed.clientHeight;
    autoScroll = distanceFromBottom < 40;
  }

  // --- Clear State ---

  function clearAll() {
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/api/state/clear');
    xhr.onload = function () {
      teams.length = 0;
      agentMessages.length = 0;
      teamTasks.length = 0;
      senderColors = {};
      colorIndex = 0;
      contentRevealed = false;

      if (messagesFeed) messagesFeed.innerHTML = '';
      if (msgEmpty) {
        messagesFeed.appendChild(msgEmpty);
        msgEmpty.style.display = '';
      }
      if (teamsEmpty) teamsEmpty.style.display = '';
      if (toolbar) toolbar.style.display = 'none';
      var contentEl = document.getElementById('council-content');
      if (contentEl) contentEl.style.display = 'none';

      renderToolbar();
      updateTaskColumns();
    };
    xhr.send();
  }

  // --- Init ---

  function initCouncil() {
    toolbar = document.getElementById('council-toolbar');
    messagesFeed = document.getElementById('council-messages');
    msgEmpty = document.getElementById('council-msg-empty');
    taskPending = document.getElementById('council-task-pending');
    taskActive = document.getElementById('council-task-active');
    taskDone = document.getElementById('council-task-done');
    pendingCount = document.getElementById('council-pending-count');
    activeCount = document.getElementById('council-active-count');
    doneCount = document.getElementById('council-done-count');
    graphCanvas = document.getElementById('council-graph-canvas');
    teamsEmpty = document.getElementById('council-teams-empty');

    if (graphCanvas) {
      graphCtx = graphCanvas.getContext('2d');
      graphCanvas.width = 200;
      graphCanvas.height = 150;
    }

    if (messagesFeed) {
      messagesFeed.addEventListener('scroll', handleScroll);
    }

    // Hide toolbar and content until first event arrives
    if (toolbar) toolbar.style.display = 'none';
    var contentInit = document.getElementById('council-content');
    if (contentInit) contentInit.style.display = 'none';

    renderToolbar();
    updateTaskColumns();
  }

  // --- Exposed API ---

  window.CouncilAPI = {
    addEvent: function (event) {
      addEvent(event);
    },
    initCouncil: function () {
      initCouncil();
    }
  };

  window.initCouncil = initCouncil;
})();
