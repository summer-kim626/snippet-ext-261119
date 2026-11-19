// I-collection — 팝업 화면
// 저장한 문장을 보여 주고, 검색·복사·메모·삭제를 처리한다.

const STORAGE_KEY = 'sentences';
const MEMO_MAX = 200;

// 하단 표시 정보 — 문의 주소가 생기면 CONTACT_URL에 넣어 주세요 (https:// 또는 mailto:)
const AUTHOR_NAME = 'Seungyeop';
const CONTACT_LABEL = 'Instagram';
const CONTACT_URL = 'https://www.instagram.com/yuup_seung/';

const state = {
  items: [],
  query: '',
  editingId: null,
  draft: '',
  copiedId: null,
  confirming: false
};
let copyTimer = null;

const el = {
  count: document.getElementById('count'),
  searchWrap: document.getElementById('search-wrap'),
  search: document.getElementById('search'),
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  footer: document.getElementById('footer'),
  footerNormal: document.getElementById('footer-normal'),
  footerConfirm: document.getElementById('footer-confirm'),
  confirmText: document.getElementById('confirm-text'),
  clear: document.getElementById('clear'),
  clearCancel: document.getElementById('clear-cancel'),
  clearOk: document.getElementById('clear-ok'),
  toast: document.getElementById('toast'),
  toastText: document.getElementById('toast-text')
};
let toastTimer = null;

// 팝업 아래쪽에 토스트를 2.2초 동안 띄운다 (새 토스트가 오면 바로 교체)
function showToast(message) {
  clearTimeout(toastTimer);
  el.toastText.textContent = message;
  el.toast.classList.remove('show');
  void el.toast.offsetWidth; // 다시 올라오는 애니메이션을 위해 리플로우
  el.toast.classList.add('show');
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

// ---------- 저장소 ----------

async function loadItems() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  state.items = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  render();
}

function saveItems(items) {
  state.items = items;
  render();
  return chrome.storage.local.set({ [STORAGE_KEY]: items });
}

// 팝업이 열려 있는 동안 다른 곳에서 저장되면 바로 반영
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  state.items = changes[STORAGE_KEY].newValue || [];
  if (state.editingId && !state.items.some((it) => it.id === state.editingId)) {
    state.editingId = null;
    state.draft = '';
  }
  render();
});

// ---------- 화면 그리기 ----------

function render() {
  const total = state.items.length;
  const isEmpty = total === 0;

  el.count.textContent = `${total}개 저장됨`;
  el.empty.hidden = !isEmpty;
  el.searchWrap.hidden = isEmpty;
  el.list.hidden = isEmpty;
  el.footer.hidden = isEmpty;

  if (isEmpty) {
    state.confirming = false;
    state.query = '';
    el.search.value = '';
  }

  el.footerNormal.hidden = state.confirming;
  el.footerConfirm.hidden = !state.confirming;
  el.confirmText.textContent = `${total}개를 모두 지울까요?`;

  renderList();
}

function renderList() {
  const q = state.query.trim().toLowerCase();
  const visible = state.items.filter((it) => {
    if (!q) return true;
    return [it.text, it.memo, it.title, it.source].some((v) => (v || '').toLowerCase().includes(q));
  });

  el.list.replaceChildren();

  if (state.items.length > 0 && visible.length === 0) {
    const p = document.createElement('p');
    p.className = 'no-results';
    p.textContent = '검색 결과가 없어요.';
    el.list.append(p);
    return;
  }

  for (const item of visible) {
    el.list.append(renderCard(item));
  }

  if (state.editingId) {
    const ta = el.list.querySelector('textarea');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }
}

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'card';

  const text = document.createElement('p');
  text.className = 'text';
  text.textContent = item.text;
  card.append(text);

  const editing = state.editingId === item.id;
  if (editing) {
    card.append(renderMemoEditor(item));
  } else if (item.memo) {
    const memo = document.createElement('button');
    memo.type = 'button';
    memo.className = 'memo-view';
    memo.title = '눌러서 메모 수정';
    const span = document.createElement('span');
    span.textContent = item.memo;
    memo.append(icon('pencil', 13, '#2156D9'), span);
    memo.addEventListener('click', () => startMemo(item));
    card.append(memo);
  }

  // 출처 + 날짜
  const meta = document.createElement('div');
  meta.className = 'meta';

  const src = document.createElement('div');
  src.className = 'src';
  if (isWebUrl(item.url)) {
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = item.title || item.source;
    a.title = item.url;
    src.append(a);
  } else {
    const span = document.createElement('span');
    span.className = 'no-link';
    span.textContent = item.title || item.source || '알 수 없는 페이지';
    src.append(span);
  }
  const date = document.createElement('span');
  date.className = 'date';
  date.textContent = formatDate(item.createdAt);
  src.append(date);

  // 메모 · 복사 · 삭제 버튼
  const actions = document.createElement('div');
  actions.className = 'actions';

  const memoBtn = iconButton('pencil', item.memo ? '메모 수정' : '메모 추가');
  memoBtn.addEventListener('click', () => startMemo(item));

  const copied = state.copiedId === item.id;
  const copyBtn = iconButton(copied ? 'check' : 'copy', '문장 복사');
  if (copied) {
    copyBtn.classList.add('copied');
    const label = document.createElement('span');
    label.textContent = '복사됨';
    copyBtn.append(label);
  }
  copyBtn.addEventListener('click', () => copyItem(item));

  const delBtn = iconButton('trash', '문장 삭제');
  delBtn.addEventListener('click', () => deleteItem(item));

  actions.append(memoBtn, copyBtn, delBtn);
  meta.append(src, actions);
  card.append(meta);
  return card;
}

