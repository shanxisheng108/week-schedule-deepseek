'use strict';

/* ============================================================
   日程 · 周视图  —  前端逻辑
   ------------------------------------------------------------
   数据流：自然语言 ──► /api/extract（DeepSeek）──► 结构化事件
                     └─► 无密钥时本地规则解析兜底
   存储：localStorage
   ============================================================ */

/* ------------------------------ 常量 ------------------------------ */

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const STORAGE_EVENTS = 'schedule.events.v1';
const STORAGE_KEY = 'schedule.apikey.v1';
const STORAGE_WEEK = 'schedule.weekstart.v1';

const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' };
const SOURCE_LABEL = { ai: 'AI 提取', local: '本地规则解析', manual: '手动创建' };

const SAMPLE_TEXT =
  '明天下午三点半在樱顶会议室开会，讨论毕业论文选题，这个比较重要；周五晚上七点线上腾讯会议，聊课题进展；10月28日上午九点到十一点在图书馆查文献。';

/* ------------------------------ 日期与格式化（来自 core.js） ------------------------------ */

const {
  pad2,
  dateKey,
  parseKey,
  addDays,
  startOfWeek,
  fmtDateCN,
  fmtMonthDay,
  localParse,
  timeDisplay,
  noteLine,
  sortEvents,
  filterEvents,
  highlightHTML,
  isSpan,
  occursOn,
  isAllDayLike,
  spanDays,
} = window.ScheduleCore;

/* ------------------------------ 状态 ------------------------------ */

const state = {
  events: [],
  weekStart: startOfWeek(new Date()),
  selectedId: null,
  hasServerKey: false,
  serverOnline: false,
  searchQuery: '',
  agendaDate: dateKey(new Date()),
};

function fmtRange(a, b) {
  return `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日 — ${b.getMonth() + 1}月${b.getDate()}日`;
}

/* ------------------------------ 存储 ------------------------------ */

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_EVENTS);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e === 'object' && e.title)
      .map((e) => ({
        id: e.id || makeId(),
        title: String(e.title),
        date: e.date || null,
        endDate: e.endDate && e.date && e.endDate > e.date ? e.endDate : null,
        startTime: e.startTime || null,
        endTime: e.endTime || null,
        timeText: e.timeText || null,
        location: e.location || null,
        detail: e.detail || '',
        priority: PRIORITY_LABEL[e.priority] ? e.priority : 'medium',
        source: SOURCE_LABEL[e.source] ? e.source : 'manual',
        createdAt: e.createdAt || Date.now(),
      }));
  } catch {
    return [];
  }
}

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(state.events));
  } catch (err) {
    console.warn('保存失败', err);
  }
}

function makeId() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------ 通用工具 ------------------------------ */

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { el.hidden = true; }, 2400);
}

function setStatus(message, type = '') {
  const el = document.getElementById('statusLine');
  el.textContent = message;
  el.className = `status ${type}`;
}

/* ------------------------------ 渲染：周视图 ------------------------------ */

