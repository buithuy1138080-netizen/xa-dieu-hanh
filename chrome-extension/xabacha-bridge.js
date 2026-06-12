/**
 * xabacha-bridge.js v2.1 — chạy trên xabacha.com
 * Token không còn trong localStorage (đã chuyển sang HttpOnly cookie).
 * Lấy token qua /api/v1/auth/refresh (same-origin → cookie tự động gửi).
 */
(function () {
  'use strict';

  function decodeJwtExp(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch (_) { return null; }
  }

  /** Kiểm tra user có đang đăng nhập không (chỉ dựa vào user object, không cần token) */
  function isUserLoggedIn() {
    try {
      const raw = localStorage.getItem('auth-storage');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      // Sau khi migrate HttpOnly cookie: chỉ còn state.user được persist
      return !!(parsed?.state?.user || parsed?.user);
    } catch (_) { return false; }
  }

  /** Lấy access_token mới từ server qua cookie (same-origin) */
  async function fetchFreshToken() {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.access_token || null;
    } catch (_) { return null; }
  }

  let _syncing = false;

  async function sync() {
    if (_syncing) return;
    _syncing = true;
    try {
      if (!isUserLoggedIn()) {
        chrome.storage.local.remove(['ioc_token', 'ioc_token_ts']);
        return;
      }

      // Kiểm tra token trong chrome.storage còn đủ hạn không (>5 phút)
      const stored = await chrome.storage.local.get(['ioc_token', 'ioc_token_ts']);
      const cached = stored.ioc_token;
      if (cached) {
        const exp = decodeJwtExp(cached);
        if (exp !== null && exp - Date.now() > 5 * 60 * 1000) return; // còn hạn, bỏ qua
      }

      // Gọi /auth/refresh — HttpOnly cookie tự động đính kèm (same-origin)
      const token = await fetchFreshToken();
      if (token) {
        chrome.storage.local.set({ ioc_token: token, ioc_token_ts: Date.now() });
      } else {
        // Cookie hết hạn hoặc chưa đăng nhập
        chrome.storage.local.remove(['ioc_token', 'ioc_token_ts']);
      }
    } finally {
      _syncing = false;
    }
  }

  // Sync ngay khi load
  sync();

  // Sync định kỳ mỗi 60s
  setInterval(sync, 60_000);

  // Sync khi Zustand ghi localStorage (login/logout event)
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth-storage') sync();
  });
})();
