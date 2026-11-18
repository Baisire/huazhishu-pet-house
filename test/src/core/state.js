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
      photos: 0,
      cooldowns: cooldowns,
      daily: { key: dayKey(now), counts: {} },
      expedition: null,
      lastResult: null,
      ad: { key: dayKey(now), count: 0 }
    };
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

  function startExpedition(state, id, now) {
    if (state.expedition) return { ok: false, reason: '鼠鼠还在外面' };
    const def = C.expedition.find(function (e) { return e.id === id; });
    if (!def) return { ok: false, reason: '未知档位' };
    if (state.level < def.unlockLevel) return { ok: false, reason: 'Lv' + def.unlockLevel + ' 解锁' };

    const score = statusScore(state);
    const isLong = def.durationSec >= C.expeditionRules.longDurationSec;
    if (isLong && score < C.expeditionRules.minScoreForLong) {
      return { ok: false, reason: '状态分不足 20，出不了远门' };
    }

    state.expedition = {
      id: def.id,
      name: def.name,
      startedAt: now,
      endsAt: now + def.durationSec * 1000,
      score: score
    };
    return { ok: true, def: def };
  }

  function tierMul(score) {
    const t = C.expeditionRules.scoreTiers.find(function (x) { return score >= x.min; });
    return t ? t.mul : 0.6;
  }

  function expeditionStatus(state, now) {
    const e = state.expedition;
    if (!e) return null;
    return {
      expedition: e,
      remaining: Math.max(0, e.endsAt - now),
      done: now >= e.endsAt
    };
  }

  function settleExpedition(state) {
    const e = state.expedition;
    if (!e) return null;
    const def = C.expedition.find(function (x) { return x.id === e.id; });
    const rules = C.expeditionRules;
    const isLong = def.durationSec >= rules.longDurationSec;
    const empty = isLong && e.score < rules.minScoreForLong;

    let seeds = 0;
    let material = false;
    if (empty) {
      state.stats.clean = clamp(state.stats.clean - rules.emptyPenaltyClean, 100);
    } else {
      seeds = Math.round(def.seedBase * tierMul(e.score));
      material = Math.random() < def.materialRate;
      if (material) state.materials += 1;
    }

    state.seeds += seeds;
    state.expedition = null;
    state.lastResult = {
      name: def.name,
      seeds: seeds,
      material: material,
      empty: empty,
      doubled: false
    };
    return state.lastResult;
  }

  // 结算页看广告翻倍（模拟）
  function doubleResult(state) {
    const r = state.lastResult;
    if (!r || r.doubled || r.empty) return null;
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
    expeditionStatus: expeditionStatus,
    settleExpedition: settleExpedition,
    doubleResult: doubleResult,
    canWatchAd: canWatchAd,
    markAdWatched: markAdWatched
  };
})();
