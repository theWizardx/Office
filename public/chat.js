// Chat Module - Real-time activity feed of WebSocket events (chat bubbles)

(function () {
  // --- State ---

  var messages = [];
  var filters = { tools: true, agents: true, idle: true };
  var autoScroll = true;
  var messageId = 0;

  // --- DOM Refs ---

  var feed = null;
  var emptyEl = null;
  var jumpBtn = null;
  var clearBtn = null;
  var filterBtns = null;

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

  function getFilterType(msg) {
    if (msg.type === 'tool_start' || msg.type === 'tool_end') return 'tools';
    if (msg.type === 'task_create' || msg.type === 'task_update') return 'tools';
    if (msg.type === 'agent_spawn' || msg.type === 'agent_complete') return 'agents';
    if (msg.type === 'team_create' || msg.type === 'team_create_done' || msg.type === 'agent_message') return 'agents';
    if (msg.type === 'idle') return 'idle';
    return 'tools';
  }

  // --- Create Bubble ---

  function createBubble(msg) {
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-' + msg.type;
    bubble.setAttribute('data-msg-id', msg.id);
    bubble.setAttribute('data-filter-type', getFilterType(msg));

    var icon = '';
    var label = '';
    var body = '';

    switch (msg.type) {
      case 'tool_start':
        icon = '<span class="chat-bubble-icon chat-icon-tool">\uD83D\uDD27</span>';
        label = 'Tool: ' + escapeHTML(msg.tool || 'unknown');
        body = msg.description ? '<div class="chat-bubble-body">' + escapeHTML(msg.description) + '</div>' : '';
        bubble.classList.add('chat-bubble-pending');
        break;
      case 'agent_spawn':
        icon = '<span class="chat-bubble-icon chat-icon-agent">\uD83E\uDD16</span>';
        label = 'Agent: ' + escapeHTML(msg.name || 'agent');
        body = msg.task ? '<div class="chat-bubble-body">' + escapeHTML(msg.task) + '</div>' : '';
        bubble.classList.add('chat-bubble-pending');
        break;
      case 'team_create':
        icon = '<span class="chat-bubble-icon chat-icon-team">\uD83C\uDFE2</span>';
        label = 'Team: ' + escapeHTML(msg.name || 'unknown');
        break;
      case 'agent_message':
        icon = '<span class="chat-bubble-icon chat-icon-message">\u2709\uFE0F</span>';
        label = escapeHTML(msg.from || 'claude') + ' \u2192 ' + escapeHTML(msg.to || '?');
        body = msg.content ? '<div class="chat-bubble-body">' + escapeHTML(msg.content) + '</div>' : '';
        break;
      case 'task_create':
        icon = '<span class="chat-bubble-icon chat-icon-task">\uD83D\uDCCB</span>';
        label = 'New Task';
        body = msg.subject ? '<div class="chat-bubble-body">' + escapeHTML(msg.subject) + '</div>' : '';
        break;
      case 'task_update':
        icon = '<span class="chat-bubble-icon chat-icon-task">\uD83D\uDCCB</span>';
        label = 'Task #' + escapeHTML(String(msg.taskId || '?')) + ' \u2192 ' + escapeHTML(msg.status || 'updated');
        body = msg.owner ? '<div class="chat-bubble-body">Owner: ' + escapeHTML(msg.owner) + '</div>' : '';
        break;
      case 'idle':
        icon = '<span class="chat-bubble-icon chat-icon-idle">\uD83D\uDCA4</span>';
        label = 'Idle';
        break;
      default:
        label = escapeHTML(msg.type);
        break;
    }

    var statusBadge = '';
    if (msg.type === 'tool_start' || msg.type === 'agent_spawn') {
      statusBadge = '<span class="chat-bubble-status">' + (msg.completed ? '\u2713' : '\u2026') + '</span>';
    }

    bubble.innerHTML =
      '<div class="chat-bubble-header">' +
        icon +
        '<span class="chat-bubble-label">' + label + '</span>' +
        statusBadge +
        '<span class="chat-bubble-time">' + formatTime(msg.timestamp) + '</span>' +
      '</div>' +
      body;

    return bubble;
  }

  // --- Update Bubble ---

  function updateBubble(msg) {
    var el = feed.querySelector('[data-msg-id="' + msg.id + '"]');
    if (!el) return;

    el.classList.remove('chat-bubble-pending');
    el.classList.add('chat-bubble-completed');

    var statusEl = el.querySelector('.chat-bubble-status');
    if (statusEl) {
      statusEl.textContent = '\u2713';
    }
  }

  // --- Add Message ---

  function addMessage(event) {
    if (!feed) return;

    if (event.type === 'clear') {
      clearFeed();
      return;
    }

    // For tool_end and agent_complete, find and update the matching pending message
    if (event.type === 'tool_end') {
      for (var i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === 'tool_start' && !messages[i].completed &&
            messages[i].tool === (event.tool || null)) {
          messages[i].completed = true;
          updateBubble(messages[i]);
          return;
        }
      }
      // No matching start found - just ignore
      return;
    }

    if (event.type === 'agent_complete') {
      var lowerName = (event.name || '').toLowerCase();
      for (var j = messages.length - 1; j >= 0; j--) {
        if (messages[j].type === 'agent_spawn' && !messages[j].completed) {
          var msgName = (messages[j].name || '').toLowerCase();
          if (msgName === lowerName || (!event.name && !messages[j].name)) {
            messages[j].completed = true;
            updateBubble(messages[j]);
            return;
          }
        }
      }
      // Fallback: mark oldest uncompleted agent
      for (var k = 0; k < messages.length; k++) {
        if (messages[k].type === 'agent_spawn' && !messages[k].completed) {
          messages[k].completed = true;
          updateBubble(messages[k]);
          return;
        }
      }
      return;
    }

    // Create new message
    messageId++;
    var msg = {
      id: messageId,
      type: event.type,
      tool: event.tool || null,
      name: event.name || null,
      task: event.task || null,
      description: event.description || null,
      from: event.from || null,
      to: event.to || null,
      content: event.content || null,
      subject: event.subject || null,
      taskId: event.taskId || null,
      status: event.status || null,
      owner: event.owner || null,
      timestamp: event.timestamp || Date.now(),
      completed: false
    };

    messages.push(msg);

    // Hide empty placeholder
    if (emptyEl) {
      emptyEl.style.display = 'none';
    }

    // Create and append bubble
    var bubble = createBubble(msg);

    // Check if the bubble should be hidden by filters
    var filterType = getFilterType(msg);
    if (!filters[filterType]) {
      bubble.style.display = 'none';
    }

    feed.appendChild(bubble);

    // Auto-scroll
    if (autoScroll) {
      scrollToBottom();
    }
  }

  // --- Scroll Management ---

  function scrollToBottom() {
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  }

  function handleScroll() {
    if (!feed) return;

    var distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    autoScroll = distanceFromBottom < 40;

    if (jumpBtn) {
      if (autoScroll) {
        jumpBtn.classList.remove('visible');
      } else {
        jumpBtn.classList.add('visible');
      }
    }
  }

  // --- Filters ---

  function applyFilters() {
    if (!feed) return;

    var bubbles = feed.querySelectorAll('.chat-bubble');
    var anyVisible = false;

    for (var i = 0; i < bubbles.length; i++) {
      var filterType = bubbles[i].getAttribute('data-filter-type');
      if (filters[filterType]) {
        bubbles[i].style.display = '';
        anyVisible = true;
      } else {
        bubbles[i].style.display = 'none';
      }
    }

    if (emptyEl) {
      emptyEl.style.display = messages.length === 0 ? '' : 'none';
    }

    if (autoScroll) {
      scrollToBottom();
    }
  }

  function toggleFilter(filterName) {
    filters[filterName] = !filters[filterName];
    applyFilters();
  }

  // --- Clear Feed ---

  function clearFeed() {
    messages.length = 0;
    messageId = 0;

    if (feed) {
      // Remove all bubble elements
      var bubbles = feed.querySelectorAll('.chat-bubble');
      for (var i = 0; i < bubbles.length; i++) {
        bubbles[i].remove();
      }
    }

    if (emptyEl) {
      emptyEl.style.display = '';
    }

    autoScroll = true;
    if (jumpBtn) {
      jumpBtn.classList.remove('visible');
    }
  }

  // --- Init ---

  function initChat() {
    feed = document.getElementById('chat-feed');
    emptyEl = document.getElementById('chat-empty');
    jumpBtn = document.getElementById('chat-jump-btn');
    clearBtn = document.getElementById('chat-clear-btn');
    filterBtns = document.querySelectorAll('.chat-filter-btn');

    if (!feed) return;

    // Scroll listener
    feed.addEventListener('scroll', handleScroll);

    // Jump to bottom button
    if (jumpBtn) {
      jumpBtn.addEventListener('click', function () {
        autoScroll = true;
        scrollToBottom();
        jumpBtn.classList.remove('visible');
      });
    }

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener('click', clearFeed);
    }

    // Filter toggles
    for (var i = 0; i < filterBtns.length; i++) {
      filterBtns[i].addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var filterName = btn.getAttribute('data-filter');
        if (!filterName) return;

        toggleFilter(filterName);
        btn.classList.toggle('active', filters[filterName]);
      });
    }
  }

  // --- Exposed API ---

  window.ChatAPI = {
    addMessage: function (event) {
      addMessage(event);
    },
    initChat: function () {
      initChat();
    },
    clearFeed: function () {
      clearFeed();
    }
  };

  // Expose init globally (same pattern as other modules)
  window.initChat = initChat;
})();
