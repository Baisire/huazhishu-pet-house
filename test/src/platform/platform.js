// 平台适配层（H5 / 模拟）
// 正式版会替换为抖音实现，接口保持不变。
window.HZ = window.HZ || {};

HZ.Platform = {
  name: 'h5',

  storage: {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) { /* 忽略：隐私模式下不可用 */ }
    }
  },

  // 模拟激励视频：返回 completed / skipped
  showRewarded(slot) {
    return new Promise((resolve) => {
      HZ.Effects.toast('模拟广告播放中…');
      setTimeout(() => resolve('completed'), 1200);
    });
  },

  // 生命周期：切后台时保存
  onHide(fn) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) fn();
    });
  }
};
