// 场景层：AI 像素素材拼成的暖色鼠屋（2.5D 分层）
// 绘制顺序：合成背景 → 可交互物件 → 鼠鼠 → 前景栅栏 → 光照 → HUD
//
// 背景合成说明：
// 原始背景图已自带一道栅栏，若再叠前景栅栏层会出现"两道错位栅栏"，
// 栅栏占比被推到 30% 以上，物件也没法正确落位。
// 因此初始化时先把背景自带的栅栏带用上方木屑纹理覆盖，只保留前景栅栏层，
// 这样栅栏高度可控，鼠鼠和物件也能被栅栏自然遮挡。
window.HZ = window.HZ || {};

HZ.Scene = (function () {
  const VW = 640;
  const VH = 360;

  // 场景分区（640×360 虚拟坐标，由素材实测得出）
  const BANDS = {
    wallBottom: 92,     // 木墙与木屑地面交界
    bgFenceTop: 207,    // 背景图自带栅栏的起始行（需被覆盖）
    fenceTop: 270,      // 前景栅栏立柱顶端
    grassTop: 334,      // 草地起始行
    groundLine: 282     // 鼠鼠与物件的默认落地线
  };

  // 物件摆放表：cx 为水平中心，baseY 为落地线，h 为显示高度，standX 为鼠鼠互动站位
  // baseY 略低于栅栏顶线（270），让底部被栅栏压住一点，形成"站在围栏里"的纵深
  const PLACEMENTS = [
    { id: 'wheel',   asset: 'wheel',   h: 150, cx: 92,  baseY: 284, standX: 168, label: '跑轮' },
    { id: 'bowl',    asset: 'bowl',    h: 40,  cx: 205, baseY: 280, standX: 168, label: '食盆' },
    { id: 'bottle',  asset: 'bottle',  h: 104, cx: 300, baseY: 278, standX: 262, label: '水瓶' },
    { id: 'hideout', asset: 'hideout', h: 148, cx: 500, baseY: 286, standX: 440, label: '纸箱窝' },
    { id: 'balls',   asset: 'balls',   h: 54,  cx: 582, baseY: 280, standX: 550, label: '玩具球' }
  ];

  let objects = [];
  let backdrop = null;
  let lightLayer = null;

  // 合成背景：覆盖原图自带栅栏，用上方木屑纹理向下延伸
  function buildBackdrop() {
    const cv = document.createElement('canvas');
    cv.width = VW;
    cv.height = VH;
    const g = cv.getContext('2d');
    const bg = HZ.Assets.get('bg');

    g.imageSmoothingEnabled = false;
    g.drawImage(bg, 0, 0, VW, VH);

    // 用两段接近 1:1 的木屑纹理填满原栅栏所在区域：
    // 拉伸比越小，颗粒越不失真，接缝也越不明显
    const scale = bg.height / VH;
    function fillBand(destTop, destBottom, srcTop, srcBottom) {
      g.drawImage(
        bg,
        0, Math.round(srcTop * scale),
        bg.width, Math.round((srcBottom - srcTop) * scale),
        0, destTop,
        VW, destBottom - destTop
      );
    }

    const mid = Math.round((BANDS.bgFenceTop + BANDS.grassTop) / 2);
    fillBand(BANDS.bgFenceTop, mid, BANDS.bgFenceTop - 58, BANDS.bgFenceTop - 4);
    fillBand(mid, BANDS.grassTop, BANDS.wallBottom + 6, BANDS.bgFenceTop - 54);

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
        standX: p.standX
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

  function drawObjects(ctx, state, now) {
    objects.forEach(function (o) {
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
    });
  }

  function byId(id) {
    return objects.find(function (o) { return o.id === id; }) || null;
  }

  // 命中检测：从后往前，优先命中上层物件
  function hitObject(x, y) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
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
    drawObjects: drawObjects,
    hitObject: hitObject,
    byId: byId,
    objects: function () { return objects; }
  };
})();
