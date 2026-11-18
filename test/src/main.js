// 启动、主循环、输入分发
// 渲染分两段：先在虚拟分辨率（高 360）的离屏画布上画，再整数感放大铺满屏幕，
// 这样既保证像素风一致，又不会被不同机型拉伸变形。
window.HZ = window.HZ || {};

(function () {
  const C = HZ.CONFIG;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d');

  let vw = 640;
  let vh = C.virtual.height;
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
  let scene = null;
  let lay = null;
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

    vh = C.virtual.height;
    vw = Math.round(vh * cssW / cssH);
    vw = Math.max(C.virtual.minWidth, Math.min(C.virtual.maxWidth, vw));

    buffer.width = vw;
    buffer.height = vh;

    const scale = Math.min(cssW / vw, cssH / vh);
    view = {
      scale: scale,
      ox: (cssW - vw * scale) / 2,
      oy: (cssH - vh * scale) / 2,
      dpr: dpr
    };

    scene = HZ.Scene.build(vw, vh);
    lay = scene.layout;

    if (mouse) {
      mouse.baseY = lay.baseline;
      mouse.x = Math.min(mouse.x, lay.walkRight);
      mouse.targetX = Math.min(mouse.targetX, lay.walkRight);
    }
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

  // ---------------- 交互 ----------------
  function actionFeedback(actionId, def) {
    const colors = {
      feed: '#f0a63c', drink: '#7fbfe0', bath: '#bfe9ff',
      play: '#f28fae', tidy: '#e8c98d', pet: '#f28fae'
    };
    const c = colors[actionId] || '#f7e9cf';
    const mx = mouse.x;
    const my = mouse.baseY - 70;

    if (actionId === 'bath') {
      HZ.Effects.spawnBubbles(mx, my, 10);
    } else if (actionId === 'tidy') {
      HZ.Effects.spawnDust(mx + 40, mouse.baseY - 10, 8);
    } else if (actionId === 'pet' || actionId === 'play') {
      HZ.Effects.spawnHearts(mx, my, 6);
    } else {
      HZ.Effects.spawnStars(mx, my, c, 8);
    }
    HZ.Effects.floatText(mx, my - 8, def.name + ' +' + def.value, c);
  }

  function doCare(id) {
    const now = clock();
    if (state.expedition) {
      HZ.Effects.toast('鼠鼠出门探险了，等它回来');
      return;
    }
    const res = HZ.State.doAction(state, id, now);
    if (!res.ok) {
      HZ.Effects.toast(res.reason === 'cd'
        ? '还要等 ' + formatSec(res.remainSec)
        : res.reason);
      return;
    }
    mouse.state = res.def.mouseAct || 'happy';
    mouse.actT = 900;
    if (res.def.mouseAct === 'eat' || res.def.mouseAct === 'drink') mouse.facing = 1;
    actionFeedback(id, res.def);

    if (res.leveled > 0) {
      HZ.Effects.toast('升级！Lv.' + state.level + ' ' + HZ.State.title(state));
      HZ.Effects.spawnStars(mouse.x, mouse.baseY - 90, '#ffd54f', 14);
    }
    save();
  }

  function formatSec(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ' 分 ' + (s < 10 ? '0' + s : s) + ' 秒';
  }

  function dispatch(id) {
    const now = clock();
    const res = HZ.State.startExpedition(state, id, now);
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
    mouse.x = lay.walkRight;
    mouse.baseY = lay.baseline;
    mouse.targetX = Math.round(vw * 0.5);
    mouse.facing = -1;
    mouse.state = 'walk';

    if (result.empty) {
      HZ.Effects.toast('鼠鼠空手而归，还弄脏了');
      HZ.Effects.spawnDust(mouse.x, mouse.baseY - 10, 10);
    } else {
      HZ.Effects.spawnStars(mouse.x, mouse.baseY - 60, '#ffd54f', 12);
    }
    HZ.HUD.setPanel('result');
    save();
  }

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
        mouse = HZ.Mouse.create(lay);
        HZ.HUD.setPanel(null);
        HZ.Effects.clear();
        HZ.Effects.toast('已重置');
        save();
        break;
    }
  }

  function onPointerDown(e) {
    if (HZ.HUD.getPanel()) {
      const p0 = toVirtual(e.clientX, e.clientY);
      const inPanel = HZ.HUD.hit(p0.x, p0.y, state, clock(), vw, vh);
      if (inPanel) handleIntent(inPanel);
      return;
    }

    const p = toVirtual(e.clientX, e.clientY);
    const intent = HZ.HUD.hit(p.x, p.y, state, clock(), vw, vh);
    if (intent) {
      handleIntent(intent);
      return;
    }

    // 点鼠鼠本体：抚摸
    if (!mouse.away &&
        p.x > mouse.x - 100 && p.x < mouse.x + 100 &&
        p.y > mouse.baseY - 105 && p.y < mouse.baseY + 10) {
      doCare('pet');
    }
  }

  // ---------------- 主循环 ----------------
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0);
    lastFrame = ts;

    timeOffset += dt * 1000 * (speedMul - 1);
    const now = clock();

    HZ.State.tick(state, now, false);

    // 探险到期自动结算
    if (state.expedition && now >= state.expedition.endsAt) {
      finishExpedition();
    }

    HZ.Mouse.update(mouse, dt, now, lay, { tired: HZ.State.isTired(state) });
    HZ.Effects.update(dt);

    // 背景
    bctx.clearRect(0, 0, vw, vh);
    bctx.drawImage(scene.bg, 0, 0);

    // 探险中在地面留一串脚印
    if (state.expedition) drawFootprints(bctx, now);

    // 鼠鼠 + 粒子
    HZ.Mouse.draw(bctx, mouse, now);
    HZ.Effects.draw(bctx);

    // 前景：栅栏与草地压在鼠鼠前面，形成围栏纵深感
    bctx.drawImage(scene.fg, 0, 0);

    // HUD 永远在最上层
    HZ.HUD.draw(bctx, state, HZ.HUD.layout(vw, vh), now, speedMul);
    HZ.Effects.drawToast(bctx, vw);

    // 贴到屏幕
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(0, 0, canvas.width / view.dpr, canvas.height / view.dpr);
    ctx.drawImage(
      buffer, 0, 0, vw, vh,
      view.ox, view.oy, vw * view.scale, vh * view.scale
    );

    if (Date.now() - lastSave > 15000) save();

    requestAnimationFrame(frame);
  }

  function drawFootprints(g, now) {
    const y = lay.baseline + 6;
    const phase = Math.floor(now / 900) % 8;
    g.save();
    g.globalAlpha = 0.30;
    g.fillStyle = '#7a5330';
    for (let i = 0; i < 5; i++) {
      const x = lay.vw * 0.62 + i * 18;
      const off = ((i + phase) % 2) * 4;
      g.fillRect(Math.round(x), Math.round(y + off), 4, 3);
      g.fillRect(Math.round(x - 1), Math.round(y + off) - 3, 2, 2);
    }
    g.restore();
  }

  // ---------------- 启动 ----------------
  function start() {
    resize();
    state = HZ.State.loadOrCreate();
    mouse = HZ.Mouse.create(lay);
    mouse.away = !!state.expedition;
    // 离线期间到期的探险，直接弹结算
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
