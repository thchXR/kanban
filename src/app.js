const fallbackBoard = {
  id: 'board-main', title: '我的项目看板', icon: '◆', updatedAt: Date.now(),
  columns: [
    { id: 'backlog', title: '待办', cards: [{ id: 'demo-card', title: '欢迎使用看板', description: '拖动卡片到其他列，点击卡片可以编辑。', labels: ['示例'], labelColors: { 示例: 'purple' }, assignee: '', dueDate: null }] },
    { id: 'doing', title: '进行中', cards: [] },
    { id: 'done', title: '已完成', cards: [] },
  ],
};

const invoke = window.__TAURI__?.core?.invoke || (async (name, args = {}) => {
  try {
    const response = await fetch('/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) });
    return response.json();
  } catch {
    const saved = localStorage.getItem('kanban-board');
    const data = saved ? JSON.parse(saved) : structuredClone(fallbackBoard);
    if (name === 'get_board') return data;
    if (name === 'export_board') return 'browser-local-storage';
    if (name === 'update_board_icon') data.icon = args.icon;
    if (name === 'delete_card') data.columns.forEach(column => { column.cards = column.cards.filter(card => card.id !== args.cardId); });
    if (name === 'move_card') {
      const from = data.columns.find(column => column.id === args.fromColumn);
      const to = data.columns.find(column => column.id === args.toColumn);
      const index = from?.cards.findIndex(card => card.id === args.cardId) ?? -1;
      if (from && to && index >= 0) to.cards.push(from.cards.splice(index, 1)[0]);
    }
    if (name === 'create_card') data.columns.find(column => column.id === args.columnId)?.cards.push({ ...args.input, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() });
    if (name === 'update_card') data.columns.flatMap(column => column.cards).forEach(card => { if (card.id === args.cardId) Object.assign(card, args.input, { updatedAt: Date.now() }); });
    localStorage.setItem('kanban-board', JSON.stringify(data));
    return data;
  }
});

const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'slate', 'black'];
const BOARD_ICONS = ['◆', '★', '☀', '⚡', '✓', '🚀', '🎯', '💡', '🔥', '🌿'];
let board;
let editingId = null;
let labelColors = {};
let defaultLabelColor = 'purple';
let iconIndex = 0;
let activeCard = null;
let pointerStart = null;
let pointerMoved = false;
let pointerTarget = null;
let dragGhost = null;
let suppressClick = false;

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match]));
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }
function filteredCards(cards) { const query = $('#search').value.trim().toLowerCase(); return cards.filter(card => !query || [card.title, card.description, card.assignee, ...card.labels].join(' ').toLowerCase().includes(query)); }
function cardHtml(card) { const color = card.labels.length ? card.labelColors?.[card.labels[0]] || 'purple' : ''; return `<article class="card ${color ? `card-${esc(color)}` : ''}" data-id="${esc(card.id)}"><button type="button" class="delete" title="删除">×</button><h3>${esc(card.title)}</h3>${card.description ? `<p>${esc(card.description)}</p>` : ''}<div class="card-meta"><div class="labels">${card.labels.map(label => `<span class="label label-${esc(card.labelColors?.[label] || 'purple')}">${esc(label)}</span>`).join('')}</div><div>${card.assignee ? `<span class="assignee">${esc(card.assignee)}</span>` : ''}${card.dueDate ? `<span class="due"> · ${esc(card.dueDate)}</span>` : ''}</div></div></article>`; }

function render() {
  $('#boardTitle').textContent = board.title;
  $('#iconBtn').textContent = board.icon || '◆';
  const allCards = board.columns.flatMap(column => column.cards);
  $('#stats').innerHTML = `<div class="stat"><strong>${allCards.length}</strong><span>全部任务</span></div><div class="stat"><strong>${board.columns.find(column => column.id === 'done')?.cards.length || 0}</strong><span>已完成</span></div><div class="stat"><strong>${allCards.filter(card => card.assignee).length}</strong><span>已分配</span></div>`;
  $('#board').innerHTML = board.columns.map(column => `<section class="column" data-column="${column.id}"><div class="column-head"><span class="column-title">${esc(column.title)}</span><div><span class="count">${filteredCards(column.cards).length}</span><button type="button" class="quick-add" data-column="${column.id}" title="在此列添加">＋</button></div></div><div class="cards">${filteredCards(column.cards).length ? filteredCards(column.cards).map(cardHtml).join('') : '<div class="empty">暂无匹配任务<br>拖动任务到这里</div>'}</div></section>`).join('');

  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('pointerdown', event => beginPointerDrag(event, card));
    card.addEventListener('click', event => { if (!event.target.closest('.delete') && !suppressClick) openEditor(card.dataset.id); suppressClick = false; });
    card.querySelector('.delete').addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); });
    card.querySelector('.delete').addEventListener('click', async event => { event.preventDefault(); event.stopPropagation(); try { board = await invoke('delete_card', { cardId: card.dataset.id }); render(); toast('任务已删除'); } catch (error) { toast(`删除失败：${error.message || error}`); } });
  });
  document.querySelectorAll('.quick-add').forEach(button => { button.onclick = () => openEditor(null, button.dataset.column); });
}

