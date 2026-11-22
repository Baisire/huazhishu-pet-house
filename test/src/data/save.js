// 存档：版本号 + 主槽 + 备份槽
// v2 新增 room（家具摆放/库存）；v3 把探险单槽升级为双槽并新增照片图鉴；
// v4 新增 progress（引导/签到/日常任务）。
// 迁移链保持幂等：任何一版脏档经过 migrate 都能得到合法结构。
window.HZ = window.HZ || {};

HZ.Save = (function () {
  const KEY = 'huazhishu.save';
  const BAK = 'huazhishu.save.bak';
  const VERSION = 4;
  const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;
  const TASK_METRICS = ['feed', 'bath', 'exp', 'place', 'ad'];

  function emptyRoom() {
    return { placed: [], inventory: [], placedEver: [] };
  }

  function emptyProgress() {
    return {
      tutorialDone: false,
      checkinDay: 1,
      lastCheckinDate: '',
      makeupDate: '',
      tasks: {
        day: '',
        counts: { feed: 0, bath: 0, exp: 0, place: 0, ad: 0 },
        claimed: [],
        bonusClaimed: false
      }
    };
  }

  function furnitureList() {
    return (HZ.CONFIG && HZ.CONFIG.economy && HZ.CONFIG.economy.furniture) || [];
  }

  function furnitureDefById(id) {
    if (typeof id !== 'string') return null;
    return furnitureList().find(function (f) { return f && f.id === id; }) || null;
  }

  function knownItemId(id) {
    return !!furnitureDefById(id);
  }

  // 家具边界默认值与 config 保持一致（config 缺失时也不至于崩溃）
  function furnitureBounds() {
    const b = HZ.CONFIG && HZ.CONFIG.economy && HZ.CONFIG.economy.furnitureBounds;
    return b || {
      x: { min: 8, max: 632 },
      wall: { yMin: 48, yMax: 100, topMin: 8 },
      ground: { yMin: 198, yMax: 258, topMin: 104 }
    };
  }

  function clampAxis(v, lo, hi) {
    if (lo > hi) return Math.round((lo + hi) / 2);
    return Math.round(Math.min(hi, Math.max(lo, v)));
  }

  // 把越界坐标夹紧到合法摆放区间（不改碰撞判定；只消除「看不见但占容量」）
  function clampPlacement(def, x, y) {
    if (!def) return { x: x, y: y };
    const b = furnitureBounds();
    const half = def.w / 2;
    const cx = clampAxis(x, b.x.min + half, b.x.max - half);
    const zone = def.wall ? b.wall : b.ground;
    const yLo = Math.max(zone.yMin, def.h + zone.topMin);
    const cy = clampAxis(y, yLo, zone.yMax);
    return { x: cx, y: cy };
  }

  // 脏档兜底：任何 JSON 内容都不能让绘制/命中抛异常。
  // placed 只保留 {合法 itemId, 有限 x/y}，uid 缺失或重复时重新编号；
  // 越界坐标夹紧到合法区间；inventory 只保留已知 itemId；
  // placedEver 去重且只保留已知 id。
  function normalizeRoom(room) {
    if (!room || typeof room !== 'object' || Array.isArray(room)) room = {};

    const rawPlaced = Array.isArray(room.placed) ? room.placed : [];
    const valid = [];
    rawPlaced.forEach(function (p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      const def = furnitureDefById(p.itemId);
      if (!def) return;
      if (typeof p.x !== 'number' || !isFinite(p.x)) return;
      if (typeof p.y !== 'number' || !isFinite(p.y)) return;
      const pos = clampPlacement(def, p.x, p.y);
      valid.push({
        uid: typeof p.uid === 'string' ? p.uid : '',
        itemId: p.itemId,
        x: pos.x,
        y: pos.y
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

  // ---------------- 探险双槽（v3） ----------------

  function tierById(id) {
    const list = (HZ.CONFIG && HZ.CONFIG.expedition) || [];
    return list.find(function (e) { return e && e.id === id; }) || null;
  }

  function normalizeSlot(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const def = tierById(raw.id);
    if (!def) return null;
    // v2 用 startedAt，v3 起用 startAt；两个都认
    const startAt = Number(raw.startAt != null ? raw.startAt : raw.startedAt);
    const endsAt = Number(raw.endsAt);
    if (!isFinite(startAt) || !isFinite(endsAt) || endsAt <= startAt) return null;

    const tierSlots = Array.isArray(def.slots) && def.slots.length ? def.slots : ['short'];
    let slot = (raw.slot === 'short' || raw.slot === 'long') ? raw.slot : tierSlots[0];
    if (tierSlots.indexOf(slot) < 0) slot = tierSlots[0];

    const score = Number(raw.score);
    return {
      id: def.id,
      name: def.name,
      slot: slot,
      startAt: startAt,
      endsAt: endsAt,
      score: isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      claimed: false
    };
  }

  // 接受 v3 { slots:[a,b] }、v2 单槽对象、v2 null、脏数组，统一返回 { slots:[a,b] }
  // 位置按槽位种类归位（short→0 / long→1），冲突时保留先到的那条
  function normalizeExpedition(exp) {
    let raw = null;
    if (Array.isArray(exp)) {
      raw = exp;
    } else if (exp && typeof exp === 'object') {
      if (Array.isArray(exp.slots)) raw = exp.slots;
      else if (typeof exp.id === 'string') raw = [exp]; // v2 旧单槽
    }

    const kinds = ((HZ.CONFIG && HZ.CONFIG.expeditionSlots) || []).map(function (s) { return s.id; });
    const slots = [null, null];
    (raw || []).forEach(function (item, i) {
      const s = normalizeSlot(item);
      if (!s) return;
      let idx = kinds.indexOf(s.slot);
      if (idx < 0) idx = i === 1 ? 1 : 0;
      if (idx >= slots.length) idx = slots.length - 1;
      if (!slots[idx]) slots[idx] = s;
    });
    return { slots: slots };
  }

  function photoIds() {
    const pool = (HZ.CONFIG && HZ.CONFIG.photos && HZ.CONFIG.photos.pool) || [];
    return pool.map(function (p) { return p && p.id; }).filter(function (id) { return typeof id === 'string'; });
  }

  function normalizePhotos(photos) {
    const ids = photoIds();
    const src = (photos && typeof photos === 'object' && !Array.isArray(photos) && Array.isArray(photos.owned))
      ? photos.owned : [];
    const seen = {};
    const owned = [];
    src.forEach(function (id) {
      if (typeof id !== 'string' || seen[id] || ids.indexOf(id) < 0) return;
      seen[id] = true;
      owned.push(id);
    });
    let dupSeeds = 0;
    if (photos && typeof photos === 'object' && !Array.isArray(photos)) {
      const n = Number(photos.dupSeeds);
      if (isFinite(n) && n > 0) dupSeeds = Math.floor(n);
    }
    return { owned: owned, dupSeeds: dupSeeds };
  }

  // ---------------- progress（v4：引导 / 签到 / 日常任务） ----------------

  function taskIds() {
    const list = (HZ.CONFIG && HZ.CONFIG.dailyTasks && HZ.CONFIG.dailyTasks.list) || [];
    return list.map(function (t) { return t && t.id; }).filter(function (id) {
      return typeof id === 'string';
    });
  }

  function taskMetrics() {
    const list = (HZ.CONFIG && HZ.CONFIG.dailyTasks && HZ.CONFIG.dailyTasks.list) || [];
    const out = list.map(function (t) { return t && t.metric; }).filter(function (m) {
      return typeof m === 'string';
    });
    return out.length ? out : TASK_METRICS.slice();
  }

  function cleanDate(v) {
    return (typeof v === 'string' && DATE_RE.test(v)) ? v : '';
  }

  // 脏档兜底：progress 任何字段都收窄到合法范围，保证 HUD/核心逻辑不抛异常
  function normalizeProgress(progress) {
    const p = emptyProgress();
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return p;

    p.tutorialDone = progress.tutorialDone === true;

    const day = Number(progress.checkinDay);
    if (isFinite(day) && day >= 1 && day <= 7) p.checkinDay = Math.floor(day);
    p.lastCheckinDate = cleanDate(progress.lastCheckinDate);
    p.makeupDate = cleanDate(progress.makeupDate);

    const src = progress.tasks;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      p.tasks.day = cleanDate(src.day);
      const srcCounts = (src.counts && typeof src.counts === 'object' && !Array.isArray(src.counts))
        ? src.counts : {};
      taskMetrics().forEach(function (metric) {
        const n = Number(srcCounts[metric]);
        if (isFinite(n) && n > 0) p.tasks.counts[metric] = Math.floor(n);
      });

      const ids = taskIds();
      const seen = {};
      (Array.isArray(src.claimed) ? src.claimed : []).forEach(function (id) {
        if (typeof id !== 'string' || seen[id] || ids.indexOf(id) < 0) return;
        seen[id] = true;
        p.tasks.claimed.push(id);
      });
      p.tasks.bonusClaimed = src.bonusClaimed === true;
    }
    return p;
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

  // 迁移链：v0/v1 → v2 补空 room；v2 → v3 旧单槽按种类归入短/长槽、补 photos；
  // v3 → v4 补空 progress（引导/签到/任务），旧数值全部保留。
  // 末尾统一做幂等归一，即使版本号已经是最新也保证结构合法。
  function migrate(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.v !== 'number') data.v = 0;

    if (data.v < 2) {
      data.room = normalizeRoom(data.room);
      data.v = 2;
    }
    if (data.v < 3) {
      data.expedition = normalizeExpedition(data.expedition);
      data.photos = normalizePhotos(data.photos);
      data.v = 3;
    }
    if (data.v < 4) {
      data.progress = normalizeProgress(data.progress);
      // 引导只服务真正的新档（State.create 的 tutorialDone=false）。
      // v3 及更早的玩家已经玩过，迁移时直接标记完成，避免旧档回放引导后
      // 卡在冷却/次数用尽的步骤上。此决定由主代理拍板，状态表回写时记录。
      data.progress.tutorialDone = true;
      data.v = 4;
    }

    data.room = normalizeRoom(data.room);
    data.expedition = normalizeExpedition(data.expedition);
    data.photos = normalizePhotos(data.photos);
    data.progress = normalizeProgress(data.progress);
    return data;
  }

  function clear() {
    HZ.Platform.storage.remove(KEY);
    HZ.Platform.storage.remove(BAK);
  }

  return {
    write: write,
    read: read,
    clear: clear,
    VERSION: VERSION,
    emptyRoom: emptyRoom,
    emptyProgress: emptyProgress,
    normalizeRoom: normalizeRoom,
    normalizeExpedition: normalizeExpedition,
    normalizePhotos: normalizePhotos,
    normalizeProgress: normalizeProgress
  };
})();
