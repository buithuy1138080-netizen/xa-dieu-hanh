/**
 * xabacha-bridge.js — chạy trên xabacha.com
 * Đọc JWT token từ Zustand/localStorage và lưu vào chrome.storage
 * để content.js trên dhtn.dcs.vn có thể dùng để gọi API
 */
(function () {
  function readToken() {
    try {
      // Zustand persists to localStorage with key 'auth-storage'
      const raw = localStorage.getItem('auth-storage');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.state?.token || parsed?.token || null;
    } catch { return null; }
  }

  function sync() {
    const token = readToken();
    if (token) {
      chrome.storage.local.set({ ioc_token: token, ioc_token_ts: Date.now() });
    }
  }

  // Sync ngay lập tức và mỗi 30 giây
  sync();
  setInterval(sync, 30000);

  // Lắng nghe storage changes (khi user đăng nhập/logout)
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth-storage') sync();
  });
})();
