(() => {
  'use strict';

  const REPOSITORY = 'LightRoomJP/floating-custom-buttons';
  const RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
  const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
  const UPDATE_ALARM = 'github-release-update-check';
  const CHECK_INTERVAL_MINUTES = 360;
  const NOTIFICATION_PREFIX = 'fcb-update-';

  let activeCheck = null;

  function parseVersion(value) {
    const normalized = String(value || '').trim().replace(/^v/i, '');
    const [core, prerelease = ''] = normalized.split('-', 2);
    const numbers = core.split('.').map((part) => Number.parseInt(part, 10) || 0);
    return { numbers, prerelease };
  }

  function isNewerVersion(latestValue, currentValue) {
    const latest = parseVersion(latestValue);
    const current = parseVersion(currentValue);
    const length = Math.max(latest.numbers.length, current.numbers.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (latest.numbers[index] || 0) - (current.numbers[index] || 0);
      if (difference !== 0) return difference > 0;
    }
    return Boolean(current.prerelease) && !latest.prerelease;
  }

  async function setUpdateBadge(updateAvailable) {
    await chrome.action.setBadgeBackgroundColor({ color: '#d94a5a' });
    await chrome.action.setBadgeText({ text: updateAvailable ? 'UP' : '' });
  }

  async function showUpdateNotification(status) {
    const stored = await chrome.storage.local.get({ lastNotifiedVersion: '' });
    if (stored.lastNotifiedVersion === status.latestVersion) return;

    await chrome.notifications.create(`${NOTIFICATION_PREFIX}${status.latestVersion}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: `Floating Custom Buttons v${status.latestVersion}`,
      message: '新しいバージョンがGitHubに公開されました。',
      contextMessage: `現在のバージョン: v${status.currentVersion}`,
      buttons: [{ title: 'リリースページを開く' }],
      priority: 1
    });
    await chrome.storage.local.set({ lastNotifiedVersion: status.latestVersion });
  }

  async function performUpdateCheck(notify = true) {
    const currentVersion = chrome.runtime.getManifest().version;
    const checkedAt = new Date().toISOString();

    try {
      const response = await fetch(RELEASE_API, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      });

      if (response.status === 404) {
        const status = {
          checkedAt,
          currentVersion,
          latestVersion: currentVersion,
          releaseUrl: RELEASES_URL,
          updateAvailable: false,
          error: ''
        };
        await chrome.storage.local.set({ updateStatus: status });
        await setUpdateBadge(false);
        return status;
      }

      if (!response.ok) throw new Error(`GitHub API: ${response.status}`);

      const release = await response.json();
      const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
      if (!latestVersion) throw new Error('リリースのバージョンを取得できませんでした');

      const status = {
        checkedAt,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url || RELEASES_URL,
        updateAvailable: isNewerVersion(latestVersion, currentVersion),
        error: ''
      };

      await chrome.storage.local.set({ updateStatus: status });
      await setUpdateBadge(status.updateAvailable);
      if (notify && status.updateAvailable) await showUpdateNotification(status);
      return status;
    } catch (error) {
      const stored = await chrome.storage.local.get({ updateStatus: null });
      const status = {
        ...(stored.updateStatus || {}),
        checkedAt,
        currentVersion,
        error: error instanceof Error ? error.message : '更新を確認できませんでした'
      };
      await chrome.storage.local.set({ updateStatus: status });
      return status;
    }
  }

  function checkForUpdates(notify = true) {
    if (!activeCheck) {
      activeCheck = performUpdateCheck(notify).finally(() => { activeCheck = null; });
    }
    return activeCheck;
  }

  async function configureSidePanel() {
    if (!chrome.sidePanel?.setPanelBehavior) return;
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch {
      // Unsupported browser versions keep the extension installed without failing startup.
    }
  }

  async function scheduleChecks() {
    await chrome.alarms.create(UPDATE_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: CHECK_INTERVAL_MINUTES
    });
  }

  async function openLatestRelease() {
    const stored = await chrome.storage.local.get({ updateStatus: null });
    const url = stored.updateStatus?.releaseUrl || RELEASES_URL;
    await chrome.tabs.create({ url });
  }

  async function openUrlInNewTab(value) {
    try {
      const url = new URL(String(value || ''));
      if (!['http:', 'https:', 'file:'].includes(url.protocol)) return false;
      await chrome.tabs.create({ url: url.href });
      return true;
    } catch {
      return false;
    }
  }

  configureSidePanel();

  chrome.runtime.onInstalled.addListener(() => {
    configureSidePanel();
    scheduleChecks();
    checkForUpdates(true);
  });

  chrome.runtime.onStartup.addListener(() => {
    scheduleChecks();
    checkForUpdates(true);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_ALARM) checkForUpdates(true);
  });

  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith(NOTIFICATION_PREFIX)) openLatestRelease();
  });

  chrome.notifications.onButtonClicked.addListener((notificationId) => {
    if (notificationId.startsWith(NOTIFICATION_PREFIX)) openLatestRelease();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'CHECK_FOR_UPDATES') {
      checkForUpdates(false).then(sendResponse);
      return true;
    }
    if (message?.type === 'OPEN_UPDATE_PAGE') {
      openLatestRelease().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === 'OPEN_URL_IN_NEW_TAB') {
      openUrlInNewTab(message.url).then((ok) => sendResponse({ ok }));
      return true;
    }
    return false;
  });
})();
