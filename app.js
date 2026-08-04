/* ============================================================
   三火工作台 - PWA 单页应用逻辑
   免登录 · 数据存 localStorage · 离线可用
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 数据层:localStorage ---------- */
  /* v2:清除 v1 时代的内置演示数据,新用户从空状态开始 */
  const STORE_KEY = 'sanhuo-workbench-v2';

  /* 内置数据为空:首次打开是干净状态,由用户自行添加 */
  const DEFAULT_DATA = {
    todos: [],
    orders: []
  };

  function loadData() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.todos) && Array.isArray(data.orders)) {
          return data;
        }
      }
      /* 新用户:返回空数据并落盘一次 */
      const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
      localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
      return fresh;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  }

  let data = loadData();

  function saveData() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      /* 存储失败静默处理 */
    }
  }

  /* ---------- 工具 ---------- */
  const $ = (sel) => document.querySelector(sel);

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 时间格式化 */
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

  /* ---------- 导航 ---------- */
  const views = ['home', 'todo', 'balance'];

  function switchView(name) {
    views.forEach((v) => {
      $('#view-' + v).classList.toggle('active', v === name);
    });
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.goto));
  });

  /* ---------- 首页欢迎语(按时间) ---------- */
  function renderGreet() {
    const h = new Date().getHours();
    let title = '三火,早上好呀!';
    if (h >= 5 && h < 11) title = '三火,早上好呀!';
    else if (h >= 11 && h < 14) title = '三火,中午好呀!';
    else if (h >= 14 && h < 18) title = '三火,下午好呀!';
    else title = '三火,晚上好呀!';
    $('#greet-title').textContent = title;

    const week = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    $('#today-date').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · 周' + week[now.getDay()];
  }

  /* ---------- 待办 ---------- */
  let todoFilter = 'all';

  const TAG_MAP = { work: '工作', asset: '素材', order: '商单', life: '生活' };
  const TAG_CLS = { work: 'work', asset: 'asset', order: 'order', life: 'order' };

  function activeTodos() {
    return data.todos.filter((t) => !t.done);
  }

  function renderTodos() {
    const list = $('#todo-list');
    const filtered = data.todos.filter((t) => {
      if (todoFilter === 'active') return !t.done;
      if (todoFilter === 'done') return t.done;
      return true;
    });

    if (data.todos.length === 0) {
      list.innerHTML = '<div class="empty-tip">今天没有待办,好好放松一下吧</div>';
    } else if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-tip">这个分类下暂无事项</div>';
    } else {
      const activeItems = filtered.filter((t) => !t.done);
      const doneItems = filtered.filter((t) => t.done);
      let html = '';

      activeItems.forEach((t) => {
        html += renderTodoItem(t);
      });
      if (doneItems.length > 0) {
        html += '<div class="group-title">已完成</div>';
        doneItems.forEach((t) => {
          html += renderTodoItem(t);
        });
      }
      list.innerHTML = html;
    }
  }

  function renderTodoItem(t) {
    const tagCls = TAG_CLS[t.tag] || 'work';
    const tagName = TAG_MAP[t.tag] || '生活';
    /* 时间展示:优先用户设置的截止时间,否则显示创建时间 */
    let timeStr = t.due || '';
    if (!timeStr && t.createdAt) {
      const d = new Date(t.createdAt);
      if (!isNaN(d.getTime())) {
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        timeStr = sameDay ? '今天 ' + hh + ':' + mm : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hh + ':' + mm;
      }
    }
    const due = timeStr ? '<span class="t-due">' + esc(timeStr) + '</span>' : '';
    const tag = '<span class="t-tag ' + tagCls + '">' + tagName + '</span>';
    return (
      '<div class="swipe-wrap" data-id="' + t.id + '">' +
        '<button class="swipe-del" data-act="del" aria-label="删除">删除</button>' +
        '<div class="swipe-body todo-item' + (t.done ? ' done' : '') + '">' +
          '<button class="todo-check" data-act="toggle" aria-label="完成">' +
            '<svg viewBox="0 0 24 24" fill="none"><path d="m8 12.2 2.8 2.8L16.5 9.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<div class="todo-body">' +
            '<div class="todo-txt">' + esc(t.text) + '</div>' +
            '<div class="todo-meta">' + tag + due + '</div>' +
          '</div>' +
          '<button class="todo-del" data-act="del" aria-label="删除">' +
            '<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l1 12a1.5 1.5 0 0 0 1.5 1.4h5A1.5 1.5 0 0 0 16 19l1-12M10 11v5.5M14 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function addTodo() {
    const input = $('#todo-input');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    const timeVal = $('#todo-time').value;
    const tag = $('#todo-tag').value || 'work';
    data.todos.unshift({
      id: uid(),
      text: text,
      done: false,
      tag: tag,
      /* 用户选的 datetime-local 转成友好展示,存原始 ISO */
      due: timeVal ? fmtDue(timeVal, true) : '',
      dueISO: timeVal || '',
      createdAt: Date.now()
    });
    input.value = '';
    $('#todo-time').value = '';
    saveData();
    renderTodos();
    renderHomePreview();
    renderBadges();
  }

  $('#todo-add').addEventListener('click', addTodo);
  $('#todo-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
  });

  $('#todo-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const wrap = btn.closest('.swipe-wrap');
    const id = wrap && wrap.dataset.id;
    const todo = data.todos.find((t) => t.id === id);
    if (!todo) return;

    if (btn.dataset.act === 'toggle') {
      todo.done = !todo.done;
      if (todo.done) todo.doneAt = Date.now();
      saveData();
    } else if (btn.dataset.act === 'del') {
      data.todos = data.todos.filter((t) => t.id !== id);
      saveData();
    }
    renderTodos();
    renderHomePreview();
    renderBadges();
  });

  document.querySelectorAll('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      todoFilter = btn.dataset.filter;
      document.querySelectorAll('.filter').forEach((b) => b.classList.toggle('active', b === btn));
      renderTodos();
    });
  });

  /* ---------- 结余 ---------- */
  function renderOrders() {
    const list = $('#order-list');
    const sorted = data.orders.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (sorted.length === 0) {
      list.innerHTML = '<div class="empty-tip">还没有商单记录,点右下角添加吧</div>';
    } else {
      list.innerHTML = sorted.map((o) => {
        const st = o.published
          ? '<span class="status published">已发布</span>'
          : '<span class="status unpublished">未发布</span>';
        const datePart = fmtDue(o.date, true) || '未排期';
        return (
          '<div class="swipe-wrap" data-id="' + o.id + '">' +
            '<button class="swipe-del" data-act="del-order" aria-label="删除">删除</button>' +
            '<div class="swipe-body order-card">' +
              '<div class="order-head"><span class="order-name">' + esc(o.name) + '</span>' +
                '<span class="order-head-right">' + st +
                  '<button class="order-del" data-act="del-order" aria-label="删除">' +
                    '<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M7 7l1 12a1.5 1.5 0 0 0 1.5 1.4h5A1.5 1.5 0 0 0 16 19l1-12M10 11v5.5M14 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                  '</button>' +
                '</span>' +
              '</div>' +
              '<div class="order-meta"><span>' + esc(datePart) + '</span><span>·</span><span class="fee">' + money(o.fee) + '</span></div>' +
              (o.requirement ? '<div class="order-req">' + esc(o.requirement) + '</div>' : '') +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    /* 统计卡 */
    const total = data.orders.length;
    const published = data.orders.filter((o) => o.published).length;
    const income = data.orders.filter((o) => o.published).reduce((s, o) => s + (Number(o.fee) || 0), 0);
    $('#sb-total').textContent = total;
    $('#sb-published').textContent = published;
    $('#sb-income').textContent = money(income);
  }

  function renderReminder() {
    const now = new Date();
    const upcoming = data.orders
      .filter((o) => o.date && new Date(o.date) > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const unpublished = data.orders.filter((o) => !o.published).length;

    const bar = $('#reminder-bar');
    if (upcoming.length > 0) {
      const next = upcoming[0];
      $('#reminder-main').textContent = fmtDue(next.date, true) + ' · ' + next.name;
      $('#reminder-sub').textContent = unpublished > 0
        ? '还有 ' + unpublished + ' 个未发布商单待处理'
        : '所有商单均已发布,真棒!';
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }

  /* ---------- 首页预览 ---------- */
  function renderHomePreview() {
    const active = activeTodos();
    const total = data.todos.length;

    /* 待办预览 */
    $('#todo-count-chip').textContent = active.length + ' 项未完成';
    $('#todo-progress').style.width = total === 0 ? '0%' : Math.round((total - active.length) / total * 100) + '%';
    const previewList = $('#todo-preview-list');
    const shown = data.todos.slice(0, 2);
    previewList.innerHTML = shown.length === 0
      ? '<div class="empty-tip">今天没有待办,好好放松一下吧</div>'
      : shown.map((t) =>
          '<div class="task-row' + (t.done ? ' done' : '') + '"><span class="t-dot"></span><span class="t-txt">' + esc(t.text) + '</span></div>'
        ).join('');

    /* 结余预览 */
    const now = new Date();
    const thisMonth = data.orders.filter((o) => {
      const d = new Date(o.date);
      return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const monthIncome = thisMonth.filter((o) => o.published).reduce((s, o) => s + (Number(o.fee) || 0), 0);
    const upcoming = data.orders.filter((o) => o.date && new Date(o.date) > now).length;
    const unpublished = data.orders.filter((o) => !o.published).length;

    $('#balance-count-chip').textContent = unpublished + ' 单待发布';
    $('#b-income').textContent = money(monthIncome);
    $('#b-count').textContent = thisMonth.length + ' 单';
    $('#b-upcoming').textContent = upcoming + ' 项';
  }

  /* ---------- 徽标 ---------- */
  function renderBadges() {
    const todoLeft = activeTodos().length;
    const unPub = data.orders.filter((o) => !o.published).length;

    $('#badge-todo').textContent = todoLeft;
    $('#badge-todo').style.display = todoLeft > 0 ? 'flex' : 'none';
    $('#badge-balance').textContent = unPub;
    $('#badge-balance').style.display = unPub > 0 ? 'flex' : 'none';

    $('#todo-head-chip').textContent = todoLeft > 0 ? '剩 ' + todoLeft + ' 项' : '全部完成';
    $('#balance-head-chip').textContent = unPub > 0 ? unPub + ' 单未发布' : '全部已发布';
  }

  /* ---------- 商单弹窗 ---------- */
  const modal = $('#order-modal');

  function openModal() {
    $('#f-name').value = '';
    $('#f-date').value = '';
    $('#f-fee').value = '';
    $('#f-requirement').value = '';
    $('#f-published').checked = false;
    modal.hidden = false;
  }

  $('#order-add-btn').addEventListener('click', openModal);
  $('#order-modal-cancel').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  $('#order-modal-save').addEventListener('click', () => {
    const name = $('#f-name').value.trim();
    const date = $('#f-date').value;
    const fee = $('#f-fee').value;
    const requirement = $('#f-requirement').value.trim();
    const published = $('#f-published').checked;
    if (!name) { $('#f-name').focus(); return; }
    data.orders.unshift({
      id: uid(),
      name: name,
      date: date,
      fee: Number(fee) || 0,
      requirement: requirement,
      published: published,
      createdAt: Date.now()
    });
    saveData();
    modal.hidden = true;
    renderOrders();
    renderReminder();
    renderHomePreview();
    renderBadges();
  });

  /* ---------- 商单删除(常显按钮,自定义确认) ---------- */
  const confirmModal = $('#confirm-modal');
  let pendingDelete = null; /* { type: 'todo'|'order', id, name } */

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

  $('#order-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del-order"]');
    if (!btn) return;
    const wrap = btn.closest('.swipe-wrap');
    const id = wrap && wrap.dataset.id;
    const order = data.orders.find((o) => o.id === id);
    if (!order) return;
    askConfirm('删除商单', '确定删除「' + order.name + '」吗?删除后不可恢复。', () => {
      data.orders = data.orders.filter((o) => o.id !== id);
      saveData();
      renderOrders();
      renderReminder();
      renderHomePreview();
      renderBadges();
    });
  });

  /* ---------- 点击商单查看/编辑详情 ---------- */
  const detailModal = $('#detail-modal');
  let editingOrderId = null;

  function openOrderDetail(order) {
    if (!order) return;
    editingOrderId = order.id;
    const st = $('#d-status');
    st.textContent = order.published ? '已发布' : '未发布';
    st.className = 'status ' + (order.published ? 'published' : 'unpublished');
    $('#e-name').value = order.name || '';
    $('#e-date').value = order.date || '';
    $('#e-fee').value = order.fee != null ? order.fee : '';
    $('#e-req').value = order.requirement || '';
    $('#e-published').checked = !!order.published;
    $('#d-created').textContent = order.createdAt
      ? new Date(order.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    detailModal.hidden = false;
  }

  /* 保存修改 */
  $('#detail-save').addEventListener('click', () => {
    const order = data.orders.find((o) => o.id === editingOrderId);
    if (!order) return;
    const name = $('#e-name').value.trim();
    if (!name) { $('#e-name').focus(); return; }
    order.name = name;
    order.date = $('#e-date').value;
    order.fee = Number($('#e-fee').value) || 0;
    order.requirement = $('#e-req').value.trim();
    order.published = $('#e-published').checked;
    saveData();
    detailModal.hidden = true;
    renderOrders();
    renderReminder();
    renderHomePreview();
    renderBadges();
  });

  /* 详情内删除 */
  $('#detail-del').addEventListener('click', () => {
    const order = data.orders.find((o) => o.id === editingOrderId);
    if (!order) return;
    detailModal.hidden = true;
    askConfirm('删除商单', '确定删除「' + order.name + '」吗?删除后不可恢复。', () => {
      data.orders = data.orders.filter((o) => o.id !== editingOrderId);
      saveData();
      renderOrders();
      renderReminder();
      renderHomePreview();
      renderBadges();
    });
  });

  $('#detail-close').addEventListener('click', () => { detailModal.hidden = true; });
  detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.hidden = true; });

  $('#order-list').addEventListener('click', (e) => {
    /* 点击删除按钮不弹详情 */
    if (e.target.closest('[data-act="del-order"]')) return;
    const wrap = e.target.closest('.swipe-wrap');
    if (!wrap) return;
    /* 卡片处于滑开状态时,点击卡片本身先收起,不弹详情 */
    if (wrap.classList.contains('swipe-open')) {
      closeSwipes(null);
      return;
    }
    const order = data.orders.find((o) => o.id === wrap.dataset.id);
    openOrderDetail(order);
  });

  /* ---------- 移动端滑删交互(touch / mouse) ---------- */
  const SWIPE_OFFSET = 76; /* 露出删除按钮的宽度 */
  let swipeState = null;   /* 当前滑开的项 { wrap, body, startX, startY, open } */

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
      /* 点击删除按钮时不要触发滑动手势 */
      if (e.target.closest('[data-act="del"], [data-act="del-order"]')) return;
      closeSwipes(wrap);
      const body = wrap.querySelector('.swipe-body');
      swipeState = { wrap: wrap, body: body, startX: e.touches[0].clientX, startY: e.touches[0].clientY, open: wrap.classList.contains('swipe-open') };
      body.style.transition = 'none';
    }, { passive: true });

    listEl.addEventListener('touchmove', (e) => {
      if (!swipeState) return;
      const dx = e.touches[0].clientX - swipeState.startX;
      const dy = e.touches[0].clientY - swipeState.startY;
      /* 纵向滚动优先,不劫持 */
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

    /* 鼠标拖拽(桌面调试) */
    listEl.addEventListener('mousedown', (e) => {
      const wrap = e.target.closest('.swipe-wrap');
      if (!wrap) return;
      if (e.target.closest('[data-act="del"], [data-act="del-order"]')) return;
      closeSwipes(wrap);
      const body = wrap.querySelector('.swipe-body');
      swipeState = { wrap: wrap, body: body, startX: e.clientX, startY: e.clientY, open: wrap.classList.contains('swipe-open') };
      body.style.transition = 'none';
    });

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

    /* 点击空白处收起 */
    listEl.addEventListener('click', (e) => {
      if (!e.target.closest('.swipe-wrap')) closeSwipes(null);
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    renderGreet();
    renderTodos();
    renderOrders();
    renderReminder();
    renderHomePreview();
    renderBadges();
    initSwipe($('#todo-list'));
    initSwipe($('#order-list'));
  }

  init();

  /* ---------- PWA:注册 Service Worker ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 离线环境忽略 */ });
    });
  }
})();
