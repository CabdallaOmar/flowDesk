/* =========================================================
   FlowDesk — script.js
   Planning & time management dashboard (vanilla JS).
   Everything is saved in localStorage.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- 1. Config & helpers ---------- */
  const STORE_KEY = 'flowdesk_v1';
  const THEME_KEY = 'flowdesk_theme';
  const PALETTE = ['#7c5cff', '#22d3ee', '#ff5c9d', '#34d399', '#fbbf24', '#fb923c'];
  const DAY_START = 6;   // timeline starts 06:00
  const DAY_END = 23;    // timeline ends 23:00
  const HOUR_H = 56;     // px per hour in the planner
  const CIRC = 2 * Math.PI * 52; // progress ring circumference
  const TITLES = { overview: 'Overview', tasks: 'My Tasks', planner: 'Day Planner', focus: 'Focus Timer', habits: 'Habits' };
  const PR_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  const QUOTES = [
    'Small steps every day beat big plans someday.',
    'Protect your focus — it is your most valuable hour.',
    'Done is better than perfect. Start now.',
    'Plan the day, then let the plan serve you.',
    'One task at a time. One win at a time.',
    'Consistency turns effort into results.',
    'Rest is part of the plan, not a break from it.'
  ];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = n => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minToTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtDate = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtDur = m => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const m = v => Math.max(0, Math.min(255, Math.round(v * f)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => m(v).toString(16).padStart(2, '0')).join('');
  };

  /* ---------- 2. State & localStorage ---------- */
  const defaultState = () => ({
    tasks: [], blocks: {}, habits: [], focus: {},
    settings: { focus: 25, short: 5, long: 15 }
  });

  function mkTask(title, priority, category, due, est, doneOn) {
    return { id: uid(), title, notes: '', priority, category, due, est, done: !!doneOn, doneOn: doneOn || null, createdAt: Date.now() };
  }

  function seed() {
    const s = defaultState();
    const k = n => dateKey(addDays(new Date(), n));
    s.tasks = [
      mkTask('Plan my week', 'high', 'Planning', k(0), 30),
      mkTask('Reply to important emails', 'medium', 'Work', k(0), 20),
      mkTask('Workout session', 'low', 'Health', k(0), 45),
      mkTask('Study session — learn something new', 'high', 'Study', k(1), 60),
      mkTask('Prepare weekly report', 'medium', 'Work', k(-1), 40),
      mkTask('Clean my workspace', 'low', 'Personal', k(-1), 15, k(-1)),
      mkTask('Read 20 pages', 'low', 'Study', k(-2), 25, k(-2)),
      mkTask('Pay bills', 'medium', 'Personal', k(-2), 10, k(-2)),
      mkTask('Team sync', 'medium', 'Work', k(-3), 30, k(-3)),
      mkTask('Grocery run', 'low', 'Personal', k(-5), 40, k(-5)),
      mkTask('Backup files', 'low', 'Work', k(0), 10, k(0))
    ];
    s.blocks[k(0)] = [
      { id: uid(), title: 'Deep work', start: '09:00', end: '11:00', color: PALETTE[0] },
      { id: uid(), title: 'Lunch break', start: '13:00', end: '14:00', color: PALETTE[3] },
      { id: uid(), title: 'Study', start: '16:00', end: '17:30', color: PALETTE[1] }
    ];
    const log = {};
    [-1, -2, -3, -5].forEach(n => { log[k(n)] = true; });
    s.habits = [
      { id: uid(), emoji: '💧', name: 'Drink water', log: { ...log, [k(0)]: true } },
      { id: uid(), emoji: '🏃', name: 'Exercise', log: { [k(-1)]: true, [k(-3)]: true } },
      { id: uid(), emoji: '📖', name: 'Read 20 minutes', log: { [k(-1)]: true, [k(-2)]: true } }
    ];
    s.focus[k(-1)] = { minutes: 50, sessions: 2 };
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const d = defaultState();
        return { ...d, ...p, settings: { ...d.settings, ...(p.settings || {}) } };
      }
    } catch (e) { /* ignore broken data */ }
    return seed();
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full / blocked */ }
  }

  let state = load();
  save();

  let currentView = 'overview';
  let plannerDate = dateKey();
  let taskFilter = 'all';
  let taskSort = 'due';
  let taskSearch = '';
  let flashId = null;
  let lastDay = dateKey();

  /* ---------- 3. UI utilities ---------- */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  function burst(x, y) {
    const colors = ['#7c5cff', '#22d3ee', '#ff5c9d', '#34d399', '#fbbf24'];
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('i');
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
      s.className = 'confetti';
      s.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % 5]};--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 30).toFixed(0)}px;--r:${(Math.random() * 540 - 270).toFixed(0)}deg`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 850);
    }
  }

  function countTo(el, to, suffix = '') {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (from === to) { el.textContent = to + suffix; return; }
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function openModal(id) {
    const m = $('#' + id);
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
    setTimeout(() => { const f = $('input:not([type=hidden]), select, textarea', m); if (f) f.focus(); }, 60);
  }
  function closeModals() {
    $$('.modal.open').forEach(m => { m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); });
  }

  /* ---------- 4. Theme ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0a0e1f' : '#f2f4ff');
  }

  /* ---------- 5. Navigation & rendering ---------- */
  const RENDER = { overview: renderOverview, tasks: renderTasks, planner: renderPlanner, focus: renderFocus, habits: renderHabits };

  function renderAll(anim = false) {
    RENDER[currentView](anim);
    const pending = state.tasks.filter(t => !t.done).length;
    const b = $('#taskBadge');
    b.textContent = pending;
    b.hidden = pending === 0;
  }

  function go(view, silent = false) {
    if (!TITLES[view]) view = 'overview';
    currentView = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#pageTitle').textContent = TITLES[view];
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* file:// quirks */ }
    renderAll(true);
    if (!silent) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 6. Overview ---------- */
  function renderOverview() {
    const today = dateKey(), now = new Date();
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.done).length;
    const overdue = state.tasks.filter(t => !t.done && t.due && t.due < today).length;
    const dueToday = state.tasks.filter(t => !t.done && t.due === today).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const f = state.focus[today] || { minutes: 0, sessions: 0 };
    const blocks = state.blocks[today] || [];
    const h = now.getHours();

    $('#greeting').textContent = h < 5 ? 'Late night mode 🌙' : h < 12 ? 'Good morning ☀️' : h < 17 ? 'Good afternoon 🌤️' : h < 21 ? 'Good evening 🌆' : 'Good night 🌙';
    $('#heroSummary').textContent = `${dueToday} task${dueToday === 1 ? '' : 's'} due today · ${blocks.length} time block${blocks.length === 1 ? '' : 's'} planned · ${f.minutes} focus min`;
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    $('#quote').textContent = '“' + QUOTES[doy % QUOTES.length] + '”';

    countTo($('#statDone'), done);
    countTo($('#statPending'), total - done);
    countTo($('#statFocus'), f.minutes);
    countTo($('#statOverdue'), overdue);
    countTo($('#ringPct'), pct, '%');
    $('#ringBar').style.strokeDashoffset = CIRC * (1 - pct / 100);
    $('#ringText').textContent = `${done} of ${total} tasks completed`;

    // today & overdue tasks
    const list = state.tasks
      .filter(t => !t.done && t.due && t.due <= today)
      .sort((a, b) => PR_ORDER[a.priority] - PR_ORDER[b.priority] || cmpDue(a, b))
      .slice(0, 5);
    $('#todayList').innerHTML = list.length
      ? list.map(t => `<li class="mini" data-id="${t.id}">
          <button class="check sm" data-act="task-toggle" aria-label="Complete task"><span></span></button>
          <div><b>${esc(t.title)}</b><small>${PR_LABEL[t.priority]} · ${dueLabel(t.due)}</small></div></li>`).join('')
      : '<li class="empty-note">Nothing due — enjoy your day 🎉</li>';

    // weekly chart
    const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
    const counts = days.map(d => state.tasks.filter(t => t.doneOn === dateKey(d)).length);
    const max = Math.max(1, ...counts);
    $('#weekChart').innerHTML = days.map((d, i) => `
      <div class="col ${i === 6 ? 'today' : ''}">
        <div class="bar-wrap"><div class="bar" style="--h:${Math.max(4, counts[i] / max * 100)}%"><span class="val">${counts[i]}</span></div></div>
        <span class="day">${d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
      </div>`).join('');

    renderSchedule();

    // habit chips
    $('#habitChips').innerHTML = state.habits.length
      ? state.habits.map(hb => `<button class="hchip ${hb.log[today] ? 'on' : ''}" data-act="habit-day" data-hid="${hb.id}" data-day="${today}">${hb.emoji} ${esc(hb.name)}</button>`).join('')
      : '<p class="empty-note">No habits yet — add some in the Habits tab.</p>';
  }

  function renderSchedule() {
    const el = $('#schedList');
    if (!el) return;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const list = (state.blocks[dateKey()] || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
    el.innerHTML = list.length
      ? list.map(b => {
          const live = nowMin >= toMin(b.start) && nowMin < toMin(b.end);
          return `<li class="sched ${live ? 'now' : ''}" style="--c:${b.color}"><div><b>${esc(b.title)}</b><small>${b.start} – ${b.end}</small></div>${live ? '<span class="live">NOW</span>' : ''}</li>`;
        }).join('')
      : '<li class="empty-note">No time blocks yet. Plan your day in the Planner.</li>';
  }

  /* ---------- 7. Tasks ---------- */
  const PR_ORDER = { high: 0, medium: 1, low: 2 };
  const cmpDue = (a, b) => { const x = a.due || '9999', y = b.due || '9999'; return x < y ? -1 : x > y ? 1 : 0; };

  function dueLabel(due) {
    if (!due) return 'No date';
    if (due === dateKey()) return 'Today';
    if (due === dateKey(addDays(new Date(), 1))) return 'Tomorrow';
    if (due === dateKey(addDays(new Date(), -1))) return 'Yesterday';
    return fmtDate(parseKey(due));
  }

  function filteredTasks() {
    const today = dateKey();
    const list = state.tasks.filter(t => {
      if (taskSearch && !(`${t.title} ${t.category || ''} ${t.notes || ''}`).toLowerCase().includes(taskSearch)) return false;
      switch (taskFilter) {
        case 'active': return !t.done;
        case 'done': return t.done;
        case 'today': return t.due === today;
        case 'overdue': return !t.done && t.due && t.due < today;
        default: return true;
      }
    });
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (taskSort === 'priority') return PR_ORDER[a.priority] - PR_ORDER[b.priority] || cmpDue(a, b);
      if (taskSort === 'newest') return b.createdAt - a.createdAt;
      return cmpDue(a, b) || PR_ORDER[a.priority] - PR_ORDER[b.priority];
    });
    return list;
  }

  function taskHTML(t, i) {
    const overdue = !t.done && t.due && t.due < dateKey();
    return `<li class="task p-${t.priority} ${t.done ? 'done' : ''} ${t.id === flashId ? 'new' : ''}" data-id="${t.id}" style="--i:${Math.min(i, 12)}">
      <button class="check" data-act="task-toggle" aria-label="Toggle complete" aria-pressed="${t.done}"><span></span></button>
      <div class="task-body">
        <h4>${esc(t.title)}</h4>
        ${t.notes ? `<p class="notes">${esc(t.notes)}</p>` : ''}
        <div class="meta">
          <span class="chip pr-${t.priority}">● ${PR_LABEL[t.priority]}</span>
          ${t.category ? `<span class="chip">#${esc(t.category)}</span>` : ''}
          <span class="chip ${overdue ? 'bad' : ''}">📅 ${dueLabel(t.due)}</span>
          ${t.est ? `<span class="chip">⏱ ${fmtDur(t.est)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn sm" data-act="task-edit" aria-label="Edit task">✏️</button>
        <button class="icon-btn sm" data-act="task-del" aria-label="Delete task">🗑️</button>
      </div>
    </li>`;
  }

  function renderTasks(anim = false) {
    const list = $('#taskList');
    list.classList.toggle('anim', !!anim);
    const items = filteredTasks();
    if (!items.length) {
      list.innerHTML = `<li class="card empty"><div class="empty-ico">🗂️</div><h4>No tasks here</h4>
        <p>${state.tasks.length ? 'Try another filter or search.' : 'Add your first task to get started.'}</p>
        <button class="btn-3d primary" data-open="task">+ New Task</button></li>`;
      return;
    }
    list.innerHTML = items.map(taskHTML).join('');
    flashId = null;
  }

  function toggleTask(id, btn) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneOn = t.done ? dateKey() : null;
    if (t.done && btn) {
      const r = btn.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2);
      toast('Nice work! Task completed 🎉');
    }
    save(); renderAll();
  }

  function deleteTask(id, host) {
    const run = () => { state.tasks = state.tasks.filter(t => t.id !== id); save(); renderAll(); toast('Task deleted 🗑️'); };
    if (host) { host.classList.add('removing'); setTimeout(run, 280); } else run();
  }

  let editingTaskId = null;
  function openTaskModal(id = null) {
    editingTaskId = id;
    const t = id ? state.tasks.find(x => x.id === id) : null;
    $('#taskModalTitle').textContent = t ? 'Edit task' : 'New task';
    $('#tTitle').value = t ? t.title : '';
    $('#tNotes').value = t ? t.notes || '' : '';
    $('#tPriority').value = t ? t.priority : 'medium';
    $('#tCategory').value = t ? t.category || '' : '';
    $('#tDue').value = t ? t.due || '' : dateKey();
    $('#tEst').value = t && t.est ? t.est : '';
    openModal('taskModal');
  }

  /* ---------- 8. Planner ---------- */
  function layoutBlocks(list) {
    const items = list.map(b => ({ b, s: toMin(b.start), e: toMin(b.end) })).sort((a, c) => a.s - c.s || a.e - c.e);
    const out = [];
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const cols = [];
      cluster.forEach(it => {
        let c = cols.findIndex(end => end <= it.s);
        if (c === -1) { c = cols.length; cols.push(it.e); } else cols[c] = it.e;
        it.col = c;
      });
      cluster.forEach(it => { it.cols = cols.length; out.push(it); });
      cluster = [];
    };
    items.forEach(it => {
      if (it.s >= clusterEnd) { flush(); clusterEnd = it.e; } else clusterEnd = Math.max(clusterEnd, it.e);
      cluster.push(it);
    });
    flush();
    return out;
  }

  function renderPlanner() {
    const list = state.blocks[plannerDate] || [];
    const isToday = plannerDate === dateKey();
    const d = parseKey(plannerDate);

    $('#dayPick').value = plannerDate;
    $('#plannerTitle').textContent = (isToday ? 'Today · ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const tl = $('#timeline');
    tl.style.height = (DAY_END - DAY_START) * HOUR_H + 'px';
    const px = m => (m - DAY_START * 60) * HOUR_H / 60;
    let html = '';
    for (let h = DAY_START; h <= DAY_END; h++) {
      html += `<div class="hour-line" style="top:${(h - DAY_START) * HOUR_H}px"><span>${pad(h)}:00</span></div>`;
    }
    html += '<div class="blocks">';
    layoutBlocks(list).forEach(({ b, s, e, col, cols }) => {
      const top = px(Math.max(s, DAY_START * 60)), bottom = px(Math.min(e, DAY_END * 60));
      if (bottom <= top) return;
      const w = 100 / cols;
      html += `<div class="block" data-id="${b.id}" style="top:${top}px;height:${Math.max(26, bottom - top - 2)}px;left:${col * w}%;width:calc(${w}% - 6px);--c:${b.color};--cd:${shade(b.color, .62)}">
        <b>${esc(b.title)}</b><small>${b.start} – ${b.end}</small></div>`;
    });
    html += '</div>';
    if (isToday) {
      const n = new Date(), nm = n.getHours() * 60 + n.getMinutes();
      if (nm >= DAY_START * 60 && nm <= DAY_END * 60) html += `<div class="now-line" style="top:${px(nm)}px"></div>`;
    }
    tl.innerHTML = html;

    // summary
    const planned = list.reduce((a, b) => a + Math.max(0, toMin(b.end) - toMin(b.start)), 0);
    const due = state.tasks.filter(t => t.due === plannerDate);
    const estimate = due.filter(t => !t.done).reduce((a, t) => a + (t.est || 0), 0);
    $('#daySummary').innerHTML = `
      <div class="line"><span>Time blocks</span><strong>${list.length}</strong></div>
      <div class="line"><span>Planned time</span><strong>${fmtDur(planned)}</strong></div>
      <div class="line"><span>Open tasks est.</span><strong>${fmtDur(estimate)}</strong></div>`;
    $('#dayTasks').innerHTML = due.length
      ? due.map(t => `<li class="mini ${t.done ? 'done' : ''}" data-id="${t.id}">
          <button class="check sm" data-act="task-toggle" aria-label="Toggle task" aria-pressed="${t.done}"><span></span></button>
          <div><b>${esc(t.title)}</b><small>${PR_LABEL[t.priority]}${t.est ? ' · ' + fmtDur(t.est) : ''}</small></div></li>`).join('')
      : '<li class="empty-note">No tasks due on this day.</li>';
  }

  let editingBlockId = null;
  function openBlockModal(id = null, start = '09:00', end = '10:00') {
    editingBlockId = id;
    const b = id ? (state.blocks[plannerDate] || []).find(x => x.id === id) : null;
    $('#blockModalTitle').textContent = b ? 'Edit time block' : 'New time block';
    $('#bTitle').value = b ? b.title : '';
    $('#bStart').value = b ? b.start : start;
    $('#bEnd').value = b ? b.end : end;
    const color = b ? b.color : PALETTE[0];
    $$('#bColors input').forEach(r => { r.checked = r.value === color; });
    $('#blockDelete').hidden = !b;
    openModal('blockModal');
  }

  /* ---------- 9. Focus timer (Pomodoro) ---------- */
  const timer = { mode: 'focus', total: 0, remaining: 0, running: false, endAt: 0, id: null };
  let audioCtx = null;

  function beep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [0, .25, .5].forEach((t, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), s = audioCtx.currentTime + t;
        o.type = 'sine'; o.frequency.value = i === 2 ? 1046 : 784;
        o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(.0001, s);
        g.gain.exponentialRampToValueAtTime(.25, s + .02);
        g.gain.exponentialRampToValueAtTime(.0001, s + .22);
        o.start(s); o.stop(s + .25);
      });
    } catch (e) { /* audio not available */ }
  }

  function updateTimerUI() {
    const mm = pad(Math.floor(timer.remaining / 60)), ss = pad(timer.remaining % 60);
    $('#timeText').textContent = `${mm}:${ss}`;
    $('#timerBar').style.strokeDashoffset = CIRC * (1 - timer.remaining / timer.total);
    $('#timerToggle').textContent = timer.running ? '⏸ Pause' : timer.remaining < timer.total ? '▶ Resume' : '▶ Start';
    $('#modeText').textContent = { focus: 'Time to focus', short: 'Short break', long: 'Long break' }[timer.mode];
    $('#timerRing').classList.toggle('running', timer.running);
    $$('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === timer.mode));
    document.title = timer.running ? `${mm}:${ss} · FlowDesk` : 'FlowDesk — Planning & Time Dashboard';
  }

  function stopTimer() { clearInterval(timer.id); timer.running = false; }
  function setMode(m) {
    stopTimer();
    timer.mode = m;
    timer.total = timer.remaining = state.settings[m] * 60;
    updateTimerUI();
  }
  function startTimer() {
    if (timer.running) return;
    try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* ignore */ }
    timer.running = true;
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.id = setInterval(() => {
      timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
      updateTimerUI();
      if (timer.remaining <= 0) completeTimer();
    }, 250);
    updateTimerUI();
  }
  function pauseTimer() {
    if (!timer.running) return;
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    stopTimer();
    updateTimerUI();
  }
  function completeTimer() {
    stopTimer();
    timer.remaining = 0;
    updateTimerUI();
    beep();
    if (timer.mode === 'focus') {
      const k = dateKey();
      if (!state.focus[k]) state.focus[k] = { minutes: 0, sessions: 0 };
      state.focus[k].minutes += state.settings.focus;
      state.focus[k].sessions += 1;
      save();
      toast('Focus session complete! Take a break 🎉');
      setMode(state.focus[k].sessions % 4 === 0 ? 'long' : 'short');
    } else {
      toast('Break is over — ready to focus? 💪');
      setMode('focus');
    }
    renderAll();
  }

  function renderFocus() {
    const f = state.focus[dateKey()] || { minutes: 0, sessions: 0 };
    countTo($('#fSessions'), f.sessions);
    countTo($('#fMinutes'), f.minutes);
    const filled = f.sessions === 0 ? 0 : ((f.sessions - 1) % 4) + 1;
    $('#sessionDots').innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
    updateTimerUI();
  }

  /* ---------- 10. Habits ---------- */
  function streak(h) {
    let n = 0, d = new Date();
    if (!h.log[dateKey(d)]) d = addDays(d, -1);
    while (h.log[dateKey(d)]) { n++; d = addDays(d, -1); }
    return n;
  }

  function renderHabits() {
    const today = dateKey();
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
    const opt = i => (i < 2 ? ' h-opt' : '');
    if (!state.habits.length) {
      $('#habitGrid').innerHTML = '<p class="empty-note">No habits yet. Add your first one above ☝️</p>';
      return;
    }
    const head = `<div class="h-row h-head"><span></span>${days.map((d, i) =>
      `<span class="h-day${dateKey(d) === today ? ' today' : ''}${opt(i)}">${d.toLocaleDateString(undefined, { weekday: 'narrow' })}<small>${d.getDate()}</small></span>`).join('')}</div>`;
    const rows = state.habits.map(h => {
      const s = streak(h);
      return `<div class="h-row" data-id="${h.id}">
        <div class="h-name"><span class="h-emoji">${h.emoji}</span>
          <div style="min-width:0"><b>${esc(h.name)}</b><small>${s ? '🔥 ' + s + ' day' + (s === 1 ? '' : 's') : 'Start today'}</small></div>
          <button class="x" data-act="habit-del" aria-label="Delete habit">✕</button></div>
        ${days.map((d, i) => {
          const k = dateKey(d), on = !!h.log[k];
          return `<button class="h-cell${on ? ' on' : ''}${k === today ? ' today' : ''}${opt(i)}" data-act="habit-day" data-hid="${h.id}" data-day="${k}" aria-pressed="${on}" aria-label="${esc(h.name)} on ${k}">✓</button>`;
        }).join('')}</div>`;
    }).join('');
    $('#habitGrid').innerHTML = head + rows;
  }

  function toggleHabit(hid, day) {
    const h = state.habits.find(x => x.id === hid);
    if (!h) return;
    if (h.log[day]) delete h.log[day]; else h.log[day] = true;
    const today = dateKey();
    if (day === today && h.log[today] && state.habits.every(x => x.log[today])) toast('All habits done today! 🔥');
    save(); renderAll();
  }

  /* ---------- 11. Tilt effect (desktop only) ---------- */
  function initTilt() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let active = null;
    const reset = el => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
    document.addEventListener('mousemove', e => {
      const c = e.target.closest ? e.target.closest('[data-tilt]') : null;
      if (active && active !== c) { reset(active); active = null; }
      if (!c) return;
      active = c;
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.style.setProperty('--ry', ((px - .5) * 9).toFixed(2) + 'deg');
      c.style.setProperty('--rx', ((.5 - py) * 9).toFixed(2) + 'deg');
      c.style.setProperty('--gx', (px * 100).toFixed(0) + '%');
      c.style.setProperty('--gy', (py * 100).toFixed(0) + '%');
    });
    document.addEventListener('mouseleave', () => { if (active) { reset(active); active = null; } });
  }

  /* ---------- 12. Events ---------- */
  function bindEvents() {
    // navigation
    $$('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

    // theme
    $('#themeToggle').addEventListener('click', e => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      e.currentTarget.classList.remove('spin'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('spin');
    });

    $('#addTaskTop').addEventListener('click', () => openTaskModal());

    // global delegated clicks
    document.addEventListener('click', e => {
      const goBtn = e.target.closest('[data-go]');
      if (goBtn) { go(goBtn.dataset.go); return; }
      if (e.target.closest('[data-open="task"]')) { openTaskModal(); return; }

      const el = e.target.closest('[data-act]');
      if (el) {
        const host = el.closest('[data-id]');
        const id = host ? host.dataset.id : null;
        switch (el.dataset.act) {
          case 'task-toggle': toggleTask(id, el); break;
          case 'task-edit': openTaskModal(id); break;
          case 'task-del': deleteTask(id, host); break;
          case 'habit-day': toggleHabit(el.dataset.hid, el.dataset.day); break;
          case 'habit-del':
            if (confirm('Delete this habit?')) { state.habits = state.habits.filter(h => h.id !== id); save(); renderAll(); toast('Habit deleted'); }
            break;
        }
        return;
      }

      // modal close (button or backdrop)
      if (e.target.closest('[data-close]') || (e.target.classList && e.target.classList.contains('modal'))) closeModals();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModals();
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.code === 'Space' && currentView === 'focus' && !['input', 'textarea', 'select', 'button'].includes(tag)) {
        e.preventDefault();
        timer.running ? pauseTimer() : startTimer();
      }
    });

    // tasks toolbar
    $('#taskSearch').addEventListener('input', e => { taskSearch = e.target.value.trim().toLowerCase(); renderTasks(false); });
    $('#taskSort').addEventListener('change', e => { taskSort = e.target.value; renderTasks(true); });
    $('#taskFilters').addEventListener('click', e => {
      const b = e.target.closest('.fchip');
      if (!b) return;
      taskFilter = b.dataset.filter;
      $$('#taskFilters .fchip').forEach(x => x.classList.toggle('active', x === b));
      renderTasks(true);
    });

    // task form
    $('#taskForm').addEventListener('submit', e => {
      e.preventDefault();
      const title = $('#tTitle').value.trim();
      if (!title) { $('#tTitle').focus(); return; }
      const data = {
        title, notes: $('#tNotes').value.trim(), priority: $('#tPriority').value,
        category: $('#tCategory').value.trim(), due: $('#tDue').value, est: Number($('#tEst').value) || 0
      };
      if (editingTaskId) {
        Object.assign(state.tasks.find(t => t.id === editingTaskId), data);
        toast('Task updated ✏️');
      } else {
        const t = { id: uid(), done: false, doneOn: null, createdAt: Date.now(), ...data };
        state.tasks.unshift(t);
        flashId = t.id;
        toast('Task added ✅');
      }
      save(); closeModals(); renderAll();
    });

    // planner controls
    const setDay = key => { plannerDate = key; renderPlanner(); };
    $('#dayPrev').addEventListener('click', () => setDay(dateKey(addDays(parseKey(plannerDate), -1))));
    $('#dayNext').addEventListener('click', () => setDay(dateKey(addDays(parseKey(plannerDate), 1))));
    $('#dayToday').addEventListener('click', () => setDay(dateKey()));
    $('#dayPick').addEventListener('change', e => { if (e.target.value) setDay(e.target.value); });
    $('#addBlock').addEventListener('click', () => openBlockModal());

    $('#timeline').addEventListener('click', e => {
      const blk = e.target.closest('.block');
      if (blk) { openBlockModal(blk.dataset.id); return; }
      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
      let m = DAY_START * 60 + Math.floor(y / HOUR_H * 2) * 30;
      m = Math.max(DAY_START * 60, Math.min(m, (DAY_END - 1) * 60));
      openBlockModal(null, minToTime(m), minToTime(Math.min(m + 60, DAY_END * 60)));
    });

    $('#bColors').innerHTML = PALETTE.map((c, i) =>
      `<label class="sw" style="--c:${c}"><input type="radio" name="bcolor" value="${c}" ${i === 0 ? 'checked' : ''}><span></span></label>`).join('');

    $('#blockForm').addEventListener('submit', e => {
      e.preventDefault();
      const start = $('#bStart').value, end = $('#bEnd').value;
      if (!start || !end || toMin(end) <= toMin(start)) { toast('End time must be after start time ⏰'); return; }
      const picked = $('#bColors input:checked');
      const data = { title: $('#bTitle').value.trim(), start, end, color: picked ? picked.value : PALETTE[0] };
      if (!data.title) return;
      const list = state.blocks[plannerDate] || (state.blocks[plannerDate] = []);
      if (editingBlockId) Object.assign(list.find(b => b.id === editingBlockId), data);
      else list.push({ id: uid(), ...data });
      toast(editingBlockId ? 'Block updated' : 'Time block added 🗓️');
      save(); closeModals(); renderAll();
    });

    $('#blockDelete').addEventListener('click', () => {
      state.blocks[plannerDate] = (state.blocks[plannerDate] || []).filter(b => b.id !== editingBlockId);
      save(); closeModals(); renderAll(); toast('Block deleted');
    });

    // focus controls
    $('#timerToggle').addEventListener('click', () => (timer.running ? pauseTimer() : startTimer()));
    $('#timerReset').addEventListener('click', () => setMode(timer.mode));
    $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
    [['setFocus', 'focus', 1, 180], ['setShort', 'short', 1, 60], ['setLong', 'long', 1, 90]].forEach(([id, key, min, max]) => {
      const el = $('#' + id);
      el.value = state.settings[key];
      el.addEventListener('change', () => {
        let v = Math.round(Number(el.value)) || state.settings[key];
        v = Math.min(max, Math.max(min, v));
        el.value = v; state.settings[key] = v; save();
        if (!timer.running && timer.mode === key) setMode(key);
      });
    });

    // habits form
    $('#habitForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#habitName').value.trim();
      if (!name) return;
      state.habits.push({ id: uid(), emoji: $('#habitEmoji').value, name, log: {} });
      $('#habitName').value = '';
      save(); renderAll(); toast('Habit added 🔥');
    });

    // reset
    $('#resetData').addEventListener('click', () => {
      if (!confirm('Delete ALL your tasks, plans and habits and start fresh?')) return;
      state = defaultState();
      save(); setMode('focus'); renderAll(); toast('All data cleared');
    });

    // keep tabs in sync
    window.addEventListener('storage', e => { if (e.key === STORE_KEY) { state = load(); renderAll(); } });
  }

  /* ---------- 13. Clock & timers ---------- */
  function tickClock() {
    const n = new Date();
    $('#clock').textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#todayLabel').textContent = n.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (dateKey() !== lastDay) { lastDay = dateKey(); plannerDate = lastDay; renderAll(); }
  }

  /* ---------- 14. Init ---------- */
  function init() {
    bindEvents();
    initTilt();
    setMode('focus');
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(() => { if (currentView === 'planner') renderPlanner(); if (currentView === 'overview') renderSchedule(); }, 30000);
    const start = location.hash.slice(1);
    go(TITLES[start] ? start : 'overview', true);
  }

  init();
})();