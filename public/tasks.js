// Tasks Module - Kanban board with task CRUD (localStorage)

(function () {
  // --- Constants ---

  var STORAGE_KEY = 'mission-tasks';
  var MONTH_NAMES_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  var COLUMNS = [
    { status: 'todo', title: 'To Do' },
    { status: 'in_progress', title: 'In Progress' },
    { status: 'done', title: 'Done' }
  ];

  // --- Storage ---

  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTasks(tasks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
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
    return MONTH_NAMES_SHORT[d.getMonth()] + ' ' + d.getDate();
  }

  function formatDueDate(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return MONTH_NAMES_SHORT[d.getMonth()] + ' ' + d.getDate();
  }

  function isOverdue(task) {
    if (!task.dueDate || task.status === 'done') return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var parts = task.dueDate.split('-');
    var due = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return due < today;
  }

  function tasksByStatus(tasks, status) {
    var filtered = tasks.filter(function (t) { return t.status === status; });
    if (status === 'done') {
      filtered.sort(function (a, b) {
        return (b.completedAt || '').localeCompare(a.completedAt || '');
      });
    } else {
      filtered.sort(function (a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    }
    return filtered;
  }

  // --- Render ---

  function renderHeader() {
    var header = document.getElementById('tasks-page-header');
    if (!header) return;

    var tasks = loadTasks();
    header.innerHTML =
      '<div class="tasks-header-row">' +
        '<h2 class="tasks-page-title">Tasks <span class="tasks-total-count">' + tasks.length + '</span></h2>' +
        '<button class="tasks-new-btn" id="tasks-new-btn">+ New Task</button>' +
      '</div>';

    document.getElementById('tasks-new-btn').addEventListener('click', function () {
      openModal();
    });
  }

  function renderBoard() {
    var board = document.getElementById('tasks-board');
    if (!board) return;

    var tasks = loadTasks();
    board.innerHTML = '';

    for (var c = 0; c < COLUMNS.length; c++) {
      var col = COLUMNS[c];
      var colTasks = tasksByStatus(tasks, col.status);

      var colDiv = document.createElement('div');
      colDiv.className = 'tasks-column';
      colDiv.setAttribute('data-status', col.status);

      colDiv.innerHTML =
        '<div class="tasks-col-header">' +
          '<span class="tasks-col-dot ' + col.status + '"></span>' +
          '<h3 class="tasks-col-title">' + col.title + '</h3>' +
          '<span class="tasks-col-count">' + colTasks.length + '</span>' +
        '</div>' +
        '<div class="tasks-col-cards" data-status="' + col.status + '"></div>';

      var cardsContainer = colDiv.querySelector('.tasks-col-cards');

      for (var i = 0; i < colTasks.length; i++) {
        var task = colTasks[i];
        var card = document.createElement('div');
        card.className = 'task-card';
        if (isOverdue(task)) {
          card.classList.add('task-overdue');
        }
        card.setAttribute('data-id', task.id);
        card.setAttribute('draggable', 'true');

        var actionsHtml = '';
        if (col.status === 'todo') {
          actionsHtml = '<button class="task-move-btn" data-id="' + task.id + '" data-dir="right" title="Move to In Progress">\u203A</button>';
        } else if (col.status === 'in_progress') {
          actionsHtml =
            '<button class="task-move-btn" data-id="' + task.id + '" data-dir="left" title="Move to To Do">\u2039</button>' +
            '<button class="task-move-btn" data-id="' + task.id + '" data-dir="right" title="Move to Done">\u203A</button>';
        } else {
          actionsHtml = '<button class="task-move-btn" data-id="' + task.id + '" data-dir="left" title="Move to In Progress">\u2039</button>';
        }

        var dueDateHtml = '';
        if (task.dueDate) {
          var overdueClass = isOverdue(task) ? ' task-due-overdue' : '';
          dueDateHtml = '<span class="task-card-due' + overdueClass + '" data-id="' + task.id + '" data-date="' + task.dueDate + '" title="View in Calendar">' + formatDueDate(task.dueDate) + '</span>';
        }

        card.innerHTML =
          '<div class="task-card-top">' +
            '<span class="task-priority ' + task.priority + '">' + capitalize(task.priority) + '</span>' +
            '<button class="task-card-delete" data-id="' + task.id + '">\u00D7</button>' +
          '</div>' +
          '<h4 class="task-card-title">' + escapeHTML(task.title) + '</h4>' +
          (task.description ? '<p class="task-card-desc">' + escapeHTML(task.description) + '</p>' : '') +
          '<div class="task-card-footer">' +
            '<span class="task-card-date">' + formatDate(task.createdAt) + '</span>' +
            dueDateHtml +
            '<div class="task-card-actions">' + actionsHtml + '</div>' +
          '</div>';

        cardsContainer.appendChild(card);
      }

      board.appendChild(colDiv);
    }
  }

  function capitalize(str) {
    if (!str) return '';
    if (str === 'in_progress') return 'In Progress';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function renderAll() {
    renderHeader();
    renderBoard();
  }

  // --- Task Actions ---

  function addTask(title, description, priority, dueDate) {
    var tasks = loadTasks();
    var task = {
      id: generateId(),
      title: title,
      description: description || '',
      status: 'todo',
      priority: priority || 'medium',
      dueDate: dueDate || null,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    tasks.push(task);
    saveTasks(tasks);
    renderAll();

    if (window.MissionEvents) {
      window.MissionEvents.emit('task:created', { task: task });
    }
  }

  function deleteTask(taskId) {
    var tasks = loadTasks();
    var deleted = null;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === taskId) {
        deleted = tasks[i];
        break;
      }
    }
    tasks = tasks.filter(function (t) { return t.id !== taskId; });
    saveTasks(tasks);
    renderAll();

    if (deleted && window.MissionEvents) {
      window.MissionEvents.emit('task:deleted', { taskId: taskId, dueDate: deleted.dueDate });
    }
  }

  function moveTask(taskId, direction) {
    var statusOrder = ['todo', 'in_progress', 'done'];
    var tasks = loadTasks();

    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === taskId) {
        var currentIdx = statusOrder.indexOf(tasks[i].status);
        var newIdx = direction === 'right' ? currentIdx + 1 : currentIdx - 1;
        if (newIdx < 0 || newIdx >= statusOrder.length) break;

        var previousDueDate = tasks[i].dueDate;
        tasks[i].status = statusOrder[newIdx];

        if (tasks[i].status === 'done') {
          tasks[i].completedAt = new Date().toISOString();
        } else {
          tasks[i].completedAt = null;
        }

        saveTasks(tasks);
        renderAll();

        if (window.MissionEvents) {
          window.MissionEvents.emit('task:updated', { task: tasks[i], previousDueDate: previousDueDate });
        }
        return;
      }
    }

    saveTasks(tasks);
    renderAll();
  }

  // --- Modal ---

  var modalEl = null;
  var selectedPriority = 'medium';

  function createModal() {
    modalEl = document.createElement('div');
    modalEl.className = 'tasks-modal-overlay';
    modalEl.id = 'tasks-modal';
    modalEl.style.display = 'none';

    modalEl.innerHTML =
      '<div class="tasks-modal">' +
        '<h3 class="tasks-modal-title">New Task</h3>' +
        '<input class="tasks-modal-input" id="new-task-title" placeholder="Task title..." />' +
        '<textarea class="tasks-modal-textarea" id="new-task-desc" placeholder="Description (optional)..." rows="3"></textarea>' +
        '<div class="tasks-modal-row">' +
          '<label class="tasks-modal-label">Due Date</label>' +
          '<input type="date" class="tasks-modal-date" id="new-task-date" />' +
        '</div>' +
        '<div class="tasks-modal-row">' +
          '<label class="tasks-modal-label">Priority</label>' +
          '<div class="tasks-priority-btns">' +
            '<button class="priority-btn low" data-priority="low">Low</button>' +
            '<button class="priority-btn medium active" data-priority="medium">Medium</button>' +
            '<button class="priority-btn high" data-priority="high">High</button>' +
          '</div>' +
        '</div>' +
        '<div class="tasks-modal-actions">' +
          '<button class="tasks-modal-cancel" id="tasks-cancel-btn">Cancel</button>' +
          '<button class="tasks-modal-save" id="tasks-save-btn">Add Task</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modalEl);

    // Priority toggle
    var priorityBtns = modalEl.querySelectorAll('.priority-btn');
    for (var i = 0; i < priorityBtns.length; i++) {
      priorityBtns[i].addEventListener('click', function (e) {
        selectedPriority = e.target.getAttribute('data-priority');
        var all = modalEl.querySelectorAll('.priority-btn');
        for (var j = 0; j < all.length; j++) {
          all[j].classList.remove('active');
        }
        e.target.classList.add('active');
      });
    }

    // Cancel
    document.getElementById('tasks-cancel-btn').addEventListener('click', closeModal);

    // Save
    document.getElementById('tasks-save-btn').addEventListener('click', handleSave);

    // Enter key in title
    document.getElementById('new-task-title').addEventListener('keydown', function (e) {
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

  function openModal(prefillDate) {
    if (!modalEl) createModal();
    selectedPriority = 'medium';

    // Reset form
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-desc').value = '';
    document.getElementById('new-task-date').value = prefillDate || '';
    var all = modalEl.querySelectorAll('.priority-btn');
    for (var j = 0; j < all.length; j++) {
      all[j].classList.remove('active');
      if (all[j].getAttribute('data-priority') === 'medium') {
        all[j].classList.add('active');
      }
    }

    modalEl.style.display = '';
    document.getElementById('new-task-title').focus();
  }

  function closeModal() {
    if (modalEl) {
      modalEl.style.display = 'none';
    }
  }

  function handleSave() {
    var titleInput = document.getElementById('new-task-title');
    var descInput = document.getElementById('new-task-desc');
    var dateInput = document.getElementById('new-task-date');
    var title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    var description = descInput.value.trim();
    var dueDate = dateInput.value || null;
    addTask(title, description, selectedPriority, dueDate);
    closeModal();
  }

  // --- Event Delegation on Board ---

  function wireBoardEvents() {
    var board = document.getElementById('tasks-board');
    if (!board) return;

    board.addEventListener('click', function (e) {
      // Delete button
      var deleteBtn = e.target.closest('.task-card-delete');
      if (deleteBtn) {
        var taskId = deleteBtn.getAttribute('data-id');
        if (taskId) deleteTask(taskId);
        return;
      }

      // Move button
      var moveBtn = e.target.closest('.task-move-btn');
      if (moveBtn) {
        var id = moveBtn.getAttribute('data-id');
        var dir = moveBtn.getAttribute('data-dir');
        if (id && dir) moveTask(id, dir);
        return;
      }

      // Due date click -> navigate to calendar
      var dueEl = e.target.closest('.task-card-due');
      if (dueEl) {
        var dueDate = dueEl.getAttribute('data-date');
        if (dueDate && window.MissionEvents) {
          window.MissionEvents.emit('navigate:calendar', { dueDate: dueDate });
        }
        return;
      }
    });
  }

  // --- Cross-module Event Listeners ---

  function wireEventBus() {
    if (!window.MissionEvents) return;

    // When calendar creates a kanban task
    window.MissionEvents.on('calendar:create-kanban-task', function (detail) {
      addTask(detail.title, '', 'medium', detail.dueDate);
    });

    // When calendar requests board refresh
    window.MissionEvents.on('task:refresh', function () {
      renderAll();
    });
  }

  // --- Exposed API ---

  window.TasksAPI = {
    refresh: function () {
      renderAll();
    },
    getTaskById: function (taskId) {
      var tasks = loadTasks();
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === taskId) return tasks[i];
      }
      return null;
    },
    getTasksForDate: function (dateStr) {
      var tasks = loadTasks();
      return tasks.filter(function (t) { return t.dueDate === dateStr; });
    },
    highlightTask: function (taskId) {
      var card = document.querySelector('.task-card[data-id="' + taskId + '"]');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('task-highlight');
        setTimeout(function () {
          card.classList.remove('task-highlight');
        }, 2000);
      }
    },
    openModalWithDate: function (dateStr) {
      openModal(dateStr);
    }
  };

  // --- Init ---

  function initTasksBoard() {
    renderAll();
    wireBoardEvents();
    wireEventBus();
  }

  // Expose globally
  window.initTasksBoard = initTasksBoard;
})();
