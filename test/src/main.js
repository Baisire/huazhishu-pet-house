// 启动、主循环、输入分发
// 虚拟分辨率固定 640×360（16:9），按屏幕等比放大并居中，保证像素不变形。
window.HZ = window.HZ || {};

(function () {
  const VW = 640;
  const VH = 360;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const buffer = document.createElement('canvas');
  buffer.width = VW;
  buffer.height = VH;
  const bctx = buffer.getContext('2d');

  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  let state = null;
  let mouse = null;
  let speedMul = 1;
  let timeOffset = 0;
  let lastFrame = 0;
  let lastSave = 0;
  let drag = null;          // 已激活的拖拽（幽灵件跟随）
  let dragCandidate = null; // 按下但还没移动够：商店条目用来区分「点买」与「拖出」
  let reopenTimer = null;   // 落定后延迟重开商店的定时器（让 +5 特效播完）

  function clock() {
    return Date.now() + timeOffset;
  }

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    const scale = Math.min(cssW / VW, cssH / VH);
    view = {
      scale: scale,
      ox: (cssW - VW * scale) / 2,
      oy: (cssH - VH * scale) / 2,
      dpr: dpr
    };
  }

  function toVirtual(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.ox) / view.scale,
      y: (clientY - rect.top - view.oy) / view.scale
    };
  }

  // ---------------- 存档 ----------------
  function save() {
    HZ.Save.write(state);
    lastSave = Date.now();
  }

  function formatSec(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ' 分 ' + (s < 10 ? '0' + s : s) + ' 秒';
  }

  // ---------------- 照料动作 ----------------
  const MOUSE_ACT = {
    feed: { state: 'eat', ms: 1400 },
    drink: { state: 'drink', ms: 1400 },
    play: { state: 'run', ms: 2200 },
    bath: { state: 'pet', ms: 1000 },
    tidy: { state: 'pet', ms: 1000 },
    pet: { state: 'pet', ms: 900 }
  };

  function feedback(actionId) {
    const cx = mouse.x;
    const cy = mouse.y - 70;
    if (actionId === 'bath') HZ.Effects.spawnBubbles(cx, cy, 10);
    else if (actionId === 'tidy') HZ.Effects.spawnDust(cx + 30, mouse.y - 10, 8);
    else if (actionId === 'pet') HZ.Effects.spawnHearts(cx, cy, 6);
    else HZ.Effects.spawnStars(cx, cy, '#ffd54f', 7);
  }

  function doCare(id) {
    if (state.expedition) {
      HZ.Effects.toast('鼠鼠出门探险了，等它回来');
      return false;
    }
    const res = HZ.State.doAction(state, id, clock());
    if (!res.ok) {
      HZ.Effects.toast(res.reason === 'cd'
        ? '还要等 ' + formatSec(res.remainSec)
        : res.reason);
      return false;
    }

    const act = MOUSE_ACT[id] || MOUSE_ACT.pet;
    HZ.Mouse.act(mouse, act.state, act.ms);
    feedback(id);
    HZ.Effects.floatText(mouse.x, mouse.y - 80, res.def.name + ' +' + res.def.value, '#f7e9cf');

    if (res.leveled > 0) {
      HZ.Effects.toast('升级！Lv.' + state.level + ' ' + HZ.State.title(state));
      HZ.Effects.spawnStars(mouse.x, mouse.y - 90, '#ffd54f', 12);
    }
    save();
    return true;
  }

  // ---------------- 场景物件交互 ----------------
  const OBJECT_CARE = {
    wheel: 'play',
    bowl: 'feed',
    bottle: 'drink',
    balls: 'play',
    hideout: 'pet'
  };

  function touchObject(o) {
    if (state.expedition) {
      HZ.Effects.toast('鼠鼠出门探险了，等它回来');
      return;
    }
    if (mouse.state === 'walk') return;

    const careId = OBJECT_CARE[o.id];
    if (o.id === 'hideout') {
      HZ.Mouse.walkTo(mouse, o.standX, o.standY, function () {
        HZ.Effects.toast('鼠鼠钻进纸箱窝里了');
        HZ.Mouse.act(mouse, 'pet', 900);
        state.stats.happy = Math.min(100, state.stats.happy + 5);
        save();
      });
      return;
    }

    HZ.Mouse.walkTo(mouse, o.standX, o.standY, function () {
      doCare(careId);
    });
  }

  // ---------------- 探险 ----------------
  function dispatch(id) {
    const res = HZ.State.startExpedition(state, id, clock());
    if (!res.ok) {
      HZ.Effects.toast(res.reason);
      return;
    }
    HZ.HUD.setPanel(null);
    mouse.away = true;
    HZ.Effects.toast('鼠鼠出发啦：' + res.def.name);
    save();
  }

  function finishExpedition() {
    // 拖拽收尾逻辑不能覆盖结算面板：先清掉拖拽与待重开定时器
    cancelDrag();
    const result = HZ.State.settleExpedition(state);
    if (!result) return;
    mouse.away = false;
    mouse.x = 560;
    mouse.y = 244;
    mouse.facing = -1;
    HZ.Mouse.walkTo(mouse, 330, 268);

    if (result.empty) {
      HZ.Effects.toast('鼠鼠空手而归，还弄脏了');
      HZ.Effects.spawnDust(mouse.x, mouse.y - 10, 10);
    } else {
      HZ.Effects.spawnStars(mouse.x, mouse.y - 60, '#ffd54f', 12);
    }
    HZ.HUD.setPanel('result');
    save();
  }

  // ---------------- 家具拖拽 ----------------
  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function retrieveRect() {
    return { x: Math.round(VW / 2) - 78, y: VH - 50, w: 156, h: 38 };
  }

  // 商店条目按下：有库存就拖库存，没有库存但买得起就走「拖出即买」
  function beginShopCandidate(itemId, p, pointerId) {
    const def = HZ.Furniture.def(itemId);
    if (!def) return;
    const count = HZ.State.inventoryCount(state, itemId);
    if (count <= 0 && state.seeds < def.price) {
      HZ.Effects.toast('瓜子不够，先去探险攒攒');
      return;
    }
    dragCandidate = {
      source: 'shop', itemId: itemId, pointerId: pointerId,
      sx: p.x, sy: p.y, offX: 0, offY: 0,
      pendingBuy: count <= 0, active: false
    };
  }

  // 已摆放家具按下：拖动时保留抓取偏移，避免幽灵件跳到指针中心
  function beginMoveCandidate(item, p, pointerId) {
    dragCandidate = {
      source: 'placed', uid: item.uid, itemId: item.itemId, pointerId: pointerId,
      sx: p.x, sy: p.y, offX: item.x - p.x, offY: item.y - p.y, active: false
    };
  }

  function updateDrag(p) {
    // 与落定时的取整保持一致，避免幽灵件合法、落定后偏 1px 压线
    const x = Math.round(p.x + drag.offX);
    const y = Math.round(p.y + drag.offY);
    drag.x = x;
    drag.y = y;
    drag.px = p.x;
    drag.py = p.y;
    const v = HZ.Furniture.validate(state, drag.itemId, x, y, {
      ignoreUid: drag.source === 'placed' ? drag.uid : null,
      checkCapacity: drag.source === 'shop'
    });
    drag.valid = v.ok;
    drag.reason = v.reason;
  }

  function activateDrag(p) {
    drag = dragCandidate;
    dragCandidate = null;
    drag.active = true;
    // 锁定指针：触屏切后台/滑出画布时也能收到 up/cancel，避免 stale drag
    try {
      if (canvas.setPointerCapture && drag.pointerId !== undefined) {
        canvas.setPointerCapture(drag.pointerId);
      }
    } catch (err) { /* 部分浏览器/已释放指针会抛，忽略 */ }
    // 商店面板挡住房间下半屏，拖拽时先收起，落定后延迟再打开
    if (drag.source === 'shop') HZ.HUD.setPanel(null);
    updateDrag(p);
  }

  function tapShopItem(itemId) {
    const res = HZ.State.buy(state, itemId);
    if (!res.ok) {
      HZ.Effects.toast(res.reason === '瓜子不够' ? '瓜子不够，先去探险攒攒' : res.reason);
      return;
    }
    save();
    HZ.Effects.toast('已买下 ' + res.def.name + ' · 按住拖到房间');
  }

  function afterPlace(item, first, delta) {
    save();
    if (first) {
      const d = delta || 0;
      HZ.Effects.floatText(item.x, item.y - 28, d > 0 ? '开心 +' + d : '心情已满', '#f28fae');
      HZ.Effects.spawnStars(item.x, item.y - 16, '#ffd54f', 10);
    } else {
      HZ.Effects.spawnDust(item.x, item.y - 4, 4);
    }
  }

  function clearShopReopen() {
    if (reopenTimer) {
      clearTimeout(reopenTimer);
      reopenTimer = null;
    }
  }

  // 落定后延迟重开：先让飘字/星星播完；只有面板仍为空时才打开，不抢别的面板
  function scheduleShopReopen() {
    clearShopReopen();
    reopenTimer = setTimeout(function () {
      reopenTimer = null;
      if (HZ.HUD.getPanel() === null) HZ.HUD.setPanel('shop');
    }, 1200);
  }

  function finishDrag(p) {
    const fromShop = drag.source === 'shop';

    // 拖已摆件到底部「收回」区
    if (drag.source === 'placed' && pointInRect(p, retrieveRect())) {
      const res = HZ.State.retrievePlaced(state, drag.uid);
      if (res.ok) {
        HZ.Effects.toast('已收回 ' + (res.def ? res.def.name : '家具'));
        HZ.Effects.spawnDust(drag.x, drag.y - 6, 5);
        save();
      }
      drag = null;
      return;
    }

    if (!drag.valid) {
      HZ.Effects.toast(drag.reason || '这里放不下');
    } else if (drag.source === 'shop') {
      if (drag.pendingBuy) {
        const b = HZ.State.buy(state, drag.itemId);
        if (!b.ok) {
          HZ.Effects.toast(b.reason);
          drag = null;
          if (HZ.HUD.getPanel() === null) scheduleShopReopen();
          return;
        }
      }
      const placed = HZ.State.placeFromInventory(state, drag.itemId, drag.x, drag.y);
      if (placed.ok) afterPlace(placed.item, placed.first, placed.delta);
      else {
        // 极端情况下（例如容量被并发改满）购买已入库存，落定失败也要落盘
        HZ.Effects.toast(placed.reason);
        save();
      }
    } else {
      const moved = HZ.State.movePlaced(state, drag.uid, drag.x, drag.y);
      if (moved.ok) {
        HZ.Effects.spawnDust(drag.x, drag.y - 4, 4);
        save();
      }
    }

    drag = null;
    // 从商店拖出的：延迟回到商店，先让摆放特效播完；库存还有余量可接着拖
    if (fromShop && HZ.HUD.getPanel() === null) scheduleShopReopen();
  }

  function drawRetrieveZone(ctx) {
    const r = retrieveRect();
    const hot = drag && drag.px !== undefined && pointInRect({ x: drag.px, y: drag.py }, r);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(r.x + 2, r.y + 2, r.w, r.h);
    ctx.fillStyle = hot ? 'rgba(178,62,52,0.94)' : 'rgba(48,30,17,0.90)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const border = hot ? 'rgba(255,190,170,0.95)' : 'rgba(232,196,138,0.60)';
    ctx.fillStyle = border;
    ctx.fillRect(r.x, r.y, r.w, 2);
    ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
    ctx.fillRect(r.x, r.y, 2, r.h);
    ctx.fillRect(r.x + r.w - 2, r.y, 2, r.h);
    ctx.fillStyle = '#f7e9cf';
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('收回', r.x + r.w / 2, r.y + 14);
    ctx.font = '8px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(247,233,207,0.62)';
    ctx.fillText('松手放回库存', r.x + r.w / 2, r.y + 27);
    ctx.restore();
  }

  // ---------------- 意图分发 ----------------
  function handleIntent(intent) {
    if (!intent) return;
    const now = clock();

    switch (intent.kind) {
      case 'care':
        doCare(intent.id);
        break;
      case 'panel':
        HZ.HUD.setPanel(intent.name);
        break;
      case 'closePanel':
        HZ.HUD.setPanel(null);
        break;
      case 'dispatch':
        dispatch(intent.id);
        break;
      case 'adDouble':
        if (!HZ.State.canWatchAd(state, now)) {
          HZ.Effects.toast('今天的广告次数用完了');
          return;
        }
        HZ.Platform.showRewarded('expedition_result').then(function (r) {
          if (r !== 'completed') return;
          HZ.State.markAdWatched(state, clock());
          HZ.State.doubleResult(state);
          save();
        });
        break;
      case 'speedToggle':
        speedMul = speedMul === 1 ? 60 : 1;
        HZ.Effects.toast(speedMul === 1 ? '恢复正常速度' : '测试加速 ×60');
        break;
      case 'save':
        save();
        HZ.Effects.toast('已存档');
        break;
      case 'load':
        state = HZ.State.loadOrCreate();
        mouse.away = !!state.expedition;
        HZ.HUD.setPanel(null);
        HZ.Effects.toast('已读档');
        break;
      case 'doReset':
        HZ.Save.clear();
        state = HZ.State.create();
        mouse = HZ.Mouse.create(HZ.Scene.BANDS.groundLine);
        HZ.HUD.setPanel(null);
        HZ.Effects.clear();
        HZ.Effects.toast('已重置');
        save();
        break;
    }
  }

  function onPointerDown(e) {
    // 右键/中键不触发购买、拖拽或场景交互（触屏 pointerType 不是 mouse，不受影响）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 丢失 pointerup 后的陈旧拖拽：新按下若已无按键，直接清理
    if (drag && e.buttons === 0) cancelDrag();
    // 用户开始了新的点击，取消待重开商店，避免面板突然弹出
    if (reopenTimer) clearShopReopen();
    if (drag || dragCandidate) return;
    const p = toVirtual(e.clientX, e.clientY);

    if (HZ.HUD.getPanel()) {
      const r = HZ.HUD.hit(p.x, p.y, state, clock(), VW, VH);
      if (HZ.HUD.getPanel() === 'shop') {
        if (!r) return;
        if (r.kind === 'closePanel') { HZ.HUD.setPanel(null); return; }
        if (r.kind === 'shopItem') beginShopCandidate(r.id, p, e.pointerId);
        return;
      }
      if (r) handleIntent(r);
      return;
    }

    const hudIntent = HZ.HUD.hit(p.x, p.y, state, clock(), VW, VH);
    if (hudIntent) {
      handleIntent(hudIntent);
      return;
    }

    // 0) 已摆放家具：按下即准备拖动（点一下不动就什么也不做）
    const placed = HZ.Furniture.hitPlaced(state, p.x, p.y);
    if (placed) {
      beginMoveCandidate(placed, p, e.pointerId);
      return;
    }

    // 1) 先判可交互物件
    const obj = HZ.Scene.hitObject(p.x, p.y);
    if (obj && !mouse.away) {
      touchObject(obj);
      return;
    }

    // 2) 再判鼠鼠本体：抚摸
    if (!mouse.away && HZ.Mouse.hitTest(mouse, p.x, p.y)) {
      doCare('pet');
      return;
    }

    // 3) 点空地：走到目标位置
    if (!mouse.away && mouse.state !== 'walk' && HZ.Mouse.canWalk(p.x, p.y)) {
      HZ.Mouse.walkTo(mouse, p.x, p.y);
    }
  }

  function onPointerMove(e) {
    const c = dragCandidate || drag;
    if (!c) return;
    if (e.pointerId !== undefined && c.pointerId !== undefined && e.pointerId !== c.pointerId) return;
    const p = toVirtual(e.clientX, e.clientY);

    if (dragCandidate && !dragCandidate.active) {
      const dx = p.x - dragCandidate.sx;
      const dy = p.y - dragCandidate.sy;
      if (Math.sqrt(dx * dx + dy * dy) > 6) activateDrag(p);
      return;
    }
    if (drag) updateDrag(p);
  }

  function onPointerUp(e) {
    // 右键/中键抬起不参与落定（例如右键点击商店卡片不得购买）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const c = dragCandidate || drag;
    if (!c) return;
    if (e.pointerId !== undefined && c.pointerId !== undefined && e.pointerId !== c.pointerId) return;
    const p = toVirtual(e.clientX, e.clientY);

    if (dragCandidate && !dragCandidate.active) {
      const cand = dragCandidate;
      dragCandidate = null;
      if (cand.source === 'shop') tapShopItem(cand.itemId);
      return;
    }
    if (drag) finishDrag(p);
  }

  function cancelDrag() {
    drag = null;
    dragCandidate = null;
    clearShopReopen();
  }

  // ---------------- 主循环 ----------------
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0);
    lastFrame = ts;

    timeOffset += dt * 1000 * (speedMul - 1);
    const now = clock();

    HZ.State.tick(state, now, false);

    if (state.expedition && now >= state.expedition.endsAt) {
      finishExpedition();
    }

    HZ.Mouse.update(mouse, dt, now);
    HZ.Effects.update(dt);

    bctx.clearRect(0, 0, VW, VH);
    HZ.Scene.drawBg(bctx);
    HZ.Scene.drawWorld(bctx, state, now, mouse, drag && drag.source === 'placed' ? drag.uid : null);
    HZ.Effects.draw(bctx);
    HZ.Scene.drawFence(bctx);
    HZ.Scene.drawLight(bctx);

    // 拖拽幽灵件画在世界之上、HUD 之下
    if (drag) HZ.Furniture.drawGhost(bctx, drag.itemId, drag.x, drag.y, drag.valid);

    HZ.HUD.draw(bctx, state, HZ.HUD.layout(VW, VH), now, speedMul);

    // 拖已摆件时底部浮现「收回」投放区（盖在按钮栏之上）
    if (drag && drag.source === 'placed') drawRetrieveZone(bctx);

    HZ.Effects.drawToast(bctx, VW);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b1108';
    ctx.fillRect(0, 0, canvas.width / view.dpr, canvas.height / view.dpr);
    ctx.drawImage(
      buffer, 0, 0, VW, VH,
      view.ox, view.oy, VW * view.scale, VH * view.scale
    );

    if (Date.now() - lastSave > 15000) save();

    requestAnimationFrame(frame);
  }

  // ---------------- 启动 ----------------
  function start() {
    resize();
    HZ.Scene.init();
    state = HZ.State.loadOrCreate();
    mouse = HZ.Mouse.create(HZ.Scene.BANDS.groundLine);
    mouse.away = !!state.expedition;

    if (state.expedition && clock() >= state.expedition.endsAt) {
      finishExpedition();
    }

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () {
      setTimeout(resize, 200);
    });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cancelDrag(); // 切后台收不到 pointerup，清掉拖拽与待重开定时器
        save();
      }
    });

    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function boot() {
    HZ.Assets.load(start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