/** 某一天的全部日程：单日事件看 date，时段类事件看是否落在区间内 */
function eventsOnDay(key) {
  return state.events
    .filter((e) => occursOn(e, key))
    .sort((a, b) => {
      const ta = a.startTime || '99:99';
      const tb = b.startTime || '99:99';
      if (ta !== tb) return ta.localeCompare(tb);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function eventCardHTML(e) {
  const span = isSpan(e);
  // 全天栏里已有「N天」标记，不再重复「每天 」前缀，省下的宽度留给标题
  const time = e.startTime ? `<span class="ev-time">${esc(e.startTime)}</span>` : '';
  const badge = span ? `<span class="ev-span" title="持续 ${spanDays(e)} 天">${spanDays(e)}天</span>` : '';
  const tip = [e.title, span ? timeDisplay(e) : (e.startTime || ''), e.location || ''].filter(Boolean).join(' · ');
  const cls = `event p-${e.priority}${e.startTime ? ' has-time' : ''}${span ? ' is-span' : ''}`;
  return `<div class="${cls}" data-id="${esc(e.id)}" role="button" tabindex="0" title="${esc(tip)}">${badge}${time}<span class="ev-title">${esc(e.title)}</span></div>`;
}

function renderWeek() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const dayKeys = days.map(dateKey);
  const todayKey = dateKey(new Date());

  document.getElementById('weekLabel').textContent =
    `${fmtRange(days[0], days[6])}${dayKeys.includes(todayKey) ? ' · 本周' : ''}`;

  /* 表头 */
  const head = document.getElementById('weekHead');
  head.innerHTML = `<tr><th class="time-col"></th>${days.map((d, i) => {
    const isToday = dayKeys[i] === todayKey;
    return `<th class="${isToday ? 'is-today' : ''}"><span class="dow">${WEEKDAY_CN[d.getDay()]}</span><span class="dom">${d.getDate()}</span></th>`;
  }).join('')}</tr>`;

  /* 本周事件（含跨越本周的时段类事件） */
  const weekEvents = state.events.filter((e) => dayKeys.some((k) => occursOn(e, k)));

  /* 时间轴范围：默认 08–22，有更早/更晚的事件时自动扩展 */
  let startHour = 8;
  let endHour = 22;
  weekEvents.forEach((e) => {
    if (!e.startTime || isSpan(e)) return;
    const h = parseInt(e.startTime.slice(0, 2), 10);
    if (Number.isFinite(h)) {
      startHour = Math.min(startHour, h);
      endHour = Math.max(endHour, h + 1);
    }
  });
  startHour = Math.max(0, startHour);
  endHour = Math.min(24, Math.max(endHour, startHour + 6));

  const body = document.getElementById('weekBody');
  const chunks = [];

  /** 单元格：用 flex 容器保证事件卡铺满列宽 */
  const cellHTML = (key, list) =>
    `<td class="${key === todayKey ? 'is-today' : ''}"><div class="cell">${list.map(eventCardHTML).join('')}</div></td>`;

  /* 全天栏：时段类（持续多天）+ 时点类里没给具体时刻的 */
  chunks.push(`<tr class="allday-row"><th>全天</th>${dayKeys
    .map((key) => cellHTML(key, eventsOnDay(key).filter(isAllDayLike)))
    .join('')}</tr>`);

  /* 逐小时：只放时点类事件 */
  for (let h = startHour; h < endHour; h += 1) {
    chunks.push(`<tr><th>${pad2(h)}:00</th>${dayKeys
      .map((key) =>
        cellHTML(
          key,
          eventsOnDay(key).filter(
            (e) => !isSpan(e) && e.startTime && parseInt(e.startTime.slice(0, 2), 10) === h
          )
        )
      )
      .join('')}</tr>`);
  }

  body.innerHTML = chunks.join('');

  /* 空状态 */
  document.getElementById('emptyHint').hidden = weekEvents.length > 0;

  /* 初始定位：始终从「全天」行与最早时段开始，保证不吞掉无具体时刻的日程 */
  requestAnimationFrame(() => {
    const scroller = document.getElementById('calendarScroll');
    if (scroller) scroller.scrollTop = 0;
  });
}

/* ------------------------------ 渲染：待安排 ------------------------------ */

function renderPending() {
  const list = state.events
    .filter((e) => !e.date)
    .sort((a, b) => b.createdAt - a.createdAt);

  document.getElementById('pendingCount').textContent = String(list.length);

  const box = document.getElementById('pendingList');
  if (!list.length) {
    box.innerHTML = '<p class="pending-empty">暂无待安排事件</p>';
    return;
  }

  box.innerHTML = list.map((e) => `
    <div class="pending-item p-${e.priority}" data-id="${esc(e.id)}">
      <div class="pi-title">${esc(e.title)}</div>
      <div class="pi-meta">${esc(e.timeText || '原文未提及日期')} · 优先级 ${PRIORITY_LABEL[e.priority]}</div>
      <div class="pi-actions">
        <button class="tiny-btn" data-act="schedule">安排日期</button>
        <button class="tiny-btn" data-act="open">查看便签</button>
      </div>
    </div>`).join('');
}

/* ------------------------------ 全部日程 / 搜索 ------------------------------ */
/* 排序、匹配、高亮都是纯逻辑，统一放在 core.js，便于单测 */

function allEventsSorted() {
  return sortEvents(state.events);
}

/** 关键词为空时返回全部已保存日程 */
function matchEvents(keyword) {
  return filterEvents(state.events, keyword);
}

function resultItemHTML(e, keyword) {
  const when = timeDisplay(e) || '时间未提及';
  return `<div class="result-item p-${e.priority}" data-id="${esc(e.id)}" role="button" tabindex="0" title="点击查看完整便签">
    <div class="ri-head">
      <span class="ri-title">${esc(e.title)}</span>
      <span class="ri-flag p-${e.priority}">${PRIORITY_LABEL[e.priority]}</span>
    </div>
    <div class="ri-meta">${esc(when)}${e.location ? ` · ${esc(e.location)}` : ''}</div>
    <div class="ri-detail">${highlightHTML(e.detail, keyword) || '<span class="ri-none">详情为空</span>'}</div>
  </div>`;
}

function renderSearch() {
  const keyword = state.searchQuery.trim();
  const list = matchEvents(keyword);

  const box = document.getElementById('searchResults');
  const emptyEl = document.getElementById('searchEmpty');
  const metaEl = document.getElementById('searchMeta');
  const countEl = document.getElementById('searchCount');

  countEl.textContent = String(list.length);

  if (!list.length) {
    box.innerHTML = '';
    metaEl.textContent = keyword ? `在全部 ${state.events.length} 条日程中无匹配` : '暂无日程';
    emptyEl.hidden = false;
    emptyEl.textContent = keyword
      ? `没有找到详情中包含「${keyword}」的日程。换个关键词，或清空输入框恢复全部日程。`
      : '还没有保存任何日程。在下方用一句话描述，AI 会帮你排进周视图。';
    return;
  }

  emptyEl.hidden = true;
  metaEl.textContent = keyword
    ? `在全部 ${state.events.length} 条日程中找到 ${list.length} 条匹配`
    : `全部日程 · 共 ${list.length} 条`;
  box.innerHTML = list.map((e) => resultItemHTML(e, keyword)).join('');
  box.scrollTop = 0;
}

function runSearch() {
  const input = document.getElementById('searchInput');
  state.searchQuery = input.value;
  renderSearch();
}

/* ------------------------------ 某日日程（今日 / 指定日期） ------------------------------ */

/** 距离今天的相对称呼，只用于副标题提示 */
function relativeDayLabel(key) {
  const d = parseKey(key);
  const t = new Date();
  const diff = Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
      - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000
  );
  const map = { '-2': '前天', '-1': '昨天', 0: '今天', 1: '明天', 2: '后天' };
  if (map[diff] !== undefined) return map[diff];
  return diff > 0 ? `${diff} 天后` : `${-diff} 天前`;
}

function eventsOnDate(key) {
  return allEventsSorted().filter((e) => occursOn(e, key));
}

function agendaItemHTML(e) {
  const span = isSpan(e);
  const timeInner = e.startTime
    ? `${span ? '<span class="ti-daily">每天</span>' : ''}${esc(e.startTime)}${e.endTime ? `–${esc(e.endTime)}` : ''}`
    : '全天';

  const meta = [
    span ? `持续 ${fmtMonthDay(e.date)}–${fmtMonthDay(e.endDate)}（${spanDays(e)} 天）` : null,
    e.location || '地点未提及',
    `优先级 ${PRIORITY_LABEL[e.priority]}`,
  ].filter(Boolean).join(' · ');

  return `<div class="today-item p-${e.priority}" data-id="${esc(e.id)}" role="button" tabindex="0" title="点击查看完整便签">
    <div class="ti-time${span ? ' is-span' : ''}">${timeInner}</div>
    <div class="ti-body">
      <div class="ti-title">${esc(e.title)}${span ? ' <span class="ti-badge">时段</span>' : ''}</div>
      <div class="ti-meta">${esc(meta)}</div>
      <div class="ti-detail">${esc(String(e.detail || '').trim() || '未提及')}</div>
    </div>
  </div>`;
}

function renderAgenda() {
  const key = state.agendaDate;
  const d = parseKey(key);
  const isToday = key === dateKey(new Date());
  const list = eventsOnDate(key);

  document.getElementById('agendaTitle').textContent = isToday ? '今日日程' : '日程查询';

  document.getElementById('agendaDate').textContent =
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_CN[d.getDay()]} · ${relativeDayLabel(key)}` +
    (list.length ? ` · 共 ${list.length} 个安排` : ' · 暂无安排');

  const box = document.getElementById('agendaList');
  const emptyEl = document.getElementById('agendaEmpty');

  if (!list.length) {
    box.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.textContent = isToday
      ? '今天还没有安排。可以在右侧用一句话添加日程。'
      : `${d.getMonth() + 1}月${d.getDate()}日还没有安排。`;
  } else {
    emptyEl.hidden = true;
    box.innerHTML = list.map(agendaItemHTML).join('');
  }

  document.getElementById('agendaTodayBtn').disabled = isToday;
}

function openAgenda(key) {
  if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) state.agendaDate = key;
  document.getElementById('dateQueryInput').value = state.agendaDate;
  renderAgenda();
  showModal('agendaModal');
}

function shiftAgenda(delta) {
  state.agendaDate = dateKey(addDays(parseKey(state.agendaDate), delta));
  document.getElementById('dateQueryInput').value = state.agendaDate;
  renderAgenda();
}

/* ------------------------------ 便签弹窗 ------------------------------ */

function openNote(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  state.selectedId = id;

  const time = timeDisplay(e);
  const created = new Date(e.createdAt);
  const stamp = `${created.getMonth() + 1}月${created.getDate()}日 ${pad2(created.getHours())}:${pad2(created.getMinutes())}`;

  document.getElementById('noteContent').innerHTML = `
    <div class="note-head">
      <div class="prio-bar" style="background:var(--p-${e.priority})"></div>
      <div>
        <h3>${esc(e.title)}${isSpan(e) ? `<span class="note-badge">时段 · ${spanDays(e)} 天</span>` : ''}</h3>
        <p class="note-source">${SOURCE_LABEL[e.source]} · 创建于 ${stamp}</p>
      </div>
    </div>

    <div class="note-fields">
      <div class="note-row">
        <span class="k">时间</span>
        <span class="v ${time ? '' : 'missing'}">${esc(time || '')}</span>
      </div>
      <div class="note-row">
        <span class="k">地点</span>
        <span class="v ${e.location ? '' : 'missing'}">${esc(e.location || '')}</span>
      </div>
      <div class="note-row detail">
        <span class="k">详情</span>
        <span class="v">${esc(e.detail || '未提及')}</span>
      </div>
    </div>

    <div class="format-line">${esc(noteLine(e))}</div>

    <div class="note-actions">
      <div class="prio-switch" role="group" aria-label="设置优先级">
        <button data-p="high" class="${e.priority === 'high' ? 'active' : ''}">高</button>
        <button data-p="medium" class="${e.priority === 'medium' ? 'active' : ''}">中</button>
        <button data-p="low" class="${e.priority === 'low' ? 'active' : ''}">低</button>
      </div>
      <div class="note-actions-right">
        <button class="tiny-btn" data-act="copy">复制便签</button>
        <button class="danger-btn" data-act="delete">删除</button>
      </div>
    </div>`;

  showModal('noteModal');
}

function setPriority(id, priority) {
  const e = state.events.find((x) => x.id === id);
  if (!e || !PRIORITY_LABEL[priority]) return;
  e.priority = priority;
  saveEvents();
  renderWeek();
  renderPending();
  renderSearch();
  if (state.selectedId === id) openNote(id); // 弹窗内即时刷新
  toast(`优先级已设为「${PRIORITY_LABEL[priority]}」`);
}

function deleteEvent(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  if (!window.confirm(`确定删除「${e.title}」吗？`)) return;
  state.events = state.events.filter((x) => x.id !== id);
  saveEvents();
  state.selectedId = null;
  hideModal();
  renderAll();
  toast('已删除');
}

function showModal(id) {
  // 同一时刻只留一个弹窗，避免便签盖在今日日程之上
  document.querySelectorAll('.modal').forEach((m) => {
    m.hidden = m.id !== id;
  });
  document.getElementById('overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  const target = document.getElementById(id);
  if (target) target.scrollTop = 0;
}

function hideModal() {
  document.getElementById('overlay').hidden = true;
  document.querySelectorAll('.modal').forEach((m) => {
    m.hidden = true;
  });
  document.body.style.overflow = '';
  state.selectedId = null;
}

/* ------------------------------ 优先级 / 便签交互（事件委托） ------------------------------ */

document.getElementById('noteContent').addEventListener('click', (ev) => {
  const prioBtn = ev.target.closest('.prio-switch button');
  if (prioBtn) {
    setPriority(state.selectedId, prioBtn.dataset.p);
    return;
  }

  const act = ev.target.closest('[data-act]');
  if (!act) return;

  const event = state.events.find((x) => x.id === state.selectedId);

  if (act.dataset.act === 'copy' && event) {
    const line = noteLine(event);
    const done = () => toast('便签已复制');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(line).then(done).catch(() => fallbackCopy(line, done));
    } else {
      fallbackCopy(line, done);
    }
  }

  if (act.dataset.act === 'delete') deleteEvent(state.selectedId);
});

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    toast('复制失败，请手动选择文本');
  }
  document.body.removeChild(ta);
}

/* ------------------------------ 待安排操作 ------------------------------ */

document.getElementById('pendingList').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const item = btn.closest('.pending-item');
  const id = item.dataset.id;

  if (btn.dataset.act === 'open') {
    openNote(id);
    return;
  }

  if (btn.dataset.act === 'schedule') {
    const existing = item.querySelector('.schedule-form');
    if (existing) {
      existing.remove();
      return;
    }
    const form = document.createElement('div');
    form.className = 'schedule-form';
    form.innerHTML = `
      <input type="date" class="sched-date" value="${dateKey(new Date())}">
      <input type="time" class="sched-time" value="09:00">
      <button class="tiny-btn" data-act="confirm">确定</button>`;
    item.appendChild(form);
    form.querySelector('.sched-date').focus();

    form.querySelector('[data-act="confirm"]').addEventListener('click', () => {
      const date = form.querySelector('.sched-date').value;
      const time = form.querySelector('.sched-time').value;
      const target = state.events.find((x) => x.id === id);
      if (!target || !date) return;
      target.date = date;
      target.startTime = time || null;
      saveEvents();
      state.weekStart = startOfWeek(parseKey(date));
      saveWeek();
      renderAll();
      toast('已安排到周视图');
    });
  }
});

/* ------------------------------ 周表格点击 ------------------------------ */

document.getElementById('weekBody').addEventListener('click', (ev) => {
  const card = ev.target.closest('.event');
  if (card) openNote(card.dataset.id);
});

document.getElementById('weekBody').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const card = ev.target.closest('.event');
  if (!card) return;
  ev.preventDefault();
  openNote(card.dataset.id);
});

/* ------------------------------ 周导航 ------------------------------ */

function saveWeek() {
  localStorage.setItem(STORAGE_WEEK, dateKey(state.weekStart));
}

function shiftWeek(delta) {
  state.weekStart = addDays(state.weekStart, delta * 7);
  saveWeek();
  renderWeek();
}

/* ------------------------------ 设置 ------------------------------ */

function updateEngineTag() {
  const localKey = (localStorage.getItem(STORAGE_KEY) || '').trim();
  const ready = Boolean(localKey || state.hasServerKey);
  const tag = document.getElementById('engineTag');

  if (!state.serverOnline) {
    tag.textContent = '本地服务未连接';
    tag.classList.add('local');
    return;
  }

  tag.textContent = ready ? 'DeepSeek 已就绪' : '未配置 API Key';
  tag.classList.toggle('local', !ready);
}

/** 顶部横条：本地服务不在线时给出可执行的处置说明，而不是让用户去怀疑密钥 */
function setOffline(offline) {
  const banner = document.getElementById('offlineBanner');
  if (banner) banner.hidden = !offline;
}

/** 探测本地服务是否在线，顺带拿服务端是否已配环境变量密钥 */
async function checkServer() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const cfg = await res.json();
    state.hasServerKey = Boolean(cfg.hasServerKey);
    state.serverOnline = true;
  } catch {
    state.hasServerKey = false;
    state.serverOnline = false;
  }
  updateEngineTag();
  setOffline(!state.serverOnline);
  return state.serverOnline;
}

function openSettings() {
  const input = document.getElementById('apiKeyInput');
  input.value = localStorage.getItem(STORAGE_KEY) || '';
  input.type = 'password';
  document.getElementById('toggleKeyBtn').textContent = '显示';

  const note = document.getElementById('serverNote');
  if (state.hasServerKey) {
    note.textContent = '✓ 服务端已通过环境变量 DEEPSEEK_API_KEY 配置密钥，无需在此填写。';
    note.className = 'server-note ok';
  } else {
    note.textContent = '当前服务端未配置环境变量密钥，请在上方填写。';
    note.className = 'server-note';
  }

  showModal('settingsModal');
}

/* ------------------------------ AI 提取 ------------------------------ */

async function handleExtract() {
  const input = document.getElementById('naturalInput');
  const text = input.value.trim();
  const btn = document.getElementById('extractBtn');
  const label = btn.querySelector('.btn-label');

  if (!text) {
    setStatus('先输入一段日程描述再提取', 'error');
    input.focus();
    return;
  }

  btn.disabled = true;
  label.textContent = '解析中…';
  setStatus('正在调用 DeepSeek 解析…', 'loading');

  const apiKey = (localStorage.getItem(STORAGE_KEY) || '').trim();

  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        apiKey,
        today: dateKey(new Date()),
        weekday: WEEKDAY_CN[new Date().getDay()],
      }),
    });

    // 不直接 res.json()：若中间有代理/网关插入 502 页面，JSON 解析会抛
    // "Unexpected token '<'"，比真正的错误更难懂
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`本地服务返回了非 JSON 响应（HTTP ${res.status}）`);
    }

    if (!data.ok) {
      // 只有「AI 侧不可用」才降级到本地规则；密钥/余额/限流属于需要用户处理的问题，直接报错
      if (data.code === 'NO_API_KEY' || data.fallback) {
        const localEvents = localParse(text);
        const reason = data.code === 'NO_API_KEY' ? '未配置 API Key' : data.message;
        if (!localEvents.length) {
          setStatus(`${reason}，本地规则也没能识别出事件。请点右上角「设置」填写密钥。`, 'error');
          return;
        }
        applyExtracted(localEvents, text, 'local');
        setStatus(`${reason}，已用本地规则解析出 ${localEvents.length} 个事件（精度有限）。`, 'ok');
        input.value = '';
        return;
      }
      setStatus(`解析失败：${data.message}`, 'error');
      return;
    }
    if (!data.events.length) {
      setStatus('没有识别到日程事件，试试说得更具体些，比如加上「明天下午三点」。', 'error');
      return;
    }

    applyExtracted(data.events, text, 'ai');
    setStatus(`已添加 ${data.events.length} 个事件，可点击卡片调整优先级。`, 'ok');
    input.value = '';
    const pendingCount = data.events.filter((e) => !e.date).length;
    if (pendingCount) toast(`${pendingCount} 个事件缺少日期，已放入「待安排」`);
  } catch (err) {
    // 网络层失败最容易误判：浏览器抛的 TypeError 只有一句 "Failed to fetch"，
    // 真实原因通常是本地 Node 服务没在跑（跟 API Key 一点关系都没有）
    const offline = err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err.message || '');
    if (offline) setOffline(true);

    const reason = offline
      ? '本地服务未连接（AI 解析需要 node server.js 提供的本地服务）'
      : `解析失败：${err.message}`;

    const localEvents = localParse(text);
    if (localEvents.length) {
      applyExtracted(localEvents, text, 'local');
      setStatus(`${reason}，已改用本地规则解析。`, 'error');
      input.value = '';
    } else {
      setStatus(offline ? `${reason}，本地规则也没能识别出事件。` : `${reason}`, 'error');
    }
  } finally {
    btn.disabled = false;
    label.textContent = '提取并添加';
  }
}

function applyExtracted(list, rawText, source) {
  const now = Date.now();
  const created = list.map((item, i) => {
    const date = item.date || null;
    const endDate = item.endDate && date && item.endDate > date ? item.endDate : null;
    return {
      id: `e_${now.toString(36)}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      title: String(item.title || '').trim() || '未命名事件',
      date,
      endDate,
      startTime: item.startTime || null,
      endTime: item.endTime || null,
      timeText: item.timeText || null,
      location: item.location || null,
      detail: rawText,
      priority: PRIORITY_LABEL[item.priority] ? item.priority : 'medium',
      source,
      createdAt: now + i,
    };
  });

  state.events.push(...created);
  saveEvents();

  // 跳到第一个有日期的事件所在周，让用户立刻看到结果
  const withDate = created.find((e) => e.date);
  if (withDate) {
    const targetWeek = startOfWeek(parseKey(withDate.date));
    if (dateKey(targetWeek) !== dateKey(state.weekStart)) {
      state.weekStart = targetWeek;
      saveWeek();
    }
  }

  renderAll();
}

