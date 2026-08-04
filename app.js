/* ============================================================
   三火工作台 - PWA 单页应用逻辑
   免登录 · 数据存 localStorage · 离线可用
   商单状态:待办(todo) → 待发布(pending) → 待结款(collect) → 已完成(done)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 数据层:localStorage ---------- */
  const STORE_KEY = 'sanhuo-workbench-v3';
  const STATUS_LIST = ['todo', 'pending', 'collect', 'done'];

  const DEFAULT_DATA = { orders: [] };

  function loadData() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.orders)) return data;
      }
      const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
      localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
      return fresh;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  }

  let data = loadData();

  function saveData() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* 静默 */ }
  }

  /* ---------- 工具 ---------- */
  const $ = (sel) => document.querySelector(sel);

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 状态元信息 */
  const STATUS_META = {
    todo:    { label: '待办',   cls: 'st-todo',    chip: 'chip-pink' },
    pending: { label: '待发布', cls: 'st-pending', chip: 'chip-orange' },
    collect: { label: '待结款', cls: 'st-collect', chip: 'chip-blue' },
    done:    { label: '已完成', cls: 'st-done',    chip: 'chip-green' }
  };

  function fmtDate(d) {
    const now = new Date();
    const t = new Date(d);
    const diff = Math.floor((t - now) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === 2) return '后天';
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    if (diff > 2 && diff < 7 && t.getDay() >= now.getDay()) return week[t.getDay()];
    return (t.getMonth() + 1) + '月' + t.getDate() + '日';
  }

  function fmtDue(datetimeStr, withTime) {
    if (!datetimeStr) return '';
    const t = new Date(datetimeStr);
    if (isNaN(t.getTime())) return '';
    const base = fmtDate(datetimeStr);
    if (!withTime) return base;
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return base + ' ' + hh + ':' + mm;
  }

  let moneyMask = true; /* 金额脱敏开关:true=显示 *** */

  function money(n) {
    if (moneyMask) return '¥***';
    const v = Number(n) || 0;
    return '¥' + v.toLocaleString('zh-CN');
  }

  /* 子需求项:对象数组 {text, done} ↔ 兼容旧字符串数组 */
  function normReqs(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => {
      if (typeof r === 'string') return { text: r, done: false };
      return { text: String(r.text || ''), done: !!r.done };
    }).filter((r) => r.text);
  }
  function reqTexts(arr) {
    return normReqs(arr).map((r) => r.text);
  }

  /* ---------- 导航 ---------- */
  const views = ['home', 'mine', 'todo', 'publish', 'balance', 'done'];
  let mineFilter = 'all'; /* 我的页状态筛选 */

  function switchView(name) {
    views.forEach((v) => {
      $('#view-' + v).classList.toggle('active', v === name);
    });
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    if (name === 'mine') renderMine();
    if (name === 'todo') renderTodoView();
    if (name === 'publish') renderPublishView();
    if (name === 'balance') renderBalanceView();
    if (name === 'done') renderDoneView();
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      /* 首页状态统计卡:点击后跳转并设置我的页状态筛选 */
      if (btn.dataset.status) {
        mineFilter = btn.dataset.status;
        const sel = $('#mine-status-select');
        if (sel) sel.value = mineFilter;
      }
      switchView(btn.dataset.goto);
    });
  });

  /* ---------- 首页欢迎语 ---------- */
  function renderGreet() {
    const h = new Date().getHours();
    let title = '三火,晚上好呀!';
    if (h >= 5 && h < 11) title = '三火,早上好呀!';
    else if (h >= 11 && h < 14) title = '三火,中午好呀!';
    else if (h >= 14 && h < 18) title = '三火,下午好呀!';
    $('#greet-title').textContent = title;
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    $('#today-date').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + week[now.getDay()];
  }

  /* ---------- 年月筛选 ---------- */
  const monthFilter = { year: 0, month: 0, enabled: false }; /* 我的页:默认查全部(点箭头才按月筛选) */
  const doneMonth = { year: 0, month: 0, enabled: false }; /* 完成页:默认全部 */

  function initMonthFilter() {
    const now = new Date();
    monthFilter.year = now.getFullYear();
    monthFilter.month = now.getMonth();
    doneMonth.year = now.getFullYear();
    doneMonth.month = now.getMonth();
  }
  function monthLabel() {
    return monthFilter.year + '年' + (monthFilter.month + 1) + '月';
  }
  function doneMonthLabel() {
    return doneMonth.year + '年' + (doneMonth.month + 1) + '月';
  }
  function shiftMonth(delta) {
    let d = new Date(monthFilter.year, monthFilter.month + delta, 1);
    monthFilter.year = d.getFullYear();
    monthFilter.month = d.getMonth();
    monthFilter.enabled = true;
    renderMonthFilters();
    refreshAll();
  }
  function toggleMonthAll() {
    monthFilter.enabled = !monthFilter.enabled;
    renderMonthFilters();
    refreshAll();
  }
  function shiftDoneMonth(delta) {
    let d = new Date(doneMonth.year, doneMonth.month + delta, 1);
    doneMonth.year = d.getFullYear();
    doneMonth.month = d.getMonth();
    doneMonth.enabled = true;
    renderMonthFilters();
    refreshAll();
  }
  function toggleDoneMonthAll() {
    doneMonth.enabled = !doneMonth.enabled;
    renderMonthFilters();
    refreshAll();
  }
  /* 渲染所有年月筛选器 UI */
  function renderMonthFilters() {
    const mineLbl = $('#mf-label-mine');
    if (mineLbl) mineLbl.textContent = monthLabel();
    const mineAll = $('#mf-all-mine');
    if (mineAll) mineAll.classList.toggle('mf-active', !monthFilter.enabled);
    const doneLbl = $('#mf-label-done');
    if (doneLbl) doneLbl.textContent = doneMonthLabel();
    const doneAll = $('#mf-all-done');
    if (doneAll) doneAll.classList.toggle('mf-active', !doneMonth.enabled);
  }
  /* 按年月过滤(我的页) */
  function filterByMonth(orders) {
    if (!monthFilter.enabled) return orders;
    return orders.filter((o) => {
      if (!o.date) return false;
      const d = new Date(o.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === monthFilter.year && d.getMonth() === monthFilter.month;
    });
  }
  /* 按年月过滤(完成页) */
  function filterDoneByMonth(orders) {
    if (!doneMonth.enabled) return orders;
    return orders.filter((o) => {
      if (!o.date) return false;
      const d = new Date(o.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === doneMonth.year && d.getMonth() === doneMonth.month;
    });
  }

  /* ---------- 商单卡片渲染 ---------- */
  /* mode: 'flow' 三页(仅完成按钮) | 'full' 我的页(删除+详情可编辑) */
  function renderOrderCard(o, mode) {
    const meta = STATUS_META[o.status] || STATUS_META.todo;
    const st = '<span class="status ' + meta.cls + '">' + meta.label + '</span>';
    const datePart = fmtDue(o.date, true) || '未排期';
    const fee = money(o.fee);
    const deposit = o.deposit ? '<span class="dep">定金 ' + money(o.deposit) + '</span>' : '';
    const reqItems = normReqs(o.requirements);
    const reqTotal = reqItems.length;
    const reqDoneCount = reqItems.filter((r) => r.done).length;
    const reqLeft = reqTotal - reqDoneCount;
    const reqSummary = reqTotal
      ? '<div class="req-summary"><span class="req-progress">子需求 ' + reqDoneCount + '/' + reqTotal + '</span>' +
        (reqLeft > 0
          ? '<span class="req-left">剩 ' + reqLeft + ' 项待完成</span>'
          : '<span class="req-all">全部完成</span>') +
        '</div>'
      : '';
    const reqs = reqItems.length
      ? '<div class="order-req">' + reqSummary + reqItems.map((r) =>
          '<span class="req-item' + (r.done ? ' done' : '') + '">' +
            (r.done ? '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.5l5 5 10-10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '<i class="req-dot"></i>') +
            esc(r.text) +
          '</span>'
        ).join('') + '</div>'
      : '';

    if (mode === 'flow') {
      /* 三页:仅"完成"按钮,状态流转到下一阶段 */
      const nextMeta = STATUS_META[NEXT_STATUS[o.status]] || null;
      return (
        '<div class="swipe-wrap" data-id="' + o.id + '">' +
          '<div class="swipe-body order-card flow-card" data-status="' + o.status + '">' +
            '<div class="order-head"><span class="order-name">' + esc(o.name) + '</span>' + st + '</div>' +
            '<div class="order-meta"><span>' + esc(datePart) + '</span><span>·</span><span class="fee">' + fee + '</span>' + deposit + '</div>' +
            reqs +
            (nextMeta
              ? '<button class="flow-done" data-act="flow-done" aria-label="完成">' +
                  '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.5l5 5 10-10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                  '完成 · 转为' + nextMeta.label +
                '</button>'
              : '') +
          '</div>' +
        '</div>'
      );
    }

    /* full:我的页,删除 + 详情可编辑 */
    return (
      '<div class="swipe-wrap" data-id="' + o.id + '">' +
        '<button class="swipe-del" data-act="del-order" aria-label="删除">删除</button>' +
        '<div class="swipe-body order-card" data-status="' + o.status + '">' +
          '<div class="order-head"><span class="order-name">' + esc(o.name) + '</span>' +
            '<span class="order-head-right">' + st +
              '<button class="order-del" data-act="del-order" aria-label="删除">' +
                '<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l1 12a1.5 1.5 0 0 0 1.5 1.4h5A1.5 1.5 0 0 0 16 19l1-12M10 11v5.5M14 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</button>' +
            '</span>' +
          '</div>' +
          '<div class="order-meta"><span>' + esc(datePart) + '</span><span>·</span><span class="fee">' + fee + '</span>' + deposit + '</div>' +
          reqs +
        '</div>' +
      '</div>'
    );
  }

  function renderOrderList(listEl, orders, mode) {
    if (orders.length === 0) {
      listEl.innerHTML = '<div class="empty-tip">这里还没有商单</div>';
      return;
    }
    const sorted = orders.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    listEl.innerHTML = sorted.map((o) => renderOrderCard(o, mode || 'full')).join('');
  }

  /* 下一阶段状态 */
  const NEXT_STATUS = { todo: 'pending', pending: 'collect', collect: 'done' };

  /* 页面头部 chip:数量为 0 时隐藏 */
  function setHeadChip(id, count) {
    const el = $(id);
    if (!el) return;
    el.textContent = count + ' 单';
    el.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  /* ---------- 待办视图(状态=todo, 仅完成, 全部显示) ---------- */
  function renderTodoView() {
    const orders = data.orders.filter((o) => o.status === 'todo');
    setHeadChip('#todo-head-chip', orders.length);
    $('#todo-desc').textContent = '未完成拍摄的商单一共有 ' + orders.length + ' 个';
    renderOrderList($('#todo-order-list'), orders, 'flow');
  }

  /* ---------- 发布视图(状态=pending, 仅完成, 全部显示) ---------- */
  function renderPublishView() {
    const orders = data.orders.filter((o) => o.status === 'pending');
    setHeadChip('#publish-head-chip', orders.length);
    $('#publish-desc').textContent = '待发布的商单一共有 ' + orders.length + ' 个';
    renderOrderList($('#publish-order-list'), orders, 'flow');
  }

  /* ---------- 结余视图(状态=collect, 仅完成, 全部显示) ---------- */
  function renderBalanceView() {
    const orders = data.orders.filter((o) => o.status === 'collect');
    setHeadChip('#balance-head-chip', orders.length);
    $('#balance-desc').textContent = '待结款的商单一共有 ' + orders.length + ' 个';
    renderOrderList($('#balance-order-list'), orders, 'flow');

    /* 统计:待结算金额 = 费用 - 定金;定金已收 = 定金合计 */
    const settle = orders.reduce((s, o) => s + ((Number(o.fee) || 0) - (Number(o.deposit) || 0)), 0);
    const deposit = orders.reduce((s, o) => s + (Number(o.deposit) || 0), 0);
    $('#sb-count').textContent = orders.length;
    $('#sb-amount').textContent = money(settle);
    $('#sb-deposit').textContent = money(deposit);
  }

  /* ---------- 完成视图(状态=done, 统计 + 月份搜索, 只读列表) ---------- */
  function renderDoneView() {
    const byStatus = data.orders.filter((o) => o.status === 'done');
    const filtered = filterDoneByMonth(byStatus);
    setHeadChip('#done-head-chip', byStatus.length);
    $('#done-desc').textContent = '已完成的商单一共有 ' + byStatus.length + ' 个';
    $('#done-count').textContent = filtered.length;
    const fee = filtered.reduce((s, o) => s + (Number(o.fee) || 0), 0);
    const income = filtered.reduce((s, o) => s + ((Number(o.fee) || 0) - (Number(o.deposit) || 0)), 0);
    $('#done-amount').textContent = money(fee);
    $('#done-income').textContent = money(income);
    renderOrderList($('#done-order-list'), filtered, 'flow');
  }

  /* ---------- 我的视图(全部 + 状态筛选 + 年月, 完整操作) ---------- */
  function renderMine() {
    const byStatus = mineFilter === 'all'
      ? data.orders.slice()
      : data.orders.filter((o) => o.status === mineFilter);
    const filtered = filterByMonth(byStatus);
    $('#mine-total-chip').textContent = '共 ' + data.orders.length + ' 单';
    $('#mine-desc').textContent = '全部商单一共有 ' + data.orders.length + ' 个,点击可编辑';
    renderOrderList($('#mine-order-list'), filtered, 'full');
  }

  /* 我的页状态筛选:下拉选择器 */
  $('#mine-status-select').addEventListener('change', (e) => {
    mineFilter = e.target.value;
    renderMine();
  });

  /* ---------- 首页预览与统计 ---------- */
  function renderHomePreview() {
    const byStatus = {};
    STATUS_LIST.forEach((s) => { byStatus[s] = data.orders.filter((o) => o.status === s); });

    $('#ov-todo').textContent = byStatus.todo.length;
    $('#ov-pending').textContent = byStatus.pending.length;
    $('#ov-collect').textContent = byStatus.collect.length;
    $('#ov-done').textContent = byStatus.done.length;

    /* 待办商单预览 */
    $('#home-todo-chip').textContent = byStatus.todo.length + ' 单';
    const todoList = $('#home-todo-list');
    const shown = byStatus.todo.slice(0, 3);
    todoList.innerHTML = shown.length === 0
      ? '<div class="empty-tip">没有待办商单,轻松一下</div>'
      : shown.map((o) =>
          '<div class="task-row"><span class="t-dot"></span><span class="t-txt">' + esc(o.name) +
          '<span class="t-sub">' + esc(fmtDue(o.date, true) || '未排期') + '</span></span></div>'
        ).join('');

    /* 待结款预览 */
    const collect = byStatus.collect;
    const collectAmount = collect.reduce((s, o) => s + ((Number(o.fee) || 0) - (Number(o.deposit) || 0)), 0);
    const doneIncome = byStatus.done.reduce((s, o) => s + (Number(o.fee) || 0), 0);
    $('#home-balance-chip').textContent = collect.length + ' 单';
    $('#h-balance-amount').textContent = money(collectAmount);
    $('#h-balance-count').textContent = collect.length + ' 单';
    $('#h-total-income').textContent = money(doneIncome);
  }

  /* ---------- 置顶提醒:最近一场待办商单 ---------- */
  function renderReminder() {
    const now = new Date();
    const upcoming = data.orders
      .filter((o) => o.status === 'todo' && o.date && new Date(o.date) > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const collectCount = data.orders.filter((o) => o.status === 'collect').length;

    const bar = $('#reminder-bar');
    if (upcoming.length > 0) {
      const next = upcoming[0];
      $('#reminder-main').textContent = fmtDue(next.date, true) + ' · ' + next.name;
      $('#reminder-sub').textContent = collectCount > 0
        ? '还有 ' + collectCount + ' 单待结款,记得跟进'
        : '最近待办:记得推进进度';
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }

  /* ---------- 菜单徽标(0 时隐藏) ---------- */
  function renderBadges() {
    const todoCount = data.orders.filter((o) => o.status === 'todo').length;
    const publishCount = data.orders.filter((o) => o.status === 'pending').length;
    const collectCount = data.orders.filter((o) => o.status === 'collect').length;
    const doneCount = data.orders.filter((o) => o.status === 'done').length;

    $('#badge-todo').textContent = todoCount;
    $('#badge-todo').style.display = todoCount > 0 ? 'flex' : 'none';
    $('#badge-publish').textContent = publishCount;
    $('#badge-publish').style.display = publishCount > 0 ? 'flex' : 'none';
    $('#badge-balance').textContent = collectCount;
    $('#badge-balance').style.display = collectCount > 0 ? 'flex' : 'none';
    $('#badge-done').textContent = doneCount;
    $('#badge-done').style.display = doneCount > 0 ? 'flex' : 'none';
  }

  /* ---------- 金额脱敏切换(眼睛) ---------- */
  const EYE_CLOSED_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.8"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>';
  function renderMoneyEye() {
    const eye = $('#money-eye');
    if (!eye) return;
    eye.classList.toggle('masked', moneyMask);
    /* 单图标切换:脱敏=闭眼斜线,显示=睁眼 */
    eye.innerHTML = moneyMask ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
  }
  function toggleMoneyMask() {
    moneyMask = !moneyMask;
    renderMoneyEye();
    refreshAll();
  }
  const moneyEye = $('#money-eye');
  if (moneyEye) moneyEye.addEventListener('click', toggleMoneyMask);

  /* ---------- 商单表单(新增/编辑共用) ---------- */
  const modal = $('#order-modal');
  const detailModal = $('#detail-modal');
  const STATUS_PICKER_CLS = 'sp-selected';
  let editingOrderId = null;

  function setStatusPicker(container, status) {
    container.querySelectorAll('.sp-item').forEach((b) => {
      b.classList.toggle(STATUS_PICKER_CLS, b.dataset.status === status);
    });
  }
  function getStatusPicker(container) {
    const sel = container.querySelector('.sp-item.' + STATUS_PICKER_CLS);
    return sel ? sel.dataset.status : 'todo';
  }
  function bindStatusPicker(container) {
    container.querySelectorAll('.sp-item').forEach((b) => {
      b.addEventListener('click', () => setStatusPicker(container, b.dataset.status));
    });
  }
  bindStatusPicker($('#f-status-picker'));
  bindStatusPicker($('#e-status-picker'));

  /* ---------- 子需求编辑器(表单/详情共用) ---------- */
  const reqEditorState = { list: [] }; /* 当前编辑的子需求数组 {text, done} */

  function renderReqList(containerId) {
    const listEl = $(containerId);
    if (reqEditorState.list.length === 0) {
      listEl.innerHTML = '<div class="req-empty">暂无子需求,点击下方添加</div>';
      return;
    }
    listEl.innerHTML = reqEditorState.list.map((r, i) =>
      '<div class="req-edit-item' + (r.done ? ' done' : '') + '" data-i="' + i + '">' +
        '<span class="req-check">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.5l5 5 10-10" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</span>' +
        '<span class="req-txt">' + esc(r.text) + '</span>' +
      '</div>'
    ).join('');
  }

  function bindReqEditor(editorId, listId, inputId, addBtnId) {
    const editor = $(editorId);
    let lastReqTap = 0; /* 防双击保护 */
    editor.addEventListener('click', (e) => {
      const item = e.target.closest('.req-edit-item');
      if (!item) return;
      const i = Number(item.dataset.i);
      if (i == null || !reqEditorState.list[i]) return;
      /* 点击勾选行:只切换当前项(与 todolist 一致) */
      const now = Date.now();
      if (now - lastReqTap < 250) return; /* 忽略双击/误触连点 */
      lastReqTap = now;
      reqEditorState.list[i].done = !reqEditorState.list[i].done;
      renderReqList(listId);
    });
    const input = $(inputId);
    const doAdd = () => {
      const text = input.value.trim();
      if (!text) return;
      reqEditorState.list.push({ text: text, done: false });
      input.value = '';
      renderReqList(listId);
      input.focus();
    };
    $(addBtnId).addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  }
  bindReqEditor('#f-req-editor', '#f-req-list', '#f-req-input', '#f-req-add');
  bindReqEditor('#e-req-editor', '#e-req-list', '#e-req-input', '#e-req-add');

  function openModal(order) {
    if (order) {
      /* 编辑模式 */
      editingOrderId = order.id;
      $('#order-form-title').textContent = '编辑商单';
      $('#f-name').value = order.name || '';
      $('#f-date').value = order.date || '';
      $('#f-fee').value = order.fee != null ? order.fee : '';
      $('#f-deposit').value = order.deposit != null ? order.deposit : '';
      reqEditorState.list = normReqs(order.requirements);
      setStatusPicker($('#f-status-picker'), order.status || 'todo');
    } else {
      /* 新增模式 */
      editingOrderId = null;
      $('#order-form-title').textContent = '新增商单';
      $('#f-name').value = '';
      $('#f-date').value = '';
      $('#f-fee').value = '';
      $('#f-deposit').value = '';
      reqEditorState.list = [];
      setStatusPicker($('#f-status-picker'), 'todo');
    }
    renderReqList('#f-req-list');
    modal.hidden = false;
  }

  $('#order-add-btn').addEventListener('click', () => openModal(null));
  $('#order-modal-cancel').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  $('#order-modal-save').addEventListener('click', () => {
    const name = $('#f-name').value.trim();
    if (!name) { $('#f-name').focus(); return; }
    const obj = {
      name: name,
      date: $('#f-date').value,
      fee: Number($('#f-fee').value) || 0,
      deposit: Number($('#f-deposit').value) || 0,
      requirements: reqEditorState.list.slice(),
      status: getStatusPicker($('#f-status-picker'))
    };
    if (editingOrderId) {
      const order = data.orders.find((o) => o.id === editingOrderId);
      if (order) Object.assign(order, obj);
    } else {
      obj.id = uid();
      obj.createdAt = Date.now();
      data.orders.unshift(obj);
    }
    saveData();
    modal.hidden = true;
    refreshAll();
  });

  /* ---------- 商单详情(可编辑) ---------- */
  function openOrderDetail(order) {
    if (!order) return;
    editingOrderId = order.id;
    const meta = STATUS_META[order.status] || STATUS_META.todo;
    const st = $('#d-status');
    st.textContent = meta.label;
    st.className = 'status ' + meta.cls;
    $('#e-name').value = order.name || '';
    $('#e-date').value = order.date || '';
    $('#e-fee').value = order.fee != null ? order.fee : '';
    $('#e-deposit').value = order.deposit != null ? order.deposit : '';
    reqEditorState.list = normReqs(order.requirements);
    setStatusPicker($('#e-status-picker'), order.status || 'todo');
    $('#d-created').textContent = order.createdAt
      ? new Date(order.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    renderReqList('#e-req-list');
    detailModal.hidden = false;
  }

  $('#detail-save').addEventListener('click', () => {
    const order = data.orders.find((o) => o.id === editingOrderId);
    if (!order) return;
    const name = $('#e-name').value.trim();
    if (!name) { $('#e-name').focus(); return; }
    order.name = name;
    order.date = $('#e-date').value;
    order.fee = Number($('#e-fee').value) || 0;
    order.deposit = Number($('#e-deposit').value) || 0;
    order.requirements = reqEditorState.list.slice();
    order.status = getStatusPicker($('#e-status-picker'));
    saveData();
    detailModal.hidden = true;
    refreshAll();
  });

  $('#detail-close').addEventListener('click', () => { detailModal.hidden = true; });
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.hidden = true; });

  /* ---------- 确认弹窗(自定义,支持成功/删除两种样式) ---------- */
  const confirmModal = $('#confirm-modal');
  const cfIcon = $('#cf-icon');
  const cfOkBtn = $('#cf-ok');
  let pendingDelete = null;

  /* variant: 'danger'(删除,默认) | 'success'(完成) */
  function askConfirm(title, text, onOk, variant) {
    $('#cf-title').textContent = title;
    $('#cf-text').textContent = text;
    if (variant === 'success') {
      cfIcon.classList.add('cf-icon-success');
      cfIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.5l5 5 10-10" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      cfOkBtn.classList.add('btn-success');
      cfOkBtn.textContent = '确认完成';
    } else {
      cfIcon.classList.remove('cf-icon-success');
      cfIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l1 12a1.5 1.5 0 0 0 1.5 1.4h5A1.5 1.5 0 0 0 16 19l1-12M10 11v5.5M14 11v5.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      cfOkBtn.classList.remove('btn-success');
      cfOkBtn.textContent = '确认删除';
    }
    pendingDelete = { onOk: onOk };
    confirmModal.hidden = false;
  }

  $('#cf-cancel').addEventListener('click', () => { confirmModal.hidden = true; pendingDelete = null; });
  confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) { confirmModal.hidden = true; pendingDelete = null; } });
  $('#cf-ok').addEventListener('click', () => {
    const p = pendingDelete;
    confirmModal.hidden = true;
    pendingDelete = null;
    if (p && p.onOk) p.onOk();
  });

  function deleteOrder(id) {
    const order = data.orders.find((o) => o.id === id);
    if (!order) return;
    askConfirm('删除商单', '确定删除「' + order.name + '」吗?删除后不可恢复。', () => {
      data.orders = data.orders.filter((o) => o.id !== id);
      saveData();
      refreshAll();
    }, 'danger');
  }

  /* 详情内删除 */
  $('#detail-del').addEventListener('click', () => {
    const id = editingOrderId;
    detailModal.hidden = true;
    deleteOrder(id);
  });

  /* ---------- 三页(flow)完成操作:状态流转 ---------- */
  function flowDone(id) {
    const order = data.orders.find((o) => o.id === id);
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    const nextLabel = STATUS_META[next].label;
    askConfirm('完成商单', '将「' + order.name + '」从「' + STATUS_META[order.status].label + '」推进到「' + nextLabel + '」,确定吗?', () => {
      order.status = next;
      saveData();
      refreshAll();
    }, 'success');
  }

  /* 三个状态列表(flow):仅响应"完成"按钮 */
  ['#todo-order-list', '#publish-order-list', '#balance-order-list'].forEach((sel) => {
    const listEl = $(sel);
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act="flow-done"]');
      if (!btn) return;
      const wrap = btn.closest('.swipe-wrap');
      flowDone(wrap && wrap.dataset.id);
    });
  });

  /* 我的列表(full):删除 / 打开详情 */
  ['#mine-order-list'].forEach((sel) => {
    const listEl = $(sel);
    listEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="del-order"]')) {
        const wrap = e.target.closest('.swipe-wrap');
        deleteOrder(wrap && wrap.dataset.id);
        return;
      }
      const wrap = e.target.closest('.swipe-wrap');
      if (!wrap) return;
      if (wrap.classList.contains('swipe-open')) {
        closeSwipes(null);
        return;
      }
      const order = data.orders.find((o) => o.id === wrap.dataset.id);
      openOrderDetail(order);
    });
  });

  /* ---------- 年月筛选器事件 ---------- */
  document.querySelectorAll('.month-filter').forEach((mf) => {
    const isDone = mf.dataset.mf === 'done';
    mf.querySelectorAll('[data-mf-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.mfAct;
        if (isDone) {
          if (act === 'prev') shiftDoneMonth(-1);
          else if (act === 'next') shiftDoneMonth(1);
          else if (act === 'all') toggleDoneMonthAll();
        } else {
          if (act === 'prev') shiftMonth(-1);
          else if (act === 'next') shiftMonth(1);
          else if (act === 'all') toggleMonthAll();
        }
      });
    });
  });

  /* ---------- 移动端滑删交互 ---------- */
  const SWIPE_OFFSET = 76;
  let swipeState = null;

  function closeSwipes(except) {
    if (swipeState && swipeState.wrap !== except) {
      swipeState.body.style.transition = 'transform 0.25s ease';
      swipeState.body.style.transform = 'translateX(0)';
      swipeState.wrap.classList.remove('swipe-open');
      swipeState = null;
    }
  }

  function initSwipe(listEl) {
    listEl.addEventListener('touchstart', (e) => {
      const wrap = e.target.closest('.swipe-wrap');
      if (!wrap) return;
      if (e.target.closest('[data-act="del-order"]')) return;
      closeSwipes(wrap);
      const body = wrap.querySelector('.swipe-body');
      swipeState = { wrap: wrap, body: body, startX: e.touches[0].clientX, startY: e.touches[0].clientY, open: wrap.classList.contains('swipe-open') };
      body.style.transition = 'none';
    }, { passive: true });

    listEl.addEventListener('touchmove', (e) => {
      if (!swipeState) return;
      const dx = e.touches[0].clientX - swipeState.startX;
      const dy = e.touches[0].clientY - swipeState.startY;
      if (Math.abs(dy) > Math.abs(dx)) return;
      e.preventDefault();
      let target = swipeState.open ? SWIPE_OFFSET + dx : dx;
      target = Math.max(0, Math.min(SWIPE_OFFSET, target));
      swipeState.body.style.transform = 'translateX(-' + target + 'px)';
    }, { passive: false });

    listEl.addEventListener('touchend', () => {
      if (!swipeState) return;
      const body = swipeState.body;
      const wrap = swipeState.wrap;
      body.style.transition = 'transform 0.25s ease';
      const willOpen = wrap.classList.contains('swipe-open')
        ? true
        : (SWIPE_OFFSET - parseFloat(body.style.transform.replace(/[^0-9.-]/g, '') || 0)) < SWIPE_OFFSET / 2;
      if (willOpen) {
        body.style.transform = 'translateX(-' + SWIPE_OFFSET + 'px)';
        wrap.classList.add('swipe-open');
        swipeState = { wrap: wrap, body: body, open: true };
      } else {
        body.style.transform = 'translateX(0)';
        wrap.classList.remove('swipe-open');
        swipeState = null;
      }
    });

    listEl.addEventListener('mousedown', (e) => {
      const wrap = e.target.closest('.swipe-wrap');
      if (!wrap) return;
      if (e.target.closest('[data-act="del-order"]')) return;
      closeSwipes(wrap);
      const body = wrap.querySelector('.swipe-body');
      swipeState = { wrap: wrap, body: body, startX: e.clientX, startY: e.clientY, open: wrap.classList.contains('swipe-open') };
      body.style.transition = 'none';
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!swipeState) return;
    const dx = e.clientX - swipeState.startX;
    const dy = e.clientY - swipeState.startY;
    if (Math.abs(dy) > Math.abs(dx)) return;
    let target = swipeState.open ? SWIPE_OFFSET + dx : dx;
    target = Math.max(0, Math.min(SWIPE_OFFSET, target));
    swipeState.body.style.transform = 'translateX(-' + target + 'px)';
  });

  document.addEventListener('mouseup', () => {
    if (!swipeState) return;
    const body = swipeState.body;
    const wrap = swipeState.wrap;
    body.style.transition = 'transform 0.25s ease';
    const open = wrap.classList.contains('swipe-open')
      ? true
      : (SWIPE_OFFSET - parseFloat(body.style.transform.replace(/[^0-9.-]/g, '') || 0)) < SWIPE_OFFSET / 2;
    if (open) {
      body.style.transform = 'translateX(-' + SWIPE_OFFSET + 'px)';
      wrap.classList.add('swipe-open');
      swipeState = { wrap: wrap, body: body, open: true };
    } else {
      body.style.transform = 'translateX(0)';
      wrap.classList.remove('swipe-open');
      swipeState = null;
    }
  });

  /* ---------- 全量刷新 ---------- */
  function refreshAll() {
    renderGreet();
    renderHomePreview();
    renderTodoView();
    renderPublishView();
    renderBalanceView();
    renderDoneView();
    renderMine();
    renderReminder();
    renderBadges();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    initMonthFilter(); /* 默认当前年月 */
    ['#todo-order-list', '#publish-order-list', '#balance-order-list', '#mine-order-list'].forEach((sel) => initSwipe($(sel)));
    renderMonthFilters();
    renderMoneyEye();
    refreshAll();
  }

  init();

  /* ---------- PWA:注册 Service Worker ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 离线环境忽略 */ });
    });
  }
})();
