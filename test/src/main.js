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
    const cy = mouse.baseY - 70;
    if (actionId === 'bath') HZ.Effects.spawnBubbles(cx, cy, 10);
    else if (actionId === 'tidy') HZ.Effects.spawnDust(cx + 30, mouse.baseY - 10, 8);
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
    HZ.Effects.floatText(mouse.x, mouse.baseY - 80, res.def.name + ' +' + res.def.value, '#f7e9cf');

    if (res.leveled > 0) {
      HZ.Effects.toast('升级！Lv.' + state.level + ' ' + HZ.State.title(state));
      HZ.Effects.spawnStars(mouse.x, mouse.baseY - 90, '#ffd54f', 12);
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
      HZ.Mouse.walkTo(mouse, o.standX, function () {
        HZ.Effects.toast('鼠鼠钻进纸箱窝里了');
        HZ.Mouse.act(mouse, 'pet', 900);
        state.stats.happy = Math.min(100, state.stats.happy + 5);
        save();
      });
      return;
    }

    HZ.Mouse.walkTo(mouse, o.standX, function () {
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
    const result = HZ.State.settleExpedition(state);
    if (!result) return;
    mouse.away = false;
    mouse.x = 560;
    mouse.facing = -1;
    HZ.Mouse.walkTo(mouse, 330);

    if (result.empty) {
      HZ.Effects.toast('鼠鼠空手而归，还弄脏了');
      HZ.Effects.spawnDust(mouse.x, mouse.baseY - 10, 10);
    } else {
      HZ.Effects.spawnStars(mouse.x, mouse.baseY - 60, '#ffd54f', 12);
    }
    HZ.HUD.setPanel('result');
    save();
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
    const p = toVirtual(e.clientX, e.clientY);

    if (HZ.HUD.getPanel()) {
      const r = HZ.HUD.hit(p.x, p.y, state, clock(), VW, VH);
      if (r) handleIntent(r);
      return;
    }

    const hudIntent = HZ.HUD.hit(p.x, p.y, state, clock(), VW, VH);
    if (hudIntent) {
      handleIntent(hudIntent);
      return;
    }

    // 1) 先判可交互物件
    const obj = HZ.Scene.hitObject(p.x, p.y);
    if (obj && !mouse.away) {
      touchObject(obj);
      return;
    }

    // 2) 再判鼠鼠本体：抚摸
    if (!mouse.away) {
      const img = HZ.Assets.get('mouse');
      const ih = img.naturalHeight || img.height || 1;
      const iw = img.naturalWidth || img.width || 1;
      const w = Math.round(98 * iw / ih);
      if (p.x > mouse.x - w / 2 && p.x < mouse.x + w / 2 &&
          p.y > mouse.baseY - 100 && p.y < mouse.baseY + 6) {
        doCare('pet');
      }
    }
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
    HZ.Scene.drawObjects(bctx, state, now);
    HZ.Mouse.draw(bctx, mouse, now);
    HZ.Effects.draw(bctx);
    HZ.Scene.drawFence(bctx);
    HZ.Scene.drawLight(bctx);

    HZ.HUD.draw(bctx, state, HZ.HUD.layout(VW, VH), now, speedMul);
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
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) save();
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
