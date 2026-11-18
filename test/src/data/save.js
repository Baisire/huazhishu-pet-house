// 存档：版本号 + 主槽 + 备份槽
// 迁移链留空，等第一次 schema 变更时补。
window.HZ = window.HZ || {};

HZ.Save = (function () {
  const KEY = 'huazhishu.save';
  const BAK = 'huazhishu.save.bak';
  const VERSION = 1;

  function write(state) {
    const prev = HZ.Platform.storage.get(KEY);
    if (prev) HZ.Platform.storage.set(BAK, prev);
    state.v = VERSION;
    state.lastSaveAt = Date.now();
    HZ.Platform.storage.set(KEY, JSON.stringify(state));
  }

  function read() {
    const raw = HZ.Platform.storage.get(KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return migrate(data);
    } catch (e) {
      const bak = HZ.Platform.storage.get(BAK);
      if (bak) {
        try {
          return migrate(JSON.parse(bak));
        } catch (e2) { /* 备份也坏了，走新档 */ }
      }
      return null;
    }
  }

  function migrate(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.v !== 'number') data.v = 0;
    // 未来版本迁移写在这里：if (data.v < 2) { ... data.v = 2; }
    return data;
  }

  function clear() {
    HZ.Platform.storage.remove(KEY);
    HZ.Platform.storage.remove(BAK);
  }

  return { write, read, clear, VERSION };
})();