/* ------------------------------ 本地规则兜底解析（core.js） ------------------------------ */
/* localParse 已实现于 core.js：仅在未配置 API Key 或 AI 不可用时生效，
   只认原文中明确出现的信息，缺失字段一律返回 null。 */

/* ------------------------------ 渲染总入口 ------------------------------ */

function renderAll() {
  renderWeek();
  renderPending();
  renderSearch();
}

/* ------------------------------ 事件绑定 ------------------------------ */

function bindUI() {
  document.getElementById('prevWeekBtn').addEventListener('click', () => shiftWeek(-1));
  document.getElementById('nextWeekBtn').addEventListener('click', () => shiftWeek(1));
  document.getElementById('todayBtn').addEventListener('click', () => {
    state.weekStart = startOfWeek(new Date());
    saveWeek();
    renderWeek();
  });

  /* 搜索：按钮 / 回车触发，边输入边搜（防抖），清空即恢复全部 */
  const searchInput = document.getElementById('searchInput');
  let searchTimer = 0;

  const searchNow = () => {
    clearTimeout(searchTimer);
    runSearch();
  };

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    if (!searchInput.value.trim()) {
      searchNow(); // 清空关键词 → 立刻恢复全部日程
      return;
    }
    searchTimer = setTimeout(runSearch, 200);
  });

  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      searchNow();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      searchInput.value = '';
      searchNow();
    }
  });

  document.getElementById('searchBtn').addEventListener('click', () => {
    searchNow();
    searchInput.focus();
  });

  document.getElementById('searchResults').addEventListener('click', (ev) => {
    const item = ev.target.closest('.result-item');
    if (item) openNote(item.dataset.id);
  });

  document.getElementById('searchResults').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const item = ev.target.closest('.result-item');
    if (!item) return;
    ev.preventDefault();
    openNote(item.dataset.id);
  });

  /* 日程查询：今日按钮 + 指定日期 */
  document.getElementById('dateQueryBtn').addEventListener('click', () => {
    const value = document.getElementById('dateQueryInput').value;
    openAgenda(value || dateKey(new Date()));
  });

  document.getElementById('dateQueryInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      document.getElementById('dateQueryBtn').click();
    }
  });

  document.getElementById('agendaPrevDay').addEventListener('click', () => shiftAgenda(-1));
  document.getElementById('agendaNextDay').addEventListener('click', () => shiftAgenda(1));
  document.getElementById('agendaTodayBtn').addEventListener('click', () => {
    state.agendaDate = dateKey(new Date());
    document.getElementById('dateQueryInput').value = state.agendaDate;
    renderAgenda();
  });
  document.getElementById('agendaClose').addEventListener('click', hideModal);

  document.getElementById('agendaList').addEventListener('click', (ev) => {
    const item = ev.target.closest('.today-item');
    if (item) openNote(item.dataset.id);
  });

  document.getElementById('agendaList').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const item = ev.target.closest('.today-item');
    if (!item) return;
    ev.preventDefault();
    openNote(item.dataset.id);
  });

  document.getElementById('retryConnBtn').addEventListener('click', async () => {
    const ok = await checkServer();
    toast(ok ? '本地服务已连接' : '仍未连接，请确认 start.bat 窗口还开着');
  });

  document.getElementById('extractBtn').addEventListener('click', handleExtract);

  document.getElementById('sampleBtn').addEventListener('click', () => {
    const input = document.getElementById('naturalInput');
    input.value = SAMPLE_TEXT;
    input.focus();
    setStatus('已填入示例，点击「提取并添加」试试', '');
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(state.weekStart, i)));
    const target = state.events.filter((e) => e.date && keys.includes(e.date));
    if (!target.length) {
      toast('本周没有可清空的安排');
      return;
    }
    if (!window.confirm(`确定清空本周的 ${target.length} 个事件吗？`)) return;
    state.events = state.events.filter((e) => !(e.date && keys.includes(e.date)));
    saveEvents();
    renderAll();
    toast('已清空本周');
  });

  // Ctrl/Cmd + Enter 快捷提取
  document.getElementById('naturalInput').addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      handleExtract();
    }
  });

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', hideModal);
  document.getElementById('noteClose').addEventListener('click', hideModal);
  document.getElementById('overlay').addEventListener('click', hideModal);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideModal();
  });

  document.getElementById('toggleKeyBtn').addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    document.getElementById('toggleKeyBtn').textContent = show ? '隐藏' : '显示';
  });

  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    const value = document.getElementById('apiKeyInput').value.trim();
    if (value) {
      localStorage.setItem(STORAGE_KEY, value);
      toast('密钥已保存');
    } else {
      localStorage.removeItem(STORAGE_KEY);
      toast('已清空本地密钥');
    }
    updateEngineTag();
    hideModal();
  });

  document.getElementById('clearKeyBtn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('apiKeyInput').value = '';
    updateEngineTag();
    toast('已清除本地密钥');
  });
}

/* ------------------------------ 初始化 ------------------------------ */

async function init() {
  state.events = loadEvents();

  const savedWeek = localStorage.getItem(STORAGE_WEEK);
  if (savedWeek && /^\d{4}-\d{2}-\d{2}$/.test(savedWeek)) {
    state.weekStart = startOfWeek(parseKey(savedWeek));
  }

  state.agendaDate = dateKey(new Date());
  document.getElementById('dateQueryInput').value = state.agendaDate;

  bindUI();
  renderAll();

  // 支持 ?agenda=YYYY-MM-DD 深链，打开即定位到某天
  const deepLink = new URLSearchParams(location.search).get('agenda');
  if (deepLink) openAgenda(deepLink);

  // file:// 直接打开时不可能连上 /api，先给出明确提示，别等用户点完才报错
  if (location.protocol === 'file:') {
    state.serverOnline = false;
    updateEngineTag();
    setOffline(true);
    setStatus('当前是直接打开的本地文件，AI 解析不可用。请运行 start.bat 后访问 http://127.0.0.1:5173', 'error');
    return;
  }

  await checkServer();
}

init();
