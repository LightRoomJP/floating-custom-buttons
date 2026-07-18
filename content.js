(() => {
  'use strict';

  const ROOT_ID = 'fcb-root';
  const MAX_BUTTONS = 10;
  const DEFAULT_SETTINGS = { enabled: true, editMode: false, buttons: [] };
  const ACTIONS = {
    reload: { icon: '↻', title: '再読み込み' },
    back: { icon: '←', title: '戻る' },
    forward: { icon: '→', title: '進む' },
    home: { icon: '⌂', title: 'サイトTOPへ' },
    url: { icon: '↗', title: 'URLを開く' },
    newTab: { icon: '⧉', title: 'URLを新しいタブで開く' }
  };

  let settings = DEFAULT_SETTINGS;
  let root = null;
  let draggedButtonId = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSettings(raw = {}) {
    const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    return {
      enabled: raw.enabled !== false,
      editMode: Boolean(raw.editMode),
      buttons: Array.isArray(raw.buttons) ? raw.buttons.slice(0, MAX_BUTTONS).map((button, index) => ({
        id: String(button.id || `button-${index + 1}`),
        label: String(button.label || ACTIONS[button.action]?.title || 'ボタン').slice(0, 20),
        action: ACTIONS[button.action] ? button.action : 'reload',
        url: String(button.url || ''),
        color: /^#[0-9a-f]{6}$/i.test(button.color) ? button.color : '#147db8',
        size: ['small', 'medium', 'large'].includes(button.size) ? button.size : 'medium',
        x: clamp(finiteOr(button.x, index % 2 === 0 ? 6 : 56), 0, 95),
        y: clamp(finiteOr(button.y, 14 + Math.floor(index / 2) * 13), 0, 95)
      })) : []
    };
  }

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.getElementById(ROOT_ID) || document.createElement('div');
    root.id = ROOT_ID;
    if (!root.isConnected) (document.body || document.documentElement).append(root);
    return root;
  }

  async function savePosition(button) {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const next = normalizeSettings(stored);
    const target = next.buttons.find((item) => item.id === button.id);
    if (!target) return;
    target.x = button.x;
    target.y = button.y;
    await chrome.storage.local.set({ buttons: next.buttons });
  }

  function runAction(button) {
    if (settings.editMode || draggedButtonId === button.id) return;
    switch (button.action) {
      case 'reload':
        window.location.reload();
        break;
      case 'back':
        window.history.back();
        break;
      case 'forward':
        window.history.forward();
        break;
      case 'home':
        if (['http:', 'https:'].includes(window.location.protocol)) {
          window.location.assign(new URL('/', window.location.href).href);
        }
        break;
      case 'url':
        try {
          const target = new URL(button.url);
          if (['http:', 'https:', 'file:'].includes(target.protocol)) window.location.assign(target.href);
        } catch { /* ignore invalid storage values */ }
        break;
      case 'newTab':
        try {
          const target = new URL(button.url);
          if (['http:', 'https:', 'file:'].includes(target.protocol)) {
            chrome.runtime.sendMessage({ type: 'OPEN_URL_IN_NEW_TAB', url: target.href });
          }
        } catch { /* ignore invalid storage values */ }
        break;
      default:
        break;
    }
  }

  function beginDrag(event, button, element) {
    if (!settings.editMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = (button.x / 100) * window.innerWidth;
    const startTop = (button.y / 100) * window.innerHeight;
    let moved = false;

    element.setPointerCapture(event.pointerId);

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
      const left = clamp(startLeft + dx, 0, maxLeft);
      const top = clamp(startTop + dy, 0, maxTop);
      button.x = window.innerWidth ? (left / window.innerWidth) * 100 : 0;
      button.y = window.innerHeight ? (top / window.innerHeight) * 100 : 0;
      element.style.left = `${button.x}%`;
      element.style.top = `${button.y}%`;
    };

    const onEnd = async () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onEnd);
      element.removeEventListener('pointercancel', onEnd);
      if (moved) {
        draggedButtonId = button.id;
        window.setTimeout(() => { draggedButtonId = null; }, 0);
        try { await savePosition(button); } catch { /* extension may be reloading */ }
      }
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onEnd);
    element.addEventListener('pointercancel', onEnd);
  }

  function makeButton(button) {
    const element = document.createElement('button');
    const action = ACTIONS[button.action];
    element.type = 'button';
    element.className = 'fcb-button';
    element.dataset.id = button.id;
    element.dataset.size = button.size;
    element.style.left = `${button.x}%`;
    element.style.top = `${button.y}%`;
    element.style.background = button.color;
    element.title = settings.editMode ? `${button.label}：ドラッグで移動` : button.label;
    element.setAttribute('aria-label', button.label);

    const icon = document.createElement('span');
    icon.className = 'fcb-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = action.icon;
    const label = document.createElement('span');
    label.className = 'fcb-label';
    label.textContent = button.label;
    element.append(icon, label);

    element.addEventListener('pointerdown', (event) => beginDrag(event, button, element));
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      runAction(button);
    });
    return element;
  }

  function render() {
    const container = ensureRoot();
    container.replaceChildren();
    container.classList.toggle('fcb-editing', settings.editMode);
    container.hidden = !settings.enabled;
    if (!settings.enabled) return;

    settings.buttons.forEach((button) => container.append(makeButton(button)));

    const editBar = document.createElement('div');
    editBar.className = 'fcb-edit-bar';
    editBar.innerHTML = '<span>配置編集中：ボタンをドラッグ</span>';
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'fcb-edit-done';
    done.textContent = '完了';
    done.addEventListener('click', () => chrome.storage.local.set({ editMode: false }));
    editBar.append(done);
    container.append(editBar);
  }

  async function initialize() {
    try {
      settings = normalizeSettings(await chrome.storage.local.get(DEFAULT_SETTINGS));
      render();
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!['enabled', 'editMode', 'buttons'].some((key) => changes[key])) return;
        chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
          settings = normalizeSettings(stored);
          render();
        });
      });
    } catch {
      // The page can outlive the extension during development reloads.
    }
  }

  initialize();
})();