function beginPointerDrag(event, card) {
  if (event.target.closest('.delete')) return;
  event.preventDefault();
  activeCard = card;
  pointerStart = { x: event.clientX, y: event.clientY };
  pointerMoved = false;
  pointerTarget = null;
  dragGhost = card.cloneNode(true);
  dragGhost.classList.add('drag-ghost');
  dragGhost.removeAttribute('data-id');
  dragGhost.style.left = '0px';
  dragGhost.style.top = '0px';
  dragGhost.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 14}px, 0) rotate(2deg)`;
  document.body.appendChild(dragGhost);
  card.setPointerCapture?.(event.pointerId);
}

function updatePointerDrag(event) {
  if (!activeCard || !pointerStart) return;
  if (!pointerMoved && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) <= 6) return;
  pointerMoved = true;
  suppressClick = true;
  activeCard.classList.add('dragging');
  dragGhost.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 14}px, 0) rotate(2deg)`;
  pointerTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('.column');
  document.querySelectorAll('.column').forEach(column => column.classList.toggle('drag-over', column === pointerTarget));
}

async function finishPointerDrag(event) {
  if (!activeCard || !pointerStart) return;
  const wasDragged = pointerMoved;
  const card = activeCard;
  const source = card.closest('.column')?.dataset.column;
  const target = pointerTarget || document.elementFromPoint(event.clientX, event.clientY)?.closest('.column');
  const cardId = card.dataset.id;
  activeCard = null;
  pointerStart = null;
  pointerMoved = false;
  pointerTarget = null;
  card.classList.remove('dragging');
  dragGhost?.remove();
  dragGhost = null;
  document.querySelectorAll('.column').forEach(column => column.classList.remove('drag-over'));
  if (wasDragged && target && source !== target.dataset.column) { board = await invoke('move_card', { cardId, fromColumn: source, toColumn: target.dataset.column }); render(); toast('任务已移动'); }
}

document.addEventListener('pointermove', updatePointerDrag, { passive: false });
document.addEventListener('pointerup', finishPointerDrag);
document.addEventListener('pointercancel', finishPointerDrag);

function openEditor(cardId, columnId = 'backlog') { editingId = cardId; const card = cardId && board.columns.flatMap(column => column.cards).find(item => item.id === cardId); $('#dialogTitle').textContent = card ? '编辑任务' : '新建任务'; $('#saveCard').textContent = card ? '保存修改' : '创建任务'; $('#cardDialog').dataset.column = columnId; $('#title').value = card?.title || ''; $('#description').value = card?.description || ''; $('#assignee').value = card?.assignee || ''; $('#dueDate').value = card?.dueDate || ''; labelColors = { ...(card?.labelColors || {}) }; defaultLabelColor = card?.labels?.[0] ? card.labelColors?.[card.labels[0]] || 'purple' : 'purple'; $('#labels').value = card?.labels?.join(', ') || ''; renderLabelEditor(); $('#cardDialog').showModal(); }
function renderLabelEditor() { const labels = $('#labels').value.split(',').map(value => value.trim()).filter(Boolean); $('#colorPalette').innerHTML = COLORS.map(color => `<button type="button" class="color-dot color-${color} ${defaultLabelColor === color ? 'selected' : ''}" data-color="${color}" title="${color}"></button>`).join(''); document.querySelectorAll('#colorPalette .color-dot').forEach(button => { button.onclick = () => { defaultLabelColor = button.dataset.color; labels.forEach(label => { labelColors[label] = defaultLabelColor; }); renderLabelEditor(); }; }); $('#labelEditor').innerHTML = labels.map(label => `<div class="label-row"><span>${esc(label)}</span><div>${COLORS.map(color => `<button type="button" class="color-dot color-${color} ${(labelColors[label] || defaultLabelColor) === color ? 'selected' : ''}" data-label="${esc(label)}" data-color="${color}"></button>`).join('')}</div></div>`).join(''); document.querySelectorAll('#labelEditor .color-dot').forEach(button => { button.onclick = () => { labelColors[button.dataset.label] = button.dataset.color; renderLabelEditor(); }; }); }

$('#iconBtn').onclick = async () => { iconIndex = (iconIndex + 1) % BOARD_ICONS.length; board = await invoke('update_board_icon', { icon: BOARD_ICONS[iconIndex] }); render(); };
$('#addBtn').onclick = () => openEditor();
$('#closeDialog').onclick = () => $('#cardDialog').close();
$('#cancelDialog').onclick = () => $('#cardDialog').close();
$('#labels').addEventListener('input', renderLabelEditor);
$('#cardForm').onsubmit = async event => { event.preventDefault(); const wasEditing = Boolean(editingId); const labels = $('#labels').value.split(',').map(value => value.trim()).filter(Boolean); const input = { title: $('#title').value.trim(), description: $('#description').value, assignee: $('#assignee').value.trim(), dueDate: $('#dueDate').value || null, labels, labelColors: Object.fromEntries(labels.map(label => [label, labelColors[label] || defaultLabelColor])) }; if (!input.title) return; board = await invoke(wasEditing ? 'update_card' : 'create_card', wasEditing ? { cardId: editingId, input } : { columnId: $('#cardDialog').dataset.column || 'backlog', input }); $('#cardDialog').close(); event.target.reset(); editingId = null; labelColors = {}; defaultLabelColor = 'purple'; render(); toast(wasEditing ? '任务已更新' : '任务已创建'); };
$('#search').oninput = render;
$('#exportBtn').onclick = async () => { const path = await invoke('export_board'); toast('已保存：' + path); };
invoke('get_board').then(data => { board = data; render(); }).catch(error => toast('加载失败：' + error));
