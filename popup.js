(() => {
  'use strict';

  const MAX_BUTTONS = 10;
  const DEFAULT_SETTINGS = { enabled: true, editMode: false, buttons: [], presets: [], updateStatus: null };
  const DEFAULT_COLORS = ['#147db8', '#7357c7', '#b44f7a', '#b26832', '#2d8a72', '#445c7d', '#9a3f4f'];
  const ACTION_LABELS = { reload: 'リロード', back: '戻る', forward: '進む', home: 'サイトTOP', url: '開く', newTab: '新しいタブ' };

  const enabledInput = document.getElementById('enabled');
  const editModeButton = document.getElementById('editMode');
  const settingsToggleButton = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const list = document.getElementById('buttonList');
  const addButton = document.getElementById('addButton');
  const addCurrentTabButton = document.getElementById('addCurrentTabButton');
  const saveButton = document.getElementById('saveButton');
  const count = document.getElementById('count');
  const status = document.getElementById('status');
  const template = document.getElementById('buttonTemplate');
  const presetSelect = document.getElementById('presetSelect');
  const presetName = document.getElementById('presetName');
  const presetCount = document.getElementById('presetCount');
  const loadPresetButton = document.getElementById('loadPreset');
  const deletePresetButton = document.getElementById('deletePreset');
  const savePresetButton = document.getElementById('savePreset');
  const updatePanel = document.getElementById('updatePanel');
  const currentVersion = document.getElementById('currentVersion');
  const updateStatusText = document.getElementById('updateStatus');
  const checkUpdateButton = document.getElementById('checkUpdate');
  const openUpdateButton = document.getElementById('openUpdate');

  let state = { ...DEFAULT_SETTINGS, buttons: [], presets: [] };

  function uid() {
    return `button-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeUrl(value) {
    const text = value.trim();
    if (!text) return '';
    try {
      const url = new URL(/^(https?|file):/i.test(text) ? text : `https://${text}`);
      return ['http:', 'https:', 'file:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  async function fitPopupHeight() {
    let popupHeight = 600;
    try {
      const browserWindow = await chrome.windows.getCurrent();
      if (Number.isFinite(browserWindow?.height)) {
        popupHeight = clamp(Math.floor(browserWindow.height - 140), 460, 600);
      }
    } catch {
      // 取得できない環境ではポップアップ上限を使用する。
    }
    document.documentElement.style.setProperty('--popup-height', `${popupHeight}px`);
  }

  function defaultPosition(index) {
    return { x: index % 2 === 0 ? 6 : 56, y: 14 + Math.floor(index / 2) * 13 };
  }

  function currentTabLabel(tab, url) {
    const title = String(tab?.title || '').trim();
    if (title) return title.slice(0, 20);
    if (url.protocol === 'file:') return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || 'ローカルページ').slice(0, 20);
    return (url.hostname || '現在のページ').slice(0, 20);
  }

  async function getCurrentPageInfo() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return null;

    let pageInfo = { title: tab.title, url: tab.url };
    if ((!pageInfo.url || !pageInfo.title) && tab.id) {
      try {
        pageInfo = { ...pageInfo, ...await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_PAGE_INFO' }) };
      } catch {
        // Browser-internal pages do not have the content script.
      }
    }

    try {
      const url = new URL(String(pageInfo.url || ''));
      if (!['http:', 'https:', 'file:'].includes(url.protocol)) return null;
      return { ...pageInfo, url };
    } catch {
      return null;
    }
  }

  function normalizeButton(button = {}, index = 0, replaceId = false) {
    const position = defaultPosition(index);
    return {
      id: replaceId || !button.id ? uid() : String(button.id),
      label: String(button.label || ACTION_LABELS[button.action] || 'ボタン').slice(0, 20),
      action: ['reload', 'back', 'forward', 'home', 'url', 'newTab'].includes(button.action) ? button.action : 'reload',
      url: String(button.url || ''),
      color: /^#[0-9a-f]{6}$/i.test(button.color) ? button.color : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      size: ['small', 'medium', 'large'].includes(button.size) ? button.size : 'medium',
      x: clamp(Number.isFinite(Number(button.x)) ? Number(button.x) : position.x, 0, 95),
      y: clamp(Number.isFinite(Number(button.y)) ? Number(button.y) : position.y, 0, 95)
    };
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#ff9aa5' : '';
    if (!error) window.setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, 1600);
  }

  function formatCheckedAt(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderUpdateStatus(updateStatus) {
    const installedVersion = chrome.runtime.getManifest().version;
    currentVersion.textContent = `v${installedVersion}`;
    updatePanel.classList.toggle('available', Boolean(updateStatus?.updateAvailable));
    openUpdateButton.hidden = !updateStatus?.updateAvailable;

    if (updateStatus?.updateAvailable) {
      updateStatusText.textContent = `v${updateStatus.latestVersion} が公開されています`;
      updateStatusText.title = '';
      return;
    }
    if (updateStatus?.error) {
      updateStatusText.textContent = '更新を確認できませんでした';
      updateStatusText.title = updateStatus.error;
      return;
    }
    if (updateStatus?.checkedAt) {
      updateStatusText.textContent = `最新版です・${formatCheckedAt(updateStatus.checkedAt)}確認`;
      updateStatusText.title = '';
      return;
    }
    updateStatusText.textContent = 'まだ更新を確認していません';
    updateStatusText.title = '';
  }

  function readCards() {
    return [...list.querySelectorAll('.button-card')].map((card, index) => ({
      id: card.dataset.id,
      label: card.querySelector('.label-input').value.trim(),
      action: card.querySelector('.action-input').value,
      url: card.querySelector('.url-input').value.trim(),
      color: card.querySelector('.color-input').value,
      size: card.querySelector('.size-input').value,
      x: state.buttons.find((button) => button.id === card.dataset.id)?.x ?? defaultPosition(index).x,
      y: state.buttons.find((button) => button.id === card.dataset.id)?.y ?? defaultPosition(index).y
    }));
  }

  function syncDraft() {
    state.buttons = readCards();
  }

  function renderPresets(selectedId = presetSelect.value) {
    presetSelect.replaceChildren(new Option('プリセットを選択', ''));
    state.presets.forEach((preset) => {
      presetSelect.append(new Option(`${preset.name}（${preset.buttons.length}個）`, preset.id));
    });
    if (state.presets.some((preset) => preset.id === selectedId)) presetSelect.value = selectedId;
    const hasSelection = Boolean(presetSelect.value);
    loadPresetButton.disabled = !hasSelection;
    deletePresetButton.disabled = !hasSelection;
    presetCount.textContent = `${state.presets.length}件`;
  }

  function updateActionVisibility(card) {
    const isUrl = ['url', 'newTab'].includes(card.querySelector('.action-input').value);
    card.querySelector('.url-field').hidden = !isUrl;
  }

  function render() {
    list.replaceChildren();
    enabledInput.checked = state.enabled;
    editModeButton.classList.toggle('active', state.editMode);
    editModeButton.textContent = state.editMode ? '✓ 配置編集を終了' : '↔ 配置を編集';

    if (!state.buttons.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'ボタンはまだありません';
      list.append(empty);
    }

    state.buttons.forEach((button, index) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.id = button.id;
      card.querySelector('.number').textContent = `BUTTON ${index + 1}`;
      card.querySelector('.label-input').value = button.label;
      card.querySelector('.action-input').value = button.action;
      card.querySelector('.size-input').value = button.size;
      card.querySelector('.color-input').value = button.color;
      card.querySelector('.url-input').value = button.url || '';
      card.querySelector('.action-input').addEventListener('change', () => updateActionVisibility(card));
      card.querySelector('.use-current-url-button').addEventListener('click', async (event) => {
        const target = event.currentTarget;
        target.disabled = true;
        try {
          const pageInfo = await getCurrentPageInfo();
          if (!pageInfo) {
            setStatus('このページのURLは設定できません', true);
            return;
          }
          card.querySelector('.url-input').value = pageInfo.url.href;
          setStatus(`BUTTON ${index + 1} に現在のURLを反映しました。保存してください`);
        } catch {
          setStatus('表示中のタブを取得できませんでした', true);
        } finally {
          target.disabled = false;
        }
      });
      card.querySelector('.delete-button').addEventListener('click', () => {
        syncDraft();
        state.buttons = state.buttons.filter((item) => item.id !== button.id);
        render();
      });
      updateActionVisibility(card);
      list.append(card);
    });

    count.textContent = `${state.buttons.length} / ${MAX_BUTTONS}`;
    addButton.disabled = state.buttons.length >= MAX_BUTTONS;
    addCurrentTabButton.disabled = state.buttons.length >= MAX_BUTTONS;
    renderPresets();
  }

  function validateDraft() {
    syncDraft();
    for (const button of state.buttons) {
      if (!button.label) button.label = ACTION_LABELS[button.action] || 'ボタン';
      if (['url', 'newTab'].includes(button.action)) {
        const url = normalizeUrl(button.url);
        if (!url) {
          setStatus('有効なURLを入力してください', true);
          return false;
        }
        button.url = url;
      }
    }
    return true;
  }

  async function save() {
    if (!validateDraft()) return;
    state.enabled = enabledInput.checked;
    await chrome.storage.local.set({ enabled: state.enabled, editMode: state.editMode, buttons: state.buttons.slice(0, MAX_BUTTONS) });
    setStatus('保存しました');
    render();
  }

  addButton.addEventListener('click', () => {
    syncDraft();
    if (state.buttons.length >= MAX_BUTTONS) return;
    const index = state.buttons.length;
    state.buttons.push({
      id: uid(), label: index ? `ボタン ${index + 1}` : 'リロード', action: 'reload', url: '',
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length], size: 'medium', ...defaultPosition(index)
    });
    render();
  });

  addCurrentTabButton.addEventListener('click', async () => {
    syncDraft();
    if (state.buttons.length >= MAX_BUTTONS) return;
    addCurrentTabButton.disabled = true;
    try {
      const pageInfo = await getCurrentPageInfo();
      if (!pageInfo) {
        setStatus('このページはボタンに設定できません', true);
        return;
      }
      const index = state.buttons.length;
      state.buttons.push({
        id: uid(),
        label: currentTabLabel(pageInfo, pageInfo.url),
        action: 'url',
        url: pageInfo.url.href,
        color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        size: 'medium',
        ...defaultPosition(index)
      });
      render();
      setStatus('現在のタブから追加しました。保存してください');
    } catch {
      setStatus('表示中のタブを取得できませんでした', true);
    } finally {
      addCurrentTabButton.disabled = state.buttons.length >= MAX_BUTTONS;
    }
  });

  enabledInput.addEventListener('change', async () => {
    state.enabled = enabledInput.checked;
    await chrome.storage.local.set({ enabled: state.enabled });
  });

  settingsToggleButton.addEventListener('click', () => {
    const expanded = settingsToggleButton.getAttribute('aria-expanded') === 'true';
    settingsToggleButton.setAttribute('aria-expanded', String(!expanded));
    settingsPanel.hidden = expanded;
  });

  editModeButton.addEventListener('click', async () => {
    syncDraft();
    state.enabled = enabledInput.checked;
    state.editMode = !state.editMode;
    await chrome.storage.local.set({ enabled: state.enabled, editMode: state.editMode, buttons: state.buttons.slice(0, MAX_BUTTONS) });
    render();
    setStatus(state.editMode ? '配置編集を開始しました' : '配置編集を終了しました');
  });

  saveButton.addEventListener('click', save);

  checkUpdateButton.addEventListener('click', async () => {
    checkUpdateButton.disabled = true;
    checkUpdateButton.textContent = '確認中';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CHECK_FOR_UPDATES' });
      renderUpdateStatus(result);
    } catch {
      renderUpdateStatus({ error: 'バックグラウンドへ接続できませんでした' });
    } finally {
      checkUpdateButton.disabled = false;
      checkUpdateButton.textContent = '確認';
    }
  });

  openUpdateButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_UPDATE_PAGE' });
  });

  presetSelect.addEventListener('change', () => {
    const preset = state.presets.find((item) => item.id === presetSelect.value);
    loadPresetButton.disabled = !preset;
    deletePresetButton.disabled = !preset;
    if (preset) presetName.value = preset.name;
  });

  savePresetButton.addEventListener('click', async () => {
    if (!validateDraft()) return;
    const name = presetName.value.trim();
    if (!name) {
      setStatus('プリセット名を入力してください', true);
      presetName.focus();
      return;
    }
    const now = new Date().toISOString();
    const existing = state.presets.find((preset) => preset.name === name);
    const saved = {
      id: existing?.id || `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.slice(0, 30),
      buttons: clone(state.buttons.slice(0, MAX_BUTTONS)),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    state.presets = [saved, ...state.presets.filter((preset) => preset.id !== saved.id)];
    state.enabled = enabledInput.checked;
    await chrome.storage.local.set({
      enabled: state.enabled,
      editMode: state.editMode,
      buttons: state.buttons.slice(0, MAX_BUTTONS),
      presets: state.presets
    });
    renderPresets(saved.id);
    setStatus(existing ? 'プリセットを上書きしました' : 'プリセットを保存しました');
  });

  loadPresetButton.addEventListener('click', async () => {
    const preset = state.presets.find((item) => item.id === presetSelect.value);
    if (!preset) return;
    state.buttons = preset.buttons.slice(0, MAX_BUTTONS).map((button, index) => normalizeButton(button, index, true));
    await chrome.storage.local.set({ buttons: state.buttons });
    render();
    renderPresets(preset.id);
    setStatus(`「${preset.name}」を読み込みました`);
  });

  deletePresetButton.addEventListener('click', async () => {
    const preset = state.presets.find((item) => item.id === presetSelect.value);
    if (!preset || !window.confirm(`プリセット「${preset.name}」を削除しますか？`)) return;
    state.presets = state.presets.filter((item) => item.id !== preset.id);
    await chrome.storage.local.set({ presets: state.presets });
    presetName.value = '';
    renderPresets('');
    setStatus('プリセットを削除しました');
  });

  fitPopupHeight();

  chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
    state = {
      enabled: stored.enabled !== false,
      editMode: Boolean(stored.editMode),
      buttons: Array.isArray(stored.buttons) ? stored.buttons.slice(0, MAX_BUTTONS).map((button, index) => normalizeButton(button, index)) : [],
      presets: Array.isArray(stored.presets) ? stored.presets.filter((preset) => preset && preset.name && Array.isArray(preset.buttons)).map((preset) => ({
        id: String(preset.id || `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
        name: String(preset.name).slice(0, 30),
        buttons: preset.buttons.slice(0, MAX_BUTTONS).map((button, index) => normalizeButton(button, index)),
        createdAt: preset.createdAt || '',
        updatedAt: preset.updatedAt || ''
      })) : [],
      updateStatus: stored.updateStatus || null
    };
    render();
    renderUpdateStatus(state.updateStatus);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.updateStatus) renderUpdateStatus(changes.updateStatus.newValue);
  });
})();
