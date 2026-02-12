// Projects Module - Project cards with CRUD and progress tracking (localStorage)

(function () {
  // --- Constants ---

  var STORAGE_KEY = 'mission-projects';
  var STATUSES = [
    { value: 'planning', label: 'Planning', color: '#6b7280' },
    { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
    { value: 'on_hold', label: 'On Hold', color: '#f59e0b' },
    { value: 'completed', label: 'Completed', color: '#10b981' }
  ];
  var MONTH_NAMES_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  // --- Storage ---

  function loadProjects() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveProjects(projects) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }

  // --- Helpers ---

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(isoStr) {
    var d = new Date(isoStr);
    return MONTH_NAMES_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function getStatusInfo(value) {
    for (var i = 0; i < STATUSES.length; i++) {
      if (STATUSES[i].value === value) return STATUSES[i];
    }
    return STATUSES[0];
  }

  // --- Render ---

  function renderStats() {
    var header = document.getElementById('projects-page-header');
    if (!header) return;

    var projects = loadProjects();
    var total = projects.length;
    var inProgress = 0;
    var completed = 0;

    for (var i = 0; i < projects.length; i++) {
      if (projects[i].status === 'in_progress') inProgress++;
      if (projects[i].status === 'completed') completed++;
    }

    header.innerHTML =
      '<div class="proj-header-row">' +
        '<h2 class="proj-page-title">Projects</h2>' +
        '<button class="proj-new-btn" id="proj-new-btn">+ New Project</button>' +
      '</div>' +
      '<div class="proj-stats">' +
        '<div class="proj-stat-card">' +
          '<span class="proj-stat-value">' + total + '</span>' +
          '<span class="proj-stat-label">Total</span>' +
        '</div>' +
        '<div class="proj-stat-card">' +
          '<span class="proj-stat-value proj-stat-progress">' + inProgress + '</span>' +
          '<span class="proj-stat-label">In Progress</span>' +
        '</div>' +
        '<div class="proj-stat-card">' +
          '<span class="proj-stat-value proj-stat-completed">' + completed + '</span>' +
          '<span class="proj-stat-label">Completed</span>' +
        '</div>' +
      '</div>';

    document.getElementById('proj-new-btn').addEventListener('click', function () {
      openModal(null);
    });
  }

  function renderGrid() {
    var board = document.getElementById('projects-board');
    if (!board) return;

    var projects = loadProjects();
    board.innerHTML = '';

    if (projects.length === 0) {
      board.innerHTML =
        '<div class="proj-empty">' +
          '<p class="proj-empty-text">No projects yet. Click "+ New Project" to get started.</p>' +
        '</div>';
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'proj-grid';

    // Sort by newest first
    projects.sort(function (a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    for (var i = 0; i < projects.length; i++) {
      var project = projects[i];
      var info = getStatusInfo(project.status);
      var progress = project.progress || 0;

      var card = document.createElement('div');
      card.className = 'proj-card';
      card.setAttribute('data-id', project.id);

      card.innerHTML =
        '<div class="proj-card-top">' +
          '<span class="proj-status-badge" style="background:' + info.color + '">' + escapeHTML(info.label) + '</span>' +
        '</div>' +
        '<h3 class="proj-card-title">' + escapeHTML(project.name) + '</h3>' +
        (project.description
          ? '<p class="proj-card-desc">' + escapeHTML(truncate(project.description, 100)) + '</p>'
          : '') +
        '<div class="proj-progress-wrap">' +
          '<div class="proj-progress-track">' +
            '<div class="proj-progress-fill" style="width:' + progress + '%;background:' + info.color + '"></div>' +
          '</div>' +
          '<span class="proj-progress-text">' + progress + '%</span>' +
        '</div>' +
        '<div class="proj-card-footer">' +
          '<span class="proj-card-date">Created ' + formatDate(project.createdAt) + '</span>' +
        '</div>';

      grid.appendChild(card);
    }

    board.appendChild(grid);
  }

  function renderAll() {
    renderStats();
    renderGrid();
  }

  // --- Project Actions ---

  function addProject(name, description, status, progress) {
    var projects = loadProjects();
    projects.push({
      id: generateId(),
      name: name,
      description: description || '',
      status: status || 'planning',
      progress: progress || 0,
      createdAt: new Date().toISOString()
    });
    saveProjects(projects);
    renderAll();
  }

  function updateProject(id, name, description, status, progress) {
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) {
        projects[i].name = name;
        projects[i].description = description || '';
        projects[i].status = status;
        projects[i].progress = progress;
        break;
      }
    }
    saveProjects(projects);
    renderAll();
  }

  function deleteProject(id) {
    var projects = loadProjects();
    projects = projects.filter(function (p) { return p.id !== id; });
    saveProjects(projects);
    renderAll();
  }

  function findProject(id) {
    var projects = loadProjects();
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) return projects[i];
    }
    return null;
  }

  // --- Modal ---

  var modalEl = null;
  var editingId = null;

  function createModal() {
    modalEl = document.createElement('div');
    modalEl.className = 'proj-modal-overlay';
    modalEl.id = 'proj-modal';
    modalEl.style.display = 'none';

    var statusOptions = '';
    for (var i = 0; i < STATUSES.length; i++) {
      statusOptions += '<option value="' + STATUSES[i].value + '">' + escapeHTML(STATUSES[i].label) + '</option>';
    }

    modalEl.innerHTML =
      '<div class="proj-modal">' +
        '<h3 class="proj-modal-title" id="proj-modal-title">New Project</h3>' +
        '<input class="proj-form-input" id="proj-input-name" placeholder="Project name..." />' +
        '<textarea class="proj-form-textarea" id="proj-input-desc" placeholder="Description (optional)..." rows="3"></textarea>' +
        '<div class="proj-modal-row">' +
          '<label class="proj-form-label">Status</label>' +
          '<select class="proj-form-select" id="proj-input-status">' +
            statusOptions +
          '</select>' +
        '</div>' +
        '<div class="proj-modal-row">' +
          '<label class="proj-form-label">Progress: <span id="proj-progress-value">0</span>%</label>' +
          '<input type="range" class="proj-form-range" id="proj-input-progress" min="0" max="100" value="0" />' +
        '</div>' +
        '<div class="proj-modal-actions">' +
          '<button class="proj-btn-danger" id="proj-delete-btn" style="display:none">Delete</button>' +
          '<div class="proj-modal-actions-right">' +
            '<button class="proj-btn-secondary" id="proj-cancel-btn">Cancel</button>' +
            '<button class="proj-btn-primary" id="proj-save-btn">Create Project</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modalEl);

    // Range slider live update
    document.getElementById('proj-input-progress').addEventListener('input', function () {
      document.getElementById('proj-progress-value').textContent = this.value;
    });

    // Cancel
    document.getElementById('proj-cancel-btn').addEventListener('click', closeModal);

    // Save
    document.getElementById('proj-save-btn').addEventListener('click', handleSave);

    // Delete
    document.getElementById('proj-delete-btn').addEventListener('click', function () {
      if (editingId) {
        deleteProject(editingId);
        closeModal();
      }
    });

    // Enter key in name input
    document.getElementById('proj-input-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        handleSave();
      }
    });

    // Click overlay to close
    modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl) {
        closeModal();
      }
    });
  }

  function openModal(projectId) {
    if (!modalEl) createModal();

    var nameInput = document.getElementById('proj-input-name');
    var descInput = document.getElementById('proj-input-desc');
    var statusInput = document.getElementById('proj-input-status');
    var progressInput = document.getElementById('proj-input-progress');
    var progressValue = document.getElementById('proj-progress-value');
    var titleEl = document.getElementById('proj-modal-title');
    var saveBtn = document.getElementById('proj-save-btn');
    var deleteBtn = document.getElementById('proj-delete-btn');

    if (projectId) {
      var project = findProject(projectId);
      if (!project) return;

      editingId = projectId;
      titleEl.textContent = 'Edit Project';
      saveBtn.textContent = 'Save Changes';
      deleteBtn.style.display = '';
      nameInput.value = project.name;
      descInput.value = project.description || '';
      statusInput.value = project.status;
      progressInput.value = project.progress || 0;
      progressValue.textContent = project.progress || 0;
    } else {
      editingId = null;
      titleEl.textContent = 'New Project';
      saveBtn.textContent = 'Create Project';
      deleteBtn.style.display = 'none';
      nameInput.value = '';
      descInput.value = '';
      statusInput.value = 'planning';
      progressInput.value = 0;
      progressValue.textContent = '0';
    }

    modalEl.style.display = '';
    nameInput.focus();
  }

  function closeModal() {
    if (modalEl) {
      modalEl.style.display = 'none';
      editingId = null;
    }
  }

  function handleSave() {
    var nameInput = document.getElementById('proj-input-name');
    var descInput = document.getElementById('proj-input-desc');
    var statusInput = document.getElementById('proj-input-status');
    var progressInput = document.getElementById('proj-input-progress');

    var name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    var description = descInput.value.trim();
    var status = statusInput.value;
    var progress = parseInt(progressInput.value, 10) || 0;

    if (editingId) {
      updateProject(editingId, name, description, status, progress);
    } else {
      addProject(name, description, status, progress);
    }

    closeModal();
  }

  // --- Event Delegation on Board ---

  function wireBoardEvents() {
    var board = document.getElementById('projects-board');
    if (!board) return;

    board.addEventListener('click', function (e) {
      var card = e.target.closest('.proj-card');
      if (card) {
        var projectId = card.getAttribute('data-id');
        if (projectId) openModal(projectId);
      }
    });
  }

  // --- Init ---

  function initProjects() {
    renderAll();
    wireBoardEvents();
  }

  // Expose globally
  window.initProjects = initProjects;

  // --- Live Activity Section ---

  var activityLog = [];
  var sessionStart = null;

  function capitalizeAgentName(name) {
    if (!name) return '';
    return name.split(/[-_]/).map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function formatElapsed(ms) {
    var totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return totalSec + 's';
    var totalMin = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    if (totalMin < 60) return totalMin + 'm ' + sec + 's';
    var hrs = Math.floor(totalMin / 60);
    var min = totalMin % 60;
    return hrs + 'h ' + min + 'm';
  }

  function formatLogTime(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    var s = d.getSeconds();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function addLogEntry(event) {
    if (!event) return;
    var desc = '';
    if (event.type === 'agent_spawn') {
      desc = 'Agent spawned: ' + (event.name || 'unknown');
    } else if (event.type === 'agent_complete') {
      desc = 'Agent finished: ' + (event.name || 'unknown');
    } else if (event.type === 'tool_start') {
      desc = 'Tool: ' + (event.description || event.tool || 'unknown');
    } else if (event.type === 'tool_end') {
      desc = 'Tool done: ' + (event.tool || 'unknown');
    } else if (event.type === 'idle') {
      desc = 'Claude idle';
    } else if (typeof event === 'string') {
      desc = event;
    } else {
      desc = event.type || 'Event';
    }
    activityLog.unshift({ time: event.timestamp || Date.now(), desc: desc });
    if (activityLog.length > 10) activityLog.length = 10;
  }

  function updateLiveProjects(state, event) {
    if (!sessionStart) sessionStart = Date.now();

    if (event) addLogEntry(event);

    var container = document.getElementById('projects-live');
    if (!container) return;

    var now = Date.now();
    var isWorking = state.mainAvatar && state.mainAvatar.status === 'working';
    var dotClass = isWorking ? 'proj-live-dot proj-live-dot--active' : 'proj-live-dot';
    var statusLabel = isWorking ? 'Working' : 'Idle';
    var statusClass = isWorking ? 'proj-live-status-badge proj-live-status-badge--working' : 'proj-live-status-badge proj-live-status-badge--idle';

    var html = '';

    // Section header
    html += '<div class="proj-live-section">';
    html += '<div class="proj-live-header">';
    html += '<span class="' + dotClass + '"></span>';
    html += '<h3 class="proj-live-title">Live Activity</h3>';
    html += '</div>';

    // Main Claude card
    html += '<div class="proj-live-card proj-live-card--main">';
    html += '<div class="proj-live-card-row">';
    html += '<div class="proj-live-card-info">';
    html += '<span class="proj-live-card-name">Claude</span>';
    html += '<span class="proj-live-card-model">Opus 4.6</span>';
    html += '</div>';
    html += '<div class="proj-live-card-badges">';
    html += '<span class="' + statusClass + '">' + statusLabel + '</span>';
    if (typeof state.eventCount === 'number') {
      html += '<span class="proj-live-event-badge">' + state.eventCount + ' events</span>';
    }
    html += '</div>';
    html += '</div>';

    if (isWorking && state.mainAvatar.currentTask) {
      html += '<div class="proj-live-card-task">' + escapeHTML(state.mainAvatar.currentTask) + '</div>';
    }

    html += '<div class="proj-live-card-elapsed">Session: ' + formatElapsed(now - sessionStart) + '</div>';
    html += '</div>'; // end main card

    // Active agents
    var agents = state.agents || [];
    if (agents.length > 0) {
      html += '<div class="proj-live-agents">';
      html += '<div class="proj-live-agents-label">Active Agents (' + agents.length + ')</div>';

      for (var i = 0; i < agents.length; i++) {
        var agent = agents[i];
        var agentWorking = agent.status === 'working';
        var agentStatusClass = agentWorking
          ? 'proj-live-agent-status proj-live-agent-status--working'
          : 'proj-live-agent-status proj-live-agent-status--done';
        var agentStatusText = agentWorking ? 'Working' : 'Done';
        var spawnElapsed = agent.spawnTime ? formatElapsed(now - agent.spawnTime) : '';

        html += '<div class="proj-live-card proj-live-card--agent">';
        html += '<div class="proj-live-card-row">';
        html += '<span class="proj-live-agent-name">' + escapeHTML(capitalizeAgentName(agent.name)) + '</span>';
        html += '<span class="' + agentStatusClass + '">' + agentStatusText + '</span>';
        html += '</div>';
        if (agent.task) {
          html += '<div class="proj-live-card-task">' + escapeHTML(agent.task) + '</div>';
        }
        if (spawnElapsed) {
          html += '<div class="proj-live-card-elapsed">' + spawnElapsed + '</div>';
        }
        html += '</div>';
      }

      html += '</div>'; // end agents
    }

    // Activity timeline
    if (activityLog.length > 0) {
      html += '<div class="proj-live-timeline">';
      html += '<div class="proj-live-timeline-label">Recent Activity</div>';

      for (var j = 0; j < activityLog.length; j++) {
        var entry = activityLog[j];
        html += '<div class="proj-live-timeline-entry">';
        html += '<span class="proj-live-timeline-time">' + formatLogTime(entry.time) + '</span>';
        html += '<span class="proj-live-timeline-desc">' + escapeHTML(entry.desc) + '</span>';
        html += '</div>';
      }

      html += '</div>'; // end timeline
    }

    html += '</div>'; // end section

    container.innerHTML = html;
  }

  window.updateLiveProjects = updateLiveProjects;
})();
