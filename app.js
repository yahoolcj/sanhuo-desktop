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

  function money(n) {
    const v = Number(n) || 0;
    return '¥' + v.toLocaleString('zh-CN');
  }

  /* 要求项:数组 ↔ 文本 */
  function reqToText(arr) {
    return Array.isArray(arr) ? arr.filter(Boolean).join('\n') : '';
  }
  function reqToList(str) {
    return String(str || '').split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /* ---------- 导航 ---------- */
  const views = ['home', 'todo', 'publish', 'balance', 'mine'];
  let mineFilter = 'all'; /* 我的页状态筛选 */

  function switchView(name) {
    views.forEach((v) => {
      $('#view-' + v).classList.toggle('active', v === name);
    });
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    if (name === 'mine' && mineFilter === 'all') renderMine();
    if (name === 'todo') renderTodoView();
    if (name === 'publish') renderPublishView();
    if (name === 'balance') renderBalanceView();
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      /* 首页状态统计卡:点击后跳转并设置我的页筛选 */
      if (btn.dataset.status) {
        mineFilter = btn.dataset.status;
        document.querySelectorAll('#mine-filters .filter').forEach((f) => {
          f.classList.toggle('active', f.dataset.status === mineFilter);
        });
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

  /* ---------- 商单卡片渲染(通用) ---------- */
  function renderOrderCard(o) {
    const meta = STATUS_META[o.status] || STATUS_META.todo;
    const st = '<span class="status ' + meta.cls + '">' + meta.label + '</span>';
    const datePart = fmtDue(o.date, true) || '未排期';
    const fee = money(o.fee);
    const deposit = o.deposit ? '<span class="dep">定金 ' + money(o.deposit) + '</span>' : '';
    const reqs = Array.isArray(o.requirements) && o.requirements.length
      ? '<div class="order-req">' + o.requirements.map((r) => '<span class="req-item">· ' + esc(r) + '</span>').join('') + '</div>'
      : '';
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

  function renderOrderList(listEl, orders) {
    if (orders.length === 0) {
      listEl.innerHTML = '<div class="empty-tip">这里还没有商单</div>';
      return;
    }
    const sorted = orders.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    listEl.innerHTML = sorted.map(renderOrderCard).join('');
  }

  /* ---------- 待办视图(状态=todo) ---------- */
  function renderTodoView() {
    const orders = data.orders.filter((o) => o.status === 'todo');
    $('#todo-head-chip').textContent = orders.length + ' 单';
    renderOrderList($('#todo-order-list'), orders);
  }

  /* ---------- 发布视图(状态=pending) ---------- */
  function renderPublishView() {
    const orders = data.orders.filter((o) => o.status === 'pending');
    $('#publish-head-chip').textContent = orders.length + ' 单';
    renderOrderList($('#publish-order-list'), orders);
  }

  /* ---------- 结余视图(状态=collect) ---------- */
  function renderBalanceView() {
    const orders = data.orders.filter((o) => o.status === 'collect');
    $('#balance-head-chip').textContent = orders.length + ' 单';
    renderOrderList($('#balance-order-list'), orders);

    /* 统计:待收总额 = 费用合计;定金已收 = 定金合计 */
    const amount = orders.reduce((s, o) => s + (Number(o.fee) || 0), 0);
    const deposit = orders.reduce((s, o) => s + (Number(o.deposit) || 0), 0);
    $('#sb-count').textContent = orders.length;
    $('#sb-amount').textContent = money(amount);
    $('#sb-deposit').textContent = money(deposit);
  }

  /* ---------- 我的视图(全部 + 状态筛选) ---------- */
  function renderMine() {
    const filtered = mineFilter === 'all'
      ? data.orders.slice()
      : data.orders.filter((o) => o.status === mineFilter);
    $('#mine-total-chip').textContent = '共 ' + data.orders.length + ' 单';
    renderOrderList($('#mine-order-list'), filtered);
  }

  document.querySelectorAll('#mine-filters .filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      mineFilter = btn.dataset.status;
      document.querySelectorAll('#mine-filters .filter').forEach((b) => b.classList.toggle('active', b === btn));
      renderMine();
    });
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
    const collectAmount = collect.reduce((s, o) => s + (Number(o.fee) || 0), 0);
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

  /* ---------- 菜单徽标 ---------- */
  function renderBadges() {
    const todoCount = data.orders.filter((o) => o.status === 'todo').length;
    const publishCount = data.orders.filter((o) => o.status === 'pending').length;
    const collectCount = data.orders.filter((o) => o.status === 'collect').length;

    $('#badge-todo').textContent = todoCount;
    $('#badge-todo').style.display = todoCount > 0 ? 'flex' : 'none';
    $('#badge-publish').textContent = publishCount;
    $('#badge-publish').style.display = publishCount > 0 ? 'flex' : 'none';
    $('#badge-balance').textContent = collectCount;
    $('#badge-balance').style.display = collectCount > 0 ? 'flex' : 'none';
  }

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

  function openModal(order) {
    if (order) {
      /* 编辑模式 */
      editingOrderId = order.id;
      $('#order-form-title').textContent = '编辑商单';
      $('#f-name').value = order.name || '';
      $('#f-date').value = order.date || '';
      $('#f-fee').value = order.fee != null ? order.fee : '';
      $('#f-deposit').value = order.deposit != null ? order.deposit : '';
      $('#f-requirements').value = reqToText(order.requirements);
      setStatusPicker($('#f-status-picker'), order.status || 'todo');
    } else {
      /* 新增模式 */
      editingOrderId = null;
      $('#order-form-title').textContent = '新增商单';
      $('#f-name').value = '';
      $('#f-date').value = '';
      $('#f-fee').value = '';
      $('#f-deposit').value = '';
      $('#f-requirements').value = '';
      setStatusPicker($('#f-status-picker'), 'todo');
    }
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
      requirements: reqToList($('#f-requirements').value),
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
    $('#e-req').value = reqToText(order.requirements);
    setStatusPicker($('#e-status-picker'), order.status || 'todo');
    $('#d-created').textContent = order.createdAt
      ? new Date(order.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
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
    order.requirements = reqToList($('#e-req').value);
    order.status = getStatusPicker($('#e-status-picker'));
    saveData();
    detailModal.hidden = true;
    refreshAll();
  });

  $('#detail-close').addEventListener('click', () => { detailModal.hidden = true; });
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.hidden = true; });

  /* ---------- 删除(自定义确认) ---------- */
  const confirmModal = $('#confirm-modal');
  let pendingDelete = null;

  function askConfirm(title, text, onOk) {
    $('#cf-title').textContent = title;
    $('#cf-text').textContent = text;
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
    });
  }

  /* 详情内删除 */
  $('#detail-del').addEventListener('click', () => {
    const id = editingOrderId;
    detailModal.hidden = true;
    deleteOrder(id);
  });

  /* 四个列表的点击委托:删除 / 打开详情 */
  ['#todo-order-list', '#publish-order-list', '#balance-order-list', '#mine-order-list'].forEach((sel) => {
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
    renderMine();
    renderReminder();
    renderBadges();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    ['#todo-order-list', '#publish-order-list', '#balance-order-list', '#mine-order-list'].forEach((sel) => initSwipe($(sel)));
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
