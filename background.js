// I-collection — 백그라운드 서비스 워커
// 우클릭 메뉴를 만들고, 메뉴를 누르면 선택한 문장을 chrome.storage.local에 저장한다.
// 저장 결과는 웹페이지 위 토스트 메시지 + 툴바 아이콘 배지로 알려 준다.

const MENU_ID = 'save-sentence';
const STORAGE_KEY = 'sentences';
const BADGE_MS = 1600;

let badgeTimer = null;

// 설치·업데이트 시 우클릭 메뉴 등록 (텍스트를 선택했을 때만 보임)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'I-collection에 저장',
      contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const text = (info.selectionText || '').replace(/\s+/g, ' ').trim();
  if (!text) return;

  const url = info.pageUrl || (tab && tab.url) || '';
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const items = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];

  // 같은 문장은 두 번 저장하지 않는다
  if (items.some((item) => item.text === text)) {
    flashBadge('중복', '#6B716D');
    showPageToast(tab, 'warn', '이미 저장된 문장이에요');
    return;
  }

  items.unshift({
    id: crypto.randomUUID(),
    text,
    url,
    // activeTab 덕분에 메뉴를 누른 탭의 제목을 읽을 수 있다
    title: ((tab && tab.title) || '').trim(),
    source: sourceName(url),
    createdAt: new Date().toISOString(),
    memo: ''
  });

  await chrome.storage.local.set({ [STORAGE_KEY]: items });
  flashBadge('+1', '#B4532A');
  showPageToast(tab, 'ok', '문장을 저장했어요');
});

function sourceName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || '알 수 없는 페이지';
  } catch (e) {
    return '알 수 없는 페이지';
  }
}

// 툴바 아이콘에 잠깐 배지를 띄운다
function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), BADGE_MS);
}

// 메뉴를 누른 탭에 토스트를 띄운다.
// chrome:// 페이지, 웹 스토어처럼 스크립트를 넣을 수 없는 곳에서는 조용히 넘어가고 배지만 남는다.
async function showPageToast(tab, kind, message) {
  if (!tab || tab.id === undefined || tab.id < 0) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderToast,
      args: [kind, message]
    });
  } catch (e) {
    // 토스트를 넣을 수 없는 페이지
  }
}

// 이 함수는 웹페이지 안에서 실행된다 (바깥 변수 사용 불가).
// 페이지의 CSS와 섞이지 않도록 Shadow DOM 안에 그린다.
function renderToast(kind, message) {
  const HOST_ID = '__my-sentences-toast__';
  const old = document.getElementById(HOST_ID);
  if (old) old.remove();
  if (window.__mySentencesToastTimer) clearTimeout(window.__mySentencesToastTimer);

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; position: fixed; left: 0; right: 0; bottom: 33vh; display: flex; justify-content: center; z-index: 2147483647; pointer-events: none;';
  const root = host.attachShadow({ mode: 'closed' });

  const iconColor = kind === 'warn' ? '#F2B279' : '#8FB4FF';
  const iconPath = kind === 'warn'
    ? '<path d="M12 8v5"/><path d="M12 16.5v.01"/>'
    : '<path d="M8 12l3 3 5-6"/>';

  root.innerHTML = `
    <style>
      .toast {
        display: flex; align-items: center; gap: 10px;
        padding: 12px 18px 12px 14px; border-radius: 10px;
        background: #1B1E1C; color: #FFFFFF;
        font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
        box-shadow: 0 10px 28px rgba(20, 24, 22, 0.25);
        max-width: calc(100vw - 32px); box-sizing: border-box;
        white-space: nowrap;
        animation: in .22s ease-out;
        transition: opacity .2s ease, transform .2s ease;
      }
      .toast.out { opacity: 0; transform: translateY(8px); }
      svg { flex-shrink: 0; }
      @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .toast { animation: none; transition: none; } }
    </style>
    <div class="toast" role="status" aria-live="polite">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/>${iconPath}</svg>
      <span class="msg"></span>
    </div>`;
  // 메시지는 textContent로 넣는다
  root.querySelector('.msg').textContent = message;

  (document.body || document.documentElement).appendChild(host);

  window.__mySentencesToastTimer = setTimeout(() => {
    const toast = root.querySelector('.toast');
    if (toast) toast.classList.add('out');
    setTimeout(() => host.remove(), 220);
  }, 2200);
}
