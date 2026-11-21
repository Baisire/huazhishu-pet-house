// 纯逻辑：数值衰减、照料动作、升级、探险结算
// 不碰 DOM、不碰画布，方便后面整体迁移到正式工程。
window.HZ = window.HZ || {};

HZ.State = (function () {
  const C = HZ.CONFIG;

  function dayKey(now) {
    const d = new Date(now);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function clamp(v, max) {
    return Math.max(0, Math.min(max, v));
  }

  function create() {
    const stats = {};
    C.stats.forEach(function (s) { stats[s.id] = s.initial; });
    const cooldowns = {};
    C.actions.forEach(function (a) { cooldowns[a.id] = 0; });
    const now = Date.now();
    return {
      v: HZ.Save.VERSION,
      createdAt: now,
      lastTickAt: now,
      stats: stats,
      level: 1,
      exp: 0,
      seeds: 0,
      materials: 0,
      photos: { owned: [], dupSeeds: 0 },
      cooldowns: cooldowns,
      daily: { key: dayKey(now), counts: {} },
      expedition: { slots: [null, null] },
      lastResult: null,
      ad: { key: dayKey(now), count: 0 },
      room: HZ.Save.emptyRoom()
    };
  }

  // 房间数据归一：脏档/手改档的非法元素在这一层剔除，保证后续绘制安全
  function ensureRoom(state) {
    state.room = HZ.Save.normalizeRoom(state.room);
    return state.room;
  }

  function furnitureDef(itemId) {
    return C.economy.furniture.find(function (f) { return f.id === itemId; }) || null;
  }

  function roomCap() {
    return C.economy.roomCap || 12;
  }

  function inventoryCount(state, itemId) {
    const room = ensureRoom(state);
    return room.inventory.filter(function (id) { return id === itemId; }).length;
  }

  function placedCount(state) {
    return ensureRoom(state).placed.length;
  }

  // 购买：扣瓜子入库存；瓜子不足返回失败，不做任何修改
  function buy(state, itemId) {
    const def = furnitureDef(itemId);
    if (!def) return { ok: false, reason: '未知家具' };
    if (state.seeds < def.price) return { ok: false, reason: '瓜子不够' };

    state.seeds -= def.price;
    ensureRoom(state).inventory.push(itemId);
    return { ok: true, def: def, cost: def.price };
  }

  function nextUid(room) {
    let max = 0;
    room.placed.forEach(function (p) {
      const m = /^p_(\d+)$/.exec(p.uid || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'p_' + (max + 1);
  }

  // 从库存落定一件。首次摆放该款家具（placedEver 判定）开心 +5，
  // 收回重摆不再给。摆放上限不含 5 个固定物件。
  function placeFromInventory(state, itemId, x, y) {
    const def = furnitureDef(itemId);
    if (!def) return { ok: false, reason: '未知家具' };
    const room = ensureRoom(state);
    const idx = room.inventory.indexOf(itemId);
    if (idx < 0) return { ok: false, reason: '库存里没有这件家具' };
    if (room.placed.length >= roomCap()) return { ok: false, reason: '房间放不下了' };

    room.inventory.splice(idx, 1);
    const first = room.placedEver.indexOf(itemId) < 0;
    const item = {
      uid: nextUid(room),
      itemId: itemId,
      x: Math.round(x),
      y: Math.round(y)
    };
    room.placed.push(item);

    let delta = 0;
    if (first) {
      room.placedEver.push(itemId);
      const happyDef = C.stats.find(function (s) { return s.id === 'happy'; });
      const before = state.stats.happy;
      state.stats.happy = clamp(before + (C.economy.placeHappy || 5), happyDef.max);
      delta = state.stats.happy - before;
    }
    return { ok: true, item: item, first: first, delta: delta };
  }

  function movePlaced(state, uid, x, y) {
    const room = ensureRoom(state);
    const item = room.placed.find(function (p) { return p.uid === uid; });
    if (!item) return { ok: false, reason: '这件家具不在了' };
    item.x = Math.round(x);
    item.y = Math.round(y);
    return { ok: true, item: item };
  }

  // 收回：从房间移除并回到库存，placedEver 保留
  function retrievePlaced(state, uid) {
    const room = ensureRoom(state);
    const idx = room.placed.findIndex(function (p) { return p.uid === uid; });
    if (idx < 0) return { ok: false, reason: '这件家具不在了' };
    const item = room.placed.splice(idx, 1)[0];
    room.inventory.push(item.itemId);
    return { ok: true, item: item, def: furnitureDef(item.itemId) };
  }

  function rollDay(state, now) {
    const k = dayKey(now);
    if (state.daily.key !== k) {
      state.daily.key = k;
      state.daily.counts = {};
    }
    if (state.ad.key !== k) {
      state.ad.key = k;
      state.ad.count = 0;
    }
  }

  // 按时间差结算衰减。offline=true 时按 0.8 系数、最多 10 小时。
  function tick(state, now, offline) {
    const elapsed = Math.max(0, now - (state.lastTickAt || now));
    let hours = elapsed / 3600000;
    if (offline) {
      hours = Math.min(hours, C.offline.capHours) * C.offline.factor;
    }
    state.lastTickAt = now;
    if (hours <= 0) return;

    // 其余三项中低于 30 的数量，决定心情的额外衰减
    const deficit = C.stats.filter(function (s) {
      return s.id !== 'happy' && state.stats[s.id] < 30;
    }).length;

    C.stats.forEach(function (def) {
      let decay = def.decayPerHour * hours;
      if (def.id === 'happy') decay += Math.min(4.5, deficit * 1.5) * hours;
      state.stats[def.id] = clamp(state.stats[def.id] - decay, def.max);
    });
  }

  // 状态分：四项加权平均，0–100
  function statusScore(state) {
    let sum = 0;
    C.stats.forEach(function (def) {
      sum += (state.stats[def.id] / def.max) * def.weight * 100;
    });
    return sum;
  }

  // 任一数值低于 10 进入"蔫"状态
  function isTired(state) {
    return C.stats.some(function (def) { return state.stats[def.id] < 10; });
  }

  function expNeeded(level) {
    return C.level.expBase + C.level.expStep * (level - 1);
  }

  function addExp(state, n) {
    state.exp += n;
    let leveled = 0;
    while (state.level < C.level.maxLevel && state.exp >= expNeeded(state.level)) {
      state.exp -= expNeeded(state.level);
      state.level += 1;
      leveled += 1;
    }
    return leveled;
  }

  function title(state) {
    const idx = Math.min(state.level - 1, C.level.titles.length - 1);
    return C.level.titles[idx];
  }

  function actionReadyIn(state, actionId, now) {
    const readyAt = state.cooldowns[actionId] || 0;
    return Math.max(0, readyAt - now);
  }

  function doAction(state, actionId, now) {
    rollDay(state, now);
    const def = C.actions.find(function (a) { return a.id === actionId; });
    if (!def) return { ok: false, reason: '未知动作' };

    const wait = actionReadyIn(state, def.id, now);
    if (wait > 0) return { ok: false, reason: 'cd', remainSec: Math.ceil(wait / 1000) };

    const used = state.daily.counts[def.id] || 0;
    if (used >= def.dailyLimit) return { ok: false, reason: '今天的次数用完了' };

    const statDef = C.stats.find(function (s) { return s.id === def.stat; });
    state.stats[def.stat] = clamp(state.stats[def.stat] + def.value, statDef.max);
    state.cooldowns[def.id] = now + def.cooldownSec * 1000;
    state.daily.counts[def.id] = used + 1;

    const leveled = addExp(state, def.exp);
    return { ok: true, def: def, leveled: leveled };
  }

  // ---------------- 探险（v004 双槽） ----------------

  function tierDef(id) {
    return C.expedition.find(function (e) { return e.id === id; }) || null;
  }

  function slotDef(kind) {
    return (C.expeditionSlots || []).find(function (s) { return s.id === kind; }) || null;
  }

  // 槽位下标由 config 顺序决定（short=0 / long=1）
  function slotIndex(kind) {
    return (C.expeditionSlots || []).findIndex(function (s) { return s.id === kind; });
  }

  // 双槽结构兜底：旧档/脏档在 save 层已归一，这里再保证数组长度与类型
  function ensureExpedition(state) {
    const exp = state.expedition;
    if (!exp || typeof exp !== 'object' || !Array.isArray(exp.slots)) {
      state.expedition = HZ.Save.normalizeExpedition(exp);
    }
    while (state.expedition.slots.length < (C.expeditionSlots || []).length) {
      state.expedition.slots.push(null);
    }
    return state.expedition;
  }

  function ensurePhotos(state) {
    const p = state.photos;
    if (!p || typeof p !== 'object' || Array.isArray(p) || !Array.isArray(p.owned)) {
      state.photos = HZ.Save.normalizePhotos(p);
    }
    return state.photos;
  }

  function photoDef(id) {
    const pool = (C.photos && C.photos.pool) || [];
    return pool.find(function (p) { return p.id === id; }) || null;
  }

  function photoCount(state) {
    return ensurePhotos(state).owned.length;
  }

  function hasExpedition(state) {
    const exp = ensureExpedition(state);
    return exp.slots.some(function (s) { return !!s; });
  }

  function slotStatus(state, index, now) {
    const exp = ensureExpedition(state);
    const e = exp.slots[index];
    if (!e) return null;
    return {
      index: index,
      slot: e,
      remaining: Math.max(0, e.endsAt - now),
      done: now >= e.endsAt
    };
  }

  // 派遣：状态分不再拦截，快照分数留到结算判空手
  function startExpedition(state, slotKind, tierId, now) {
    const sd = slotDef(slotKind);
    if (!sd) return { ok: false, reason: '未知槽位' };
    const def = tierDef(tierId);
    if (!def) return { ok: false, reason: '未知档位' };
    if (!Array.isArray(def.slots) || def.slots.indexOf(sd.id) < 0) {
      return { ok: false, reason: '这个档位不在' + sd.name };
    }
    if (state.level < sd.unlockLevel) {
      return { ok: false, reason: 'Lv' + sd.unlockLevel + ' 解锁' + sd.name };
    }
    if (state.level < def.unlockLevel) {
      return { ok: false, reason: 'Lv' + def.unlockLevel + ' 解锁' };
    }

    const exp = ensureExpedition(state);
    const index = slotIndex(sd.id);
    if (exp.slots[index]) return { ok: false, reason: '这个槽位还在探险' };

    const score = statusScore(state);
    exp.slots[index] = {
      id: def.id,
      name: def.name,
      slot: sd.id,
      startAt: now,
      endsAt: now + def.durationSec * 1000,
      score: score,
      claimed: false
    };
    return { ok: true, def: def, slot: sd.id, index: index };
  }

  function tierMul(score) {
    const t = C.expeditionRules.scoreTiers.find(function (x) { return score >= x.min; });
    return t ? t.mul : 0.6;
  }

  // 结算：空手判定看派遣时快照（状态分 <20 且时长 >=2h）；
  // 20–39 由 tierMul 落到 0.8；照片按档位概率掉落，重复折瓜子。
  function settleExpedition(state, index, now) {
    const exp = ensureExpedition(state);
    const e = exp.slots[index];
    if (!e) return null;
    if (now != null && now < e.endsAt) return null;

    const def = tierDef(e.id);
    if (!def) {
      exp.slots[index] = null;
      return null;
    }

    const rules = C.expeditionRules;
    const isLong = def.durationSec >= rules.longDurationSec;
    const empty = isLong && e.score < rules.minScoreForLong;

    let seeds = 0;
    let material = false;
    let photoId = null;
    let dup = false;
    let dupSeeds = 0;

    if (empty) {
      state.stats.clean = clamp(state.stats.clean - rules.emptyPenaltyClean, 100);
    } else {
      seeds = Math.round(def.seedBase * tierMul(e.score));
      material = Math.random() < def.materialRate;
      if (material) state.materials += 1;

      const rate = typeof def.photoRate === 'number' ? def.photoRate : 0;
      if (rate > 0 && Math.random() < rate) {
        const pool = (C.photos && C.photos.pool) || [];
        if (pool.length) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          photoId = pick.id;
          const photos = ensurePhotos(state);
          if (photos.owned.indexOf(pick.id) >= 0) {
            dup = true;
            dupSeeds = (C.photos && C.photos.dupSeeds) || 20;
            state.seeds += dupSeeds;
            photos.dupSeeds += 1;
          } else {
            photos.owned.push(pick.id);
          }
        }
      }
    }

    state.seeds += seeds;
    exp.slots[index] = null;

    const photo = photoId ? photoDef(photoId) : null;
    state.lastResult = {
      name: def.name,
      slot: e.slot,
      seeds: seeds,
      material: material,
      empty: empty,
      doubled: false,
      photoId: photoId,
      photoName: photo ? photo.name : '',
      dup: dup,
      dupSeeds: dupSeeds
    };
    return state.lastResult;
  }

  function firstDoneIndex(state, now) {
    const exp = ensureExpedition(state);
    for (let i = 0; i < exp.slots.length; i++) {
      const s = exp.slots[i];
      if (s && now >= s.endsAt) return i;
    }
    return -1;
  }

  // 结算页看广告翻倍（模拟）：只翻瓜子基础收益，照片折算不加倍
  function doubleResult(state) {
    const r = state.lastResult;
    if (!r || r.doubled || r.empty || r.seeds <= 0) return null;
    state.seeds += r.seeds;
    r.seeds *= 2;
    r.doubled = true;
    return r;
  }

  function canWatchAd(state, now) {
    rollDay(state, now);
    return state.ad.count < C.ads.dailyCap;
  }

  function markAdWatched(state, now) {
    rollDay(state, now);
    state.ad.count += 1;
  }

  function loadOrCreate() {
    const data = HZ.Save.read();
    if (!data || !data.stats) return create();

    const base = create();
    const state = Object.assign(base, data);
    state.stats = Object.assign({}, base.stats, data.stats);
    state.cooldowns = Object.assign({}, base.cooldowns, data.cooldowns);
    state.daily = data.daily || base.daily;
    state.ad = data.ad || base.ad;
    state.room = data.room || base.room;
    ensureRoom(state);

    // v3 结构兜底（save.read 已迁移，这里防手改档）
    state.expedition = HZ.Save.normalizeExpedition(state.expedition);
    state.photos = HZ.Save.normalizePhotos(state.photos);

    // 离线结算：0.8 系数、最多 10 小时
    tick(state, Date.now(), true);
    rollDay(state, Date.now());
    return state;
  }

  return {
    create: create,
    loadOrCreate: loadOrCreate,
    tick: tick,
    statusScore: statusScore,
    isTired: isTired,
    expNeeded: expNeeded,
    addExp: addExp,
    title: title,
    actionReadyIn: actionReadyIn,
    doAction: doAction,
    startExpedition: startExpedition,
    slotStatus: slotStatus,
    firstDoneIndex: firstDoneIndex,
    hasExpedition: hasExpedition,
    settleExpedition: settleExpedition,
    doubleResult: doubleResult,
    tierMul: tierMul,
    slotDef: slotDef,
    slotIndex: slotIndex,
    tierDef: tierDef,
    photoDef: photoDef,
    photoCount: photoCount,
    canWatchAd: canWatchAd,
    markAdWatched: markAdWatched,
    ensureRoom: ensureRoom,
    furnitureDef: furnitureDef,
    roomCap: roomCap,
    inventoryCount: inventoryCount,
    placedCount: placedCount,
    buy: buy,
    placeFromInventory: placeFromInventory,
    movePlaced: movePlaced,
    retrievePlaced: retrievePlaced
  };
})();
