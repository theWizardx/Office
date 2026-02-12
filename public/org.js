// Dynamic Org Chart - Real-time agent visualization

const AGENT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'];

function createRobotIcon() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="6" width="18" height="14" rx="3" />
    <rect x="7" y="10" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
    <rect x="14" y="10" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
    <line x1="9" y1="16" x2="15" y2="16" stroke-linecap="round" />
    <line x1="12" y1="3" x2="12" y2="6" />
    <circle cx="12" cy="2.5" r="1" fill="currentColor" stroke="none" />
  </svg>`;
}

function createPersonIcon() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke-linecap="round" />
  </svg>`;
}

function capitalizeAgentName(str) {
  return str.split(/[-_\s]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function createCard(node) {
  const card = document.createElement('div');
  card.className = 'org-card';
  card.style.setProperty('--card-color', node.color);

  // Header: icon + name/title + status
  const header = document.createElement('div');
  header.className = 'org-card-header';

  const avatar = document.createElement('div');
  avatar.className = 'org-card-avatar';
  avatar.innerHTML = node.iconType === 'person' ? createPersonIcon() : createRobotIcon();

  const identity = document.createElement('div');
  identity.className = 'org-card-identity';
  identity.innerHTML = `
    <h3 class="org-card-name">${node.name}</h3>
    <p class="org-card-role">${node.title}</p>
  `;

  const statusDot = document.createElement('span');
  statusDot.className = `org-status-dot ${node.status}`;

  header.appendChild(avatar);
  header.appendChild(identity);
  header.appendChild(statusDot);
  card.appendChild(header);

  // Details: model + cost + current task
  if (node.model || node.cost || node.currentTask) {
    const details = document.createElement('div');
    details.className = 'org-card-details';

    if (node.model) {
      const model = document.createElement('div');
      model.className = 'org-card-model';
      model.textContent = node.model;
      details.appendChild(model);
    }

    if (node.cost) {
      const cost = document.createElement('div');
      cost.className = 'org-card-cost';
      cost.innerHTML = `<span class="cost-arrow">\u21DD</span> ${node.cost}`;
      details.appendChild(cost);
    }

    if (node.currentTask) {
      const task = document.createElement('div');
      task.className = 'org-card-task';
      task.textContent = node.currentTask;
      details.appendChild(task);
    }

    card.appendChild(details);
  }

  // Tags
  if (node.tags && node.tags.length > 0) {
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'org-card-tags';

    const max = node.maxVisibleTags || node.tags.length;
    const visibleTags = node.tags.slice(0, max);
    const remaining = node.tags.length - max;

    for (const tag of visibleTags) {
      const tagEl = document.createElement('span');
      tagEl.className = 'org-tag';
      tagEl.textContent = tag;
      tagsContainer.appendChild(tagEl);
    }

    if (remaining > 0) {
      const more = document.createElement('span');
      more.className = 'org-tag-more';
      more.textContent = `+${remaining}`;
      tagsContainer.appendChild(more);
    }

    card.appendChild(tagsContainer);
  }

  return card;
}

function renderOrgTree(node, container) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'org-node';

  const card = createCard(node);
  nodeEl.appendChild(card);

  if (node.children && node.children.length > 0) {
    // Connector line + chevron
    const connector = document.createElement('div');
    connector.className = 'org-connector';
    connector.innerHTML = '<div class="org-connector-line"></div><div class="org-connector-chevron">\u25BE</div>';
    nodeEl.appendChild(connector);

    if (node.children.length === 1) {
      renderOrgTree(node.children[0], nodeEl);
    } else {
      // Multiple children row
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'org-children';

      const row = document.createElement('div');
      row.className = 'org-children-row';

      for (const child of node.children) {
        const childCol = document.createElement('div');
        childCol.className = 'org-child-col';

        const dropLine = document.createElement('div');
        dropLine.className = 'org-drop-line';
        childCol.appendChild(dropLine);

        const childCard = createCard(child);
        childCol.appendChild(childCard);

        row.appendChild(childCol);
      }

      childrenContainer.appendChild(row);
      nodeEl.appendChild(childrenContainer);
    }
  }

  container.appendChild(nodeEl);
}

function updateOrgChart(state) {
  const container = document.getElementById('org-chart-container');
  if (!container) return;

  const isWorking = state.mainAvatar.status === 'working';

  // Build sub-agent children from live state
  const agentChildren = state.agents.map((agent, i) => ({
    id: agent.name,
    name: capitalizeAgentName(agent.name),
    title: agent.task || 'Working...',
    status: agent.status === 'done' ? 'done' : 'working',
    color: AGENT_COLORS[i % AGENT_COLORS.length],
    iconType: 'robot',
    tags: [],
    children: []
  }));

  // Claude - main agent, always present
  const claudeNode = {
    id: 'claude',
    name: 'Claude',
    title: 'Lead Agent',
    model: 'Claude Opus 4.6',
    cost: '$5/$25 per 1M tokens',
    currentTask: isWorking ? (state.mainAvatar.currentTask || 'Working...') : null,
    status: isWorking ? 'working' : 'inactive',
    color: '#F97316',
    iconType: 'robot',
    tags: ['Reasoning', 'Code Generation', 'Task Orchestration', 'Analysis'],
    maxVisibleTags: 4,
    children: agentChildren
  };

  // CEO - always at the top
  const orgData = {
    id: 'ceo',
    name: 'Saar',
    title: 'Chief Executive Officer',
    status: 'online',
    color: '#8B5CF6',
    iconType: 'person',
    tags: ['Vision & Strategy', 'Content Creation', 'Business Development', 'Final Decisions'],
    maxVisibleTags: 4,
    children: [claudeNode]
  };

  container.innerHTML = '';
  renderOrgTree(orgData, container);
}

function initOrgChart() {
  updateOrgChart({
    mainAvatar: { status: 'idle', currentTask: null },
    agents: [],
    disconnected: true,
    eventCount: 0
  });
}
