/**
 * Clear browsing data scoped to a single origin (user-initiated only).
 * Requires manifest permission "browsingData".
 */

export function isClearablePageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {string} origin e.g. https://example.com or http://localhost:3000
 */
export function clearSiteDataForOrigin(origin) {
  if (!chrome?.browsingData?.remove) {
    return Promise.reject(new Error('chrome.browsingData недоступний'));
  }
  return chrome.browsingData.remove(
    { origins: [origin] },
    {
      cache: true,
      cacheStorage: true,
      cookies: true,
      fileSystems: true,
      indexedDB: true,
      localStorage: true,
      serviceWorkers: true
    }
  );
}

/**
 * Активна вкладка поточного вікна: подвійний confirm + очищення лише origin цієї вкладки.
 * Використовує window.alert / confirm (popup або сторінка налаштувань).
 */
export async function runClearActiveTabSiteDataWithUi() {
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (e) {
    console.error('[clearSiteData] tabs', e);
    alert('Не вдалося отримати активну вкладку.');
    return;
  }
  if (!tab?.url) {
    alert('Не вдалося визначити адресу вкладки.');
    return;
  }
  if (!isClearablePageUrl(tab.url)) {
    alert(
      'Очищення доступне лише для звичайних сайтів (http або https). Не для сторінок chrome://, системних чи розширень.'
    );
    return;
  }

  let origin;
  let host;
  try {
    const u = new URL(tab.url);
    origin = u.origin;
    host = u.host;
  } catch {
    alert('Некоректна адреса вкладки.');
    return;
  }

  if (
    !confirm(
      `Очистити збережені дані тільки для сайту?\n\n${host}\n\nБуде видалено для цієї адреси: cookies, кеш, localStorage, IndexedDB, service workers, cache storage. Тебе може розлогінити.\n\nЦе не торкається інших сайтів. Продовжити?`
    )
  ) {
    return;
  }
  if (
    !confirm(
      `Підтверди ще раз: видалити дані для «${host}»? Відмінити вже не можна через розширення.`
    )
  ) {
    return;
  }

  try {
    await clearSiteDataForOrigin(origin);
    alert(`Готово. Дані для ${host} очищено. Онов сторінку (F5), щоб побачити ефект.`);
  } catch (error) {
    console.error('[clearSiteData]', error);
    alert(error?.message || 'Помилка очищення даних сайту.');
  }
}