function renderMemoEditor(item) {
  const wrap = document.createElement('div');
  wrap.className = 'memo-edit';

  const id = `memo-${item.id}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = '메모';

  const ta = document.createElement('textarea');
  ta.id = id;
  ta.rows = 3;
  ta.maxLength = MEMO_MAX;
  ta.placeholder = '이 문장을 저장한 이유, 떠오른 생각을 적어 보세요';
  ta.value = state.draft;

  const row = document.createElement('div');
  row.className = 'memo-row';
  const counter = document.createElement('span');
  counter.className = 'memo-count';
  counter.textContent = `${state.draft.length}/${MEMO_MAX}`;

  ta.addEventListener('input', () => {
    state.draft = ta.value;
    counter.textContent = `${ta.value.length}/${MEMO_MAX}`;
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveMemo(item);
    }
  });

  const btns = document.createElement('div');
  btns.className = 'btn-row';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = '취소';
  cancel.addEventListener('click', cancelMemo);
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'btn primary';
  ok.textContent = '메모 저장';
  ok.addEventListener('click', () => saveMemo(item));
  btns.append(cancel, ok);

  row.append(counter, btns);
  wrap.append(label, ta, row);
  return wrap;
}

// ---------- 동작 ----------

function startMemo(item) {
  state.editingId = item.id;
  state.draft = item.memo || '';
  renderList();
}

function cancelMemo() {
  state.editingId = null;
  state.draft = '';
  renderList();
}

function saveMemo(item) {
  const memo = state.draft.trim().slice(0, MEMO_MAX);
  state.editingId = null;
  state.draft = '';
  // 메모를 비우고 저장하면 메모가 삭제된다
  saveItems(state.items.map((it) => (it.id === item.id ? { ...it, memo } : it)));
}

async function copyItem(item) {
  try {
    await navigator.clipboard.writeText(item.text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = item.text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  state.copiedId = item.id;
  renderList();
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    state.copiedId = null;
    renderList();
  }, 1400);
}

function deleteItem(item) {
  if (state.editingId === item.id) {
    state.editingId = null;
    state.draft = '';
  }
  saveItems(state.items.filter((it) => it.id !== item.id));
  showToast('문장을 삭제했어요');
}

el.search.addEventListener('input', () => {
  state.query = el.search.value;
  renderList();
});

el.clear.addEventListener('click', () => {
  state.confirming = true;
  render();
  el.clearCancel.focus();
});
el.clearCancel.addEventListener('click', () => {
  state.confirming = false;
  render();
});
el.clearOk.addEventListener('click', () => {
  const count = state.items.length;
  state.confirming = false;
  state.editingId = null;
  state.draft = '';
  saveItems([]);
  showToast(`${count}개 문장을 모두 삭제했어요`);
});

// ---------- 도우미 ----------

function isWebUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;
}

const ICONS = {
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  copy: ['M9 9h11v11H9z', 'M5 15V5a1 1 0 0 1 1-1h10'],
  check: ['M5 12l5 5 9-10'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3']
};

function icon(name, size = 16, color = 'currentColor') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function iconButton(name, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.append(icon(name));
  return btn;
}

// 상단 버전(manifest.json의 version) + 하단 만든 사람·문의 채널
function renderCredit() {
  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
  document.getElementById('author').textContent = AUTHOR_NAME;
  const contact = document.getElementById('contact');
  if (/^(https?:|mailto:)/.test(CONTACT_URL)) {
    const a = document.createElement('a');
    a.href = CONTACT_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = CONTACT_LABEL;
    contact.replaceChildren(a);
  } else {
    contact.textContent = '문의 채널 준비 중';
  }
}

renderCredit();
loadItems();
