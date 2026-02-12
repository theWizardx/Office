// Memory Module - Browse and inspect Claude's persistent memory files

(function () {
  // --- State ---

  var files = [];
  var selectedFile = null;
  var claudeMd = null;
  var knowledgeCards = [];
  var totalLines = 0;
  var maxLines = 200;
  var refreshInterval = null;
  var lastFileListHash = '';
  var isEditing = false;
  var rawContent = '';  // raw file content for editing

  // --- DOM Refs ---

  var toolbar = null;
  var viewer = null;
  var viewerEmpty = null;
  var cardsContainer = null;
  var cardsEmpty = null;
  var gaugeBar = null;
  var gaugeLabel = null;
  var fileInfo = null;

  // --- Helpers ---

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + h + ':' + m;
  }

  function hashFileList(fileArr) {
    var parts = [];
    for (var i = 0; i < fileArr.length; i++) {
      parts.push(fileArr[i].name + ':' + fileArr[i].size + ':' + fileArr[i].modified);
    }
    return parts.join('|');
  }

  // --- Basic Markdown Rendering ---

  function renderMarkdown(text) {
    if (!text) return '';

    var lines = text.split('\n');
    var html = [];
    var inCodeBlock = false;
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Code block toggle
      if (line.indexOf('```') === 0) {
        if (inCodeBlock) {
          html.push('</code></pre>');
          inCodeBlock = false;
        } else {
          if (inList) {
            html.push('</ul>');
            inList = false;
          }
          html.push('<pre class="memory-code-block"><code>');
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        html.push(escapeHTML(line) + '\n');
        continue;
      }

      // Close list if line is not a list item
      var trimmed = line.replace(/^\s+/, '');
      var isListItem = trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0;
      if (inList && !isListItem && trimmed !== '') {
        html.push('</ul>');
        inList = false;
      }

      // Headings
      if (trimmed.indexOf('### ') === 0) {
        html.push('<div class="memory-md-h3">' + applyInline(escapeHTML(trimmed.substring(4))) + '</div>');
        continue;
      }
      if (trimmed.indexOf('## ') === 0) {
        html.push('<div class="memory-md-h2">' + applyInline(escapeHTML(trimmed.substring(3))) + '</div>');
        continue;
      }
      if (trimmed.indexOf('# ') === 0) {
        html.push('<div class="memory-md-h1">' + applyInline(escapeHTML(trimmed.substring(2))) + '</div>');
        continue;
      }

      // List items
      if (isListItem) {
        if (!inList) {
          html.push('<ul class="memory-md-list">');
          inList = true;
        }
        var itemText = trimmed.substring(2);
        html.push('<li>' + applyInline(escapeHTML(itemText)) + '</li>');
        continue;
      }

      // Blank line
      if (trimmed === '') {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        html.push('<div class="memory-md-blank"></div>');
        continue;
      }

      // Normal paragraph
      html.push('<div class="memory-md-line">' + applyInline(escapeHTML(line)) + '</div>');
    }

    // Close open blocks
    if (inCodeBlock) {
      html.push('</code></pre>');
    }
    if (inList) {
      html.push('</ul>');
    }

    return html.join('\n');
  }

  function applyInline(escaped) {
    // Bold: **text**
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code: `text`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="memory-inline-code">$1</code>');
    return escaped;
  }

  // --- Knowledge Cards (from MEMORY.md) ---

  function parseKnowledgeCards(content) {
    if (!content) return [];

    var cards = [];
    var sections = content.split(/^## /m);

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i].replace(/^\s+|\s+$/g, '');
      if (!section) continue;

      var newlineIdx = section.indexOf('\n');
      var title;
      var body;

      if (newlineIdx === -1) {
        title = section;
        body = '';
      } else {
        title = section.substring(0, newlineIdx).replace(/^\s+|\s+$/g, '');
        body = section.substring(newlineIdx + 1).replace(/^\s+|\s+$/g, '');
      }

      // Skip the first section if it looks like front matter before any heading
      if (i === 0 && content.indexOf('## ') !== 0) {
        // This is content before the first ## heading
        // Only include if it has meaningful content
        if (body || title.length > 2) {
          cards.push({ title: title || 'Overview', body: body || title });
        }
        continue;
      }

      if (title) {
        cards.push({ title: title, body: body });
      }
    }

    return cards;
  }

  function renderCards() {
    if (!cardsContainer) return;

    cardsContainer.innerHTML = '';

    if (knowledgeCards.length === 0) {
      if (cardsEmpty) cardsEmpty.style.display = '';
      return;
    }

    if (cardsEmpty) cardsEmpty.style.display = 'none';

    for (var i = 0; i < knowledgeCards.length; i++) {
      var card = knowledgeCards[i];
      var el = document.createElement('div');
      el.className = 'memory-card';

      el.innerHTML =
        '<div class="memory-card-title">' + escapeHTML(card.title) + '</div>' +
        '<div class="memory-card-body">' + renderMarkdown(card.body) + '</div>';

      cardsContainer.appendChild(el);
    }
  }

  // --- Gauge ---

  function updateGauge() {
    var pct = Math.min(100, Math.round((totalLines / maxLines) * 100));

    if (gaugeBar) {
      gaugeBar.style.width = pct + '%';

      // Color based on usage
      if (pct < 50) {
        gaugeBar.className = 'memory-gauge-fill memory-gauge-low';
      } else if (pct < 80) {
        gaugeBar.className = 'memory-gauge-fill memory-gauge-mid';
      } else {
        gaugeBar.className = 'memory-gauge-fill memory-gauge-high';
      }
    }

    if (gaugeLabel) {
      gaugeLabel.textContent = totalLines + ' / ' + maxLines + ' lines (' + pct + '%)';
    }
  }

  function fetchLineCounts() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/memory/lines');
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          totalLines = data.totalLines || 0;
          maxLines = data.maxLines || 200;
          updateGauge();
          renderLineBreakdown(data.files || []);
        } catch (e) {}
      }
    };
    xhr.onerror = function () {};
    xhr.send();
  }

  function renderLineBreakdown(lineFiles) {
    var panel = document.querySelector('.memory-gauge-panel');
    if (!panel) return;

    // Remove old breakdown if any
    var old = panel.querySelector('.memory-gauge-breakdown');
    if (old) old.remove();
    var oldDiv = panel.querySelector('.memory-gauge-divider');
    if (oldDiv) oldDiv.remove();
    var oldTotal = panel.querySelector('.memory-gauge-total');
    if (oldTotal) oldTotal.remove();

    if (lineFiles.length === 0) return;

    var divider = document.createElement('div');
    divider.className = 'memory-gauge-divider';
    panel.appendChild(divider);

    var breakdown = document.createElement('div');
    breakdown.className = 'memory-gauge-breakdown';

    for (var i = 0; i < lineFiles.length; i++) {
      var item = document.createElement('div');
      item.className = 'memory-gauge-item';

      var nameEl = document.createElement('span');
      nameEl.className = 'memory-gauge-item-name';
      nameEl.textContent = lineFiles[i].name;
      nameEl.title = lineFiles[i].path;

      var countEl = document.createElement('span');
      countEl.className = 'memory-gauge-item-count';
      countEl.textContent = lineFiles[i].lines + ' lines';

      item.appendChild(nameEl);
      item.appendChild(countEl);
      breakdown.appendChild(item);
    }

    panel.appendChild(breakdown);

    // Total row
    var totalDiv = document.createElement('div');
    totalDiv.className = 'memory-gauge-divider';
    panel.appendChild(totalDiv);

    var totalRow = document.createElement('div');
    totalRow.className = 'memory-gauge-total';
    var totalLabel = document.createElement('span');
    totalLabel.className = 'memory-gauge-total-label';
    totalLabel.textContent = 'Total';
    var totalCount = document.createElement('span');
    totalCount.className = 'memory-gauge-total-count';
    totalCount.textContent = totalLines + ' / ' + maxLines;
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(totalCount);
    panel.appendChild(totalRow);
  }

  // --- Toolbar ---

  function renderToolbar() {
    if (!toolbar) return;
    toolbar.innerHTML = '';

    if (files.length === 0) return;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var btn = document.createElement('button');
      btn.className = 'memory-file-btn' + (selectedFile && selectedFile.path === file.path ? ' active' : '');
      btn.textContent = file.name;
      btn.setAttribute('data-path', file.path);
      btn.addEventListener('click', function (e) {
        var path = e.currentTarget.getAttribute('data-path');
        selectFile(path);
      });
      toolbar.appendChild(btn);
    }
  }

  // --- File Selection ---

  function selectFile(path) {
    // Find the file in our list
    var file = null;
    for (var i = 0; i < files.length; i++) {
      if (files[i].path === path) {
        file = files[i];
        break;
      }
    }
    if (!file) return;

    selectedFile = file;
    renderToolbar();

    // Show loading state
    if (viewer) {
      viewer.innerHTML = '<div class="memory-loading">Loading...</div>';
    }
    if (viewerEmpty) viewerEmpty.style.display = 'none';

    // Fetch file content
    fetchFileContent(file.path);
  }

  function fetchFileContent(path) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/memory/file?path=' + encodeURIComponent(path));
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          displayFileContent(data);
        } catch (e) {
          showError('Failed to parse file content');
        }
      } else {
        showError('Failed to load file (HTTP ' + xhr.status + ')');
      }
    };
    xhr.onerror = function () {
      showError('Network error loading file');
    };
    xhr.send();
  }

  function displayFileContent(data) {
    if (!viewer) return;

    var content = data.content || '';
    rawContent = content;
    isEditing = false;

    viewer.innerHTML = '<div class="memory-file-content">' + renderMarkdown(content) + '</div>';

    // Update knowledge cards from this file's content
    knowledgeCards = parseKnowledgeCards(content);
    renderCards();

    if (fileInfo) {
      var name = data.name || (selectedFile ? selectedFile.name : '');
      var modified = data.modified ? formatDate(data.modified) : '';
      fileInfo.innerHTML = '';

      var infoText = document.createElement('span');
      infoText.textContent = name + (modified ? '  |  Modified: ' + modified : '');
      fileInfo.appendChild(infoText);

      var spacer = document.createElement('span');
      spacer.className = 'memory-edit-toolbar-spacer';
      fileInfo.appendChild(spacer);

      var saveStatus = document.createElement('span');
      saveStatus.className = 'memory-save-status';
      saveStatus.id = 'memory-save-status';
      fileInfo.appendChild(saveStatus);

      var editBtn = document.createElement('button');
      editBtn.className = 'memory-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () {
        enterEditMode();
      });
      fileInfo.appendChild(editBtn);
    }
  }

  function enterEditMode() {
    if (!viewer || !selectedFile) return;
    isEditing = true;

    viewer.innerHTML = '';

    var textarea = document.createElement('textarea');
    textarea.className = 'memory-editor';
    textarea.value = rawContent;
    textarea.id = 'memory-edit-textarea';
    viewer.appendChild(textarea);

    // Update file-info bar with save/cancel buttons
    if (fileInfo) {
      var name = selectedFile ? selectedFile.name : '';
      fileInfo.innerHTML = '';

      var infoText = document.createElement('span');
      infoText.textContent = 'Editing: ' + name;
      infoText.style.color = '#3b82f6';
      fileInfo.appendChild(infoText);

      var spacer = document.createElement('span');
      spacer.className = 'memory-edit-toolbar-spacer';
      fileInfo.appendChild(spacer);

      var saveStatus = document.createElement('span');
      saveStatus.className = 'memory-save-status';
      saveStatus.id = 'memory-save-status';
      fileInfo.appendChild(saveStatus);

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'memory-cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () {
        // Re-display without saving
        displayFileContent({ content: rawContent, name: selectedFile.name, modified: selectedFile.modified });
      });
      fileInfo.appendChild(cancelBtn);

      var saveBtn = document.createElement('button');
      saveBtn.className = 'memory-save-btn';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', function () {
        saveFile();
      });
      fileInfo.appendChild(saveBtn);
    }

    textarea.focus();
  }

  function saveFile() {
    if (!selectedFile) return;
    var textarea = document.getElementById('memory-edit-textarea');
    if (!textarea) return;

    var newContent = textarea.value;
    var statusEl = document.getElementById('memory-save-status');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/memory/file');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      if (xhr.status === 200) {
        rawContent = newContent;
        if (statusEl) {
          statusEl.textContent = 'Saved';
          statusEl.classList.add('visible');
          setTimeout(function () { statusEl.classList.remove('visible'); }, 2000);
        }
        // Switch back to view mode with updated content
        displayFileContent({ content: newContent, name: selectedFile.name, modified: new Date().toISOString() });
        // Refresh file list and line counts
        fetchFileList();
        fetchLineCounts();
      } else {
        if (statusEl) {
          statusEl.textContent = 'Save failed';
          statusEl.style.color = '#ef4444';
          statusEl.classList.add('visible');
          setTimeout(function () { statusEl.classList.remove('visible'); statusEl.style.color = ''; }, 3000);
        }
      }
    };
    xhr.onerror = function () {
      if (statusEl) {
        statusEl.textContent = 'Network error';
        statusEl.style.color = '#ef4444';
        statusEl.classList.add('visible');
      }
    };
    xhr.send(JSON.stringify({ path: selectedFile.path, content: newContent }));
  }

  function showError(msg) {
    if (viewer) {
      viewer.innerHTML = '<div class="memory-error">' + escapeHTML(msg) + '</div>';
    }
  }

  // --- Fetchers ---

  function fetchFileList() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/memory/files');
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          var newFiles = Array.isArray(data) ? data : [];
          var newHash = hashFileList(newFiles);

          if (newHash !== lastFileListHash) {
            lastFileListHash = newHash;
            files = newFiles;

            renderToolbar();
            fetchLineCounts();

            // If no file selected, auto-select best MEMORY.md
            if (!selectedFile && files.length > 0) {
              var bestIdx = -1;
              // Prefer MEMORY.md from the current project (claude-office-viz)
              for (var j = 0; j < files.length; j++) {
                if (files[j].path.indexOf('claude-office-viz') !== -1 && files[j].name.indexOf('MEMORY.md') === 0) {
                  bestIdx = j;
                  break;
                }
              }
              // Fallback: any file whose name starts with MEMORY.md
              if (bestIdx === -1) {
                for (var k = 0; k < files.length; k++) {
                  if (files[k].name.indexOf('MEMORY.md') === 0) {
                    bestIdx = k;
                    break;
                  }
                }
              }
              selectFile(files[bestIdx >= 0 ? bestIdx : 0].path);
            }
          }
        } catch (e) {
          // Silently ignore parse errors on refresh
        }
      }
    };
    xhr.onerror = function () {
      // Network error on refresh - don't crash
    };
    xhr.send();
  }

  function fetchClaudeMd() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/memory/claude-md');
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          claudeMd = data.content || null;

          if (claudeMd) {
            knowledgeCards = parseKnowledgeCards(claudeMd);
          } else {
            knowledgeCards = [];
          }

          renderCards();
        } catch (e) {
          // Ignore parse errors
        }
      }
    };
    xhr.onerror = function () {
      // Network error - don't crash
    };
    xhr.send();
  }

  // --- Init ---

  function initMemory() {
    toolbar = document.getElementById('memory-toolbar');
    viewer = document.getElementById('memory-viewer');
    viewerEmpty = document.getElementById('memory-viewer-empty');
    cardsContainer = document.getElementById('memory-cards');
    cardsEmpty = document.getElementById('memory-cards-empty');
    gaugeBar = document.getElementById('memory-gauge-bar');
    gaugeLabel = document.getElementById('memory-gauge-label');
    fileInfo = document.getElementById('memory-file-info');

    // Initial fetch
    fetchFileList();

    // Auto-refresh every 30 seconds
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(function () {
      fetchFileList();
    }, 30000);
  }

  // --- Exposed API ---

  window.MemoryAPI = {
    initMemory: function () {
      initMemory();
    },
    refresh: function () {
      fetchFileList();
      fetchLineCounts();
    }
  };

  window.initMemory = initMemory;
})();
