// 存档：版本号 + 主槽 + 备份槽
// v2 起新增 room（家具摆放/库存）。迁移链保持幂等。
window.HZ = window.HZ || {};

HZ.Save = (function () {
  const KEY = 'huazhishu.save';
  const BAK = 'huazhishu.save.bak';
  const VERSION = 2;

  function emptyRoom() {
    return { placed: [], inventory: [], placedEver: [] };
  }

  function knownItemId(id) {
    if (typeof id !== 'string') return false;
    const list = (HZ.CONFIG && HZ.CONFIG.economy && HZ.CONFIG.economy.furniture) || [];
    return list.some(function (f) { return f && f.id === id; });
  }

  // 脏档兜底：任何 JSON 内容都不能让绘制/命中抛异常。
  // placed 只保留 {合法 itemId, 有限 x/y}，uid 缺失或重复时重新编号；
  // inventory 只保留已知 itemId 字符串；placedEver 去重且只保留已知 id。
  function normalizeRoom(room) {
    if (!room || typeof room !== 'object' || Array.isArray(room)) room = {};

    const rawPlaced = Array.isArray(room.placed) ? room.placed : [];
    const valid = [];
    rawPlaced.forEach(function (p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      if (!knownItemId(p.itemId)) return;
      if (typeof p.x !== 'number' || !isFinite(p.x)) return;
      if (typeof p.y !== 'number' || !isFinite(p.y)) return;
      valid.push({
        uid: typeof p.uid === 'string' ? p.uid : '',
        itemId: p.itemId,
        x: p.x,
        y: p.y
      });
    });

    const used = {};
    let maxUid = 0;
    valid.forEach(function (p) {
      const m = /^p_(\d+)$/.exec(p.uid);
      if (m) maxUid = Math.max(maxUid, parseInt(m[1], 10));
    });
    const placed = valid.map(function (p) {
      let uid = p.uid;
      if (!uid || used[uid]) {
        do { maxUid += 1; uid = 'p_' + maxUid; } while (used[uid]);
      }
      used[uid] = true;
      return { uid: uid, itemId: p.itemId, x: p.x, y: p.y };
    });

    const inventory = (Array.isArray(room.inventory) ? room.inventory : [])
      .filter(function (id) { return knownItemId(id); });

    const everSeen = {};
    const placedEver = (Array.isArray(room.placedEver) ? room.placedEver : [])
      .filter(function (id) {
        if (!knownItemId(id) || everSeen[id]) return false;
        everSeen[id] = true;
        return true;
      });

    return { placed: placed, inventory: inventory, placedEver: placedEver };
  }

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

  // 迁移链：v0/v1 → v2 补空 room，其余字段原样保留
  function migrate(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.v !== 'number') data.v = 0;
    if (data.v < 2) {
      data.room = normalizeRoom(data.room);
      data.v = 2;
    }
    // 防御性归一：即使 v 已经是 2，也保证 room 三个数组存在（幂等）
    data.room = normalizeRoom(data.room);
    return data;
  }

  function clear() {
    HZ.Platform.storage.remove(KEY);
    HZ.Platform.storage.remove(BAK);
  }

  return { write, read, clear, VERSION, emptyRoom, normalizeRoom };
})();
