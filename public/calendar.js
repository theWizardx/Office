// Calendar Module - Monthly calendar with task management (localStorage)

(function () {
  // --- State ---

  var currentYear;
  var currentMonth;
  var selectedDate; // ISO string like '2026-02-11'

  var colorIndex = 0;
  var COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444'];
  var STORAGE_KEY = 'calendar-tasks';
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  var MONTH_NAMES_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  var DAY_NAMES_FULL = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  var PRIORITY_COLORS = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#10B981'
  };

  var STATUS_LABELS = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done'
  };

  // --- Task Storage ---

  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveTasks(tasks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function getTasksForDate(dateStr) {
    var tasks = loadTasks();
    return tasks[dateStr] || [];
  }

  // --- Get kanban tasks for a date via TasksAPI ---

  function getKanbanTasksForDate(dateStr) {
    if (window.TasksAPI && typeof window.TasksAPI.getTasksForDate === 'function') {
      return window.TasksAPI.getTasksForDate(dateStr);
    }
    return [];
  }

  // --- Date Helpers ---

  function toISODate(year, month, day) {
    var m = String(month + 1).padStart(2, '0');
    var d = String(day).padStart(2, '0');
    return year + '-' + m + '-' + d;
  }

  function getTodayISO() {
    var now = new Date();
    return toISODate(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function formatPanelDate(dateStr) {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var dayName = DAY_NAMES_FULL[d.getDay()];
    var monthName = MONTH_NAMES_SHORT[d.getMonth()];
    var day = d.getDate();
    var year = d.getFullYear();
    return dayName + ', ' + monthName + ' ' + day + ', ' + year;
  }

  // --- Build UI ---

  function buildCalendarUI() {
    var container = document.getElementById('cal-container');
    if (!container) return;

    // Header
    var header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML =
      '<button class="cal-nav-btn" id="cal-prev">\u2039</button>' +
      '<h2 class="cal-title" id="cal-title"></h2>' +
      '<button class="cal-nav-btn" id="cal-next">\u203A</button>' +
      '<button class="cal-today-btn" id="cal-today">Today</button>';
    container.appendChild(header);

    // Grid wrapper
    var grid = document.createElement('div');
    grid.className = 'calendar-grid';
    grid.id = 'cal-grid';

    // Day-of-week headers
    for (var i = 0; i < 7; i++) {
      var dayHeader = document.createElement('div');
      dayHeader.className = 'cal-dow';
      dayHeader.textContent = DAY_NAMES[i];
      grid.appendChild(dayHeader);
    }

    container.appendChild(grid);
  }

  // --- Render Calendar Grid ---

  function renderCalendarGrid() {
    var grid = document.getElementById('cal-grid');
    if (!grid) return;

    // Remove existing day cells (keep the 7 dow headers)
    var children = grid.children;
    while (children.length > 7) {
      grid.removeChild(children[7]);
    }

    // Update title
    var titleEl = document.getElementById('cal-title');
    if (titleEl) {
      titleEl.textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;
    }

    var todayISO = getTodayISO();
    var tasks = loadTasks();

    // First day of current month
    var firstDay = new Date(currentYear, currentMonth, 1);
    var startDow = firstDay.getDay(); // 0=Sun

    // Days in current month
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Previous month info
    var prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    var prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    var daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    // Build 42 cells
    for (var i = 0; i < 42; i++) {
      var cell = document.createElement('div');
      cell.className = 'calendar-day';

      var dayNum;
      var dateStr;

      if (i < startDow) {
        // Previous month
        dayNum = daysInPrevMonth - startDow + i + 1;
        dateStr = toISODate(prevYear, prevMonth, dayNum);
        cell.classList.add('other-month');
      } else if (i >= startDow + daysInMonth) {
        // Next month
        var nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
        var nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
        dayNum = i - startDow - daysInMonth + 1;
        dateStr = toISODate(nextYear, nextMonth, dayNum);
        cell.classList.add('other-month');
      } else {
        // Current month
        dayNum = i - startDow + 1;
        dateStr = toISODate(currentYear, currentMonth, dayNum);
      }

      if (dateStr === todayISO) {
        cell.classList.add('today');
      }
      if (dateStr === selectedDate) {
        cell.classList.add('selected');
      }

      cell.setAttribute('data-date', dateStr);

      var numSpan = document.createElement('span');
      numSpan.className = 'cal-day-num';
      numSpan.textContent = dayNum;
      cell.appendChild(numSpan);

      // Calendar task dots
      var dateTasks = tasks[dateStr];
      var kanbanTasks = getKanbanTasksForDate(dateStr);
      var hasDots = (dateTasks && dateTasks.length > 0) || kanbanTasks.length > 0;

      if (hasDots) {
        var dotsDiv = document.createElement('div');
        dotsDiv.className = 'cal-day-dots';

        // Native calendar dots (round)
        if (dateTasks) {
          for (var t = 0; t < dateTasks.length; t++) {
            var dot = document.createElement('span');
            dot.className = 'cal-dot';
            dot.style.background = dateTasks[t].color;
            dotsDiv.appendChild(dot);
          }
        }

        // Kanban task dots (square)
        for (var k = 0; k < kanbanTasks.length; k++) {
          var kdot = document.createElement('span');
          kdot.className = 'cal-dot cal-dot-kanban';
          kdot.style.background = PRIORITY_COLORS[kanbanTasks[k].priority] || '#3B82F6';
          if (kanbanTasks[k].status === 'done') {
            kdot.classList.add('cal-dot-done');
          }
          dotsDiv.appendChild(kdot);
        }

        cell.appendChild(dotsDiv);
      }

      cell.addEventListener('click', handleDayClick);
      grid.appendChild(cell);
    }
  }

  function handleDayClick(e) {
    var cell = e.currentTarget;
    var dateStr = cell.getAttribute('data-date');
    if (!dateStr) return;

    selectedDate = dateStr;

    // If clicked day is in another month, navigate to that month
    var parts = dateStr.split('-');
    var clickedYear = parseInt(parts[0]);
    var clickedMonth = parseInt(parts[1]) - 1;
    if (clickedYear !== currentYear || clickedMonth !== currentMonth) {
      currentYear = clickedYear;
      currentMonth = clickedMonth;
    }

    renderCalendarGrid();
    renderPanel();
  }

  // --- Render Side Panel ---

  function renderPanel() {
    var panelDate = document.getElementById('panel-date');
    var panelTasks = document.getElementById('panel-tasks');
    if (!panelDate || !panelTasks) return;

    panelDate.textContent = formatPanelDate(selectedDate);

    var calTasks = getTasksForDate(selectedDate);
    var kanbanTasks = getKanbanTasksForDate(selectedDate);

    if (calTasks.length === 0 && kanbanTasks.length === 0) {
      panelTasks.innerHTML = '<div class="panel-empty">No tasks for this day</div>';
      return;
    }

    // Sort calendar tasks by time (tasks without time come last)
    calTasks.sort(function (a, b) {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    var html = '';

    // Kanban tasks section
    if (kanbanTasks.length > 0) {
      html += '<div class="panel-section-label">Board Tasks</div>';
      for (var k = 0; k < kanbanTasks.length; k++) {
        var kt = kanbanTasks[k];
        var statusClass = 'panel-kanban-status-' + kt.status;
        var doneClass = kt.status === 'done' ? ' panel-kanban-done' : '';
        var priorityColor = PRIORITY_COLORS[kt.priority] || '#3B82F6';

        html +=
          '<div class="panel-task-item panel-kanban-item' + doneClass + '" style="border-left-color: ' + priorityColor + '">' +
            '<div class="panel-kanban-row">' +
              '<span class="panel-kanban-badge ' + statusClass + '">' + (STATUS_LABELS[kt.status] || kt.status) + '</span>' +
              '<button class="panel-task-goto" data-task-id="' + kt.id + '" title="View in Board">&#8599;</button>' +
            '</div>' +
            '<span class="panel-task-text">' + escapeHTML(kt.title) + '</span>' +
          '</div>';
      }
    }

    // Calendar tasks section
    if (calTasks.length > 0) {
      if (kanbanTasks.length > 0) {
        html += '<div class="panel-section-label">Calendar Events</div>';
      }
      for (var i = 0; i < calTasks.length; i++) {
        var task = calTasks[i];
        html +=
          '<div class="panel-task-item" style="border-left-color: ' + task.color + '">' +
            '<span class="panel-task-time">' + (task.time || '') + '</span>' +
            '<span class="panel-task-text">' + escapeHTML(task.title) + '</span>' +
            '<button class="panel-task-delete" data-id="' + task.id + '">\u00D7</button>' +
          '</div>';
      }
    }

    panelTasks.innerHTML = html;
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Add Task ---

  function addTask() {
    var input = document.getElementById('task-input');
    var timeInput = document.getElementById('task-time');
    if (!input) return;

    var title = input.value.trim();
    if (!title) return;

    var time = timeInput ? timeInput.value : '';
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    var color = COLORS[colorIndex % COLORS.length];
    colorIndex++;

    var tasks = loadTasks();
    if (!tasks[selectedDate]) {
      tasks[selectedDate] = [];
    }
    tasks[selectedDate].push({ id: id, title: title, time: time, color: color });
    saveTasks(tasks);

    input.value = '';
    if (timeInput) timeInput.value = '';

    renderCalendarGrid();
    renderPanel();
  }

  // --- Delete Task ---

  function deleteTask(taskId) {
    var tasks = loadTasks();
    var dateTasks = tasks[selectedDate];
    if (!dateTasks) return;

    tasks[selectedDate] = dateTasks.filter(function (t) {
      return t.id !== taskId;
    });

    if (tasks[selectedDate].length === 0) {
      delete tasks[selectedDate];
    }

    saveTasks(tasks);
    renderCalendarGrid();
    renderPanel();
  }

  // --- Event Listeners ---

  function wireEventListeners() {
    // Nav buttons
    document.getElementById('cal-prev').addEventListener('click', function () {
      if (currentMonth === 0) {
        currentMonth = 11;
        currentYear--;
      } else {
        currentMonth--;
      }
      renderCalendarGrid();
    });

    document.getElementById('cal-next').addEventListener('click', function () {
      if (currentMonth === 11) {
        currentMonth = 0;
        currentYear++;
      } else {
        currentMonth++;
      }
      renderCalendarGrid();
    });

    document.getElementById('cal-today').addEventListener('click', function () {
      var now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth();
      selectedDate = getTodayISO();
      renderCalendarGrid();
      renderPanel();
    });

    // Add task button
    var addBtn = document.getElementById('task-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', addTask);
    }

    // Enter key in task input
    var taskInput = document.getElementById('task-input');
    if (taskInput) {
      taskInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          addTask();
        }
      });
    }

    // Delete task + goto board (event delegation)
    var panelTasks = document.getElementById('panel-tasks');
    if (panelTasks) {
      panelTasks.addEventListener('click', function (e) {
        // Delete calendar task
        var btn = e.target.closest('.panel-task-delete');
        if (btn) {
          var taskId = btn.getAttribute('data-id');
          if (taskId) {
            deleteTask(taskId);
          }
          return;
        }

        // Navigate to kanban task
        var gotoBtn = e.target.closest('.panel-task-goto');
        if (gotoBtn) {
          var kanbanTaskId = gotoBtn.getAttribute('data-task-id');
          if (kanbanTaskId && window.MissionEvents) {
            window.MissionEvents.emit('navigate:tasks', { taskId: kanbanTaskId });
          }
          return;
        }
      });
    }
  }

  // --- Cross-module Event Listeners ---

  function wireEventBus() {
    if (!window.MissionEvents) return;

    // When a kanban task is created/updated/deleted, refresh calendar
    window.MissionEvents.on('task:created', function () {
      renderCalendarGrid();
      renderPanel();
    });

    window.MissionEvents.on('task:updated', function () {
      renderCalendarGrid();
      renderPanel();
    });

    window.MissionEvents.on('task:deleted', function () {
      renderCalendarGrid();
      renderPanel();
    });
  }

  // --- Exposed API ---

  window.CalendarAPI = {
    refresh: function () {
      renderCalendarGrid();
      renderPanel();
    },
    navigateToDate: function (dateStr) {
      if (!dateStr) return;
      var parts = dateStr.split('-');
      currentYear = parseInt(parts[0]);
      currentMonth = parseInt(parts[1]) - 1;
      selectedDate = dateStr;
      renderCalendarGrid();
      renderPanel();
    }
  };

  // --- Init ---

  function initCalendar() {
    var now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    selectedDate = getTodayISO();

    buildCalendarUI();
    renderCalendarGrid();
    renderPanel();
    wireEventListeners();
    wireEventBus();
  }

  // Expose globally
  window.initCalendar = initCalendar;
})();
