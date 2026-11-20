// 场景层：AI 像素素材拼成的暖色鼠屋（2.5D 分层）
// 绘制顺序：背景 → 按落地点排序的物件/鼠鼠 → 前景栅栏 → 光照 → HUD
window.HZ = window.HZ || {};

HZ.Scene = (function () {
  const VW = 640;
  const VH = 360;

  // 场景分区（640×360 虚拟坐标，由素材实测得出）
  const BANDS = {
    wallBottom: 100,    // 木墙与木屑地面交界
    fenceTop: 260,      // 前景栅栏立柱顶端
    grassTop: 334,      // 草地起始行
    groundLine: 278     // 鼠鼠初始落地线
  };

  // 物件摆放表：baseY 决定前后深度，standX/standY 是鼠鼠互动站位
  const PLACEMENTS = [
    { id: 'wheel',   asset: 'wheel',   h: 150, cx: 92,  baseY: 250, standX: 168, standY: 264, label: '跑轮' },
    { id: 'bowl',    asset: 'bowl',    h: 40,  cx: 205, baseY: 272, standX: 168, standY: 282, label: '食盆' },
    { id: 'bottle',  asset: 'bottle',  h: 104, cx: 300, baseY: 252, standX: 262, standY: 266, label: '水瓶' },
    { id: 'hideout', asset: 'hideout', h: 148, cx: 500, baseY: 294, standX: 440, standY: 306, label: '纸箱窝' },
    { id: 'balls',   asset: 'balls',   h: 54,  cx: 582, baseY: 282, standX: 550, standY: 294, label: '玩具球' }
  ];

  let objects = [];
  let backdrop = null;
  let lightLayer = null;

  // 背景素材已是无栅栏的完整地面，不再做运行时拼贴
  function buildBackdrop() {
    const cv = document.createElement('canvas');
    cv.width = VW;
    cv.height = VH;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(HZ.Assets.get('bg'), 0, 0, VW, VH);
    return cv;
  }

  // 暖光与暗角：AI 原图已带光照，这里只做很轻的统一处理
  function buildLight() {
    const cv = document.createElement('canvas');
    cv.width = VW;
    cv.height = VH;
    const g = cv.getContext('2d');

    const warm = g.createRadialGradient(VW * 0.46, VH * 0.30, 24, VW * 0.5, VH * 0.55, VH * 1.05);
    warm.addColorStop(0, 'rgba(255,228,170,0.10)');
    warm.addColorStop(0.6, 'rgba(255,205,130,0.03)');
    warm.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = warm;
    g.fillRect(0, 0, VW, VH);

    const vig = g.createRadialGradient(VW * 0.5, VH * 0.46, VH * 0.40, VW * 0.5, VH * 0.5, Math.max(VW, VH) * 0.80);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(40,22,10,0.30)');
    g.fillStyle = vig;
    g.fillRect(0, 0, VW, VH);

    return cv;
  }

  function init() {
    backdrop = buildBackdrop();
    lightLayer = buildLight();

    objects = PLACEMENTS.map(function (p) {
      const img = HZ.Assets.get(p.asset);
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const w = Math.round(p.h * iw / ih);
      return {
        id: p.id,
        asset: p.asset,
        label: p.label,
        x: Math.round(p.cx - w / 2),
        y: Math.round(p.baseY - p.h),
        w: w,
        h: p.h,
        baseY: p.baseY,
        standX: p.standX,
        standY: p.standY
      };
    });
  }

  function drawBg(ctx) {
    ctx.drawImage(backdrop, 0, 0);
  }

  function drawFence(ctx) {
    ctx.drawImage(HZ.Assets.get('fence'), 0, 0, VW, VH);
  }

  function drawLight(ctx) {
    ctx.drawImage(lightLayer, 0, 0);
  }

  function currentAsset(o, state, now) {
    if (o.id === 'bottle') {
      return state.stats.thirst < 30 ? 'bottleLow' : 'bottle';
    }
    if (o.id === 'bowl') {
      return state.stats.satiety < 25 ? 'bowlEmpty' : 'bowl';
    }
    if (o.id === 'wheel' && HZ.Mouse.isRunning()) {
      return (Math.floor(now / 90) % 2 === 0) ? 'wheel' : 'wheelF2';
    }
    return o.asset;
  }

  function drawObject(ctx, state, now, o) {
    // 接触阴影：把物件压在木屑上
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#4a2d15';
    ctx.beginPath();
    ctx.ellipse(o.x + o.w / 2, o.baseY - 2, o.w * 0.40, Math.max(3, o.h * 0.045), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const img = HZ.Assets.get(currentAsset(o, state, now)) || HZ.Assets.get(o.asset);
    ctx.drawImage(img, o.x, o.y, o.w, o.h);
  }

  // 鼠鼠和物件按落地点排序，走到物体后面时会被正确遮挡
  function drawWorld(ctx, state, now, mouse) {
    const drawables = objects.map(function (o) {
      return {
        footY: o.baseY,
        draw: function () { drawObject(ctx, state, now, o); }
      };
    });
    drawables.push({
      footY: mouse.y,
      draw: function () { HZ.Mouse.draw(ctx, mouse, now); }
    });
    drawables.sort(function (a, b) { return a.footY - b.footY; });
    drawables.forEach(function (item) { item.draw(); });
  }

  function byId(id) {
    return objects.find(function (o) { return o.id === id; }) || null;
  }

  // 命中检测：从后往前，优先命中上层物件
  function hitObject(x, y) {
    const sorted = objects.slice().sort(function (a, b) { return b.baseY - a.baseY; });
    for (let i = 0; i < sorted.length; i++) {
      const o = sorted[i];
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
    }
    return null;
  }

  return {
    VW: VW,
    VH: VH,
    BANDS: BANDS,
    init: init,
    drawBg: drawBg,
    drawFence: drawFence,
    drawLight: drawLight,
    drawWorld: drawWorld,
    hitObject: hitObject,
    byId: byId,
    objects: function () { return objects; }
  };
})();
