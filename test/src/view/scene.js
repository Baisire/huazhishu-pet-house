// 场景绘制：暖色像素风鼠屋
// 分成两层：
//   bg —— 墙、木屑、跑轮、水瓶、小窝、食盆、球，画在鼠鼠后面；
//   fg —— 栅栏与草地，画在鼠鼠前面，形成"鼠鼠在围栏里"的纵深感。
// 静态层用固定随机种子，保证每次刷新细节一致。
window.HZ = window.HZ || {};

HZ.Scene = (function () {
  const P = HZ.CONFIG.palette;

  function makeRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function layout(vw, vh) {
    return {
      vw: vw,
      vh: vh,
      wallH: Math.round(vh * 0.34),
      floorEnd: Math.round(vh * 0.96),
      fenceTop: Math.round(vh * 0.78),
      fenceBottom: Math.round(vh * 0.97),
      grassTop: Math.round(vh * 0.895),
      baseline: Math.round(vh * 0.755),
      walkLeft: Math.round(vw * 0.17),
      walkRight: Math.round(vw * 0.83)
    };
  }

  // ---------------- 墙 ----------------
  function drawWall(ctx, L, rnd) {
    const wallH = L.wallH;
    const plank = Math.round(wallH / 4);

    for (let i = 0; i < 4; i++) {
      const y = i * plank;
      ctx.fillStyle = i % 2 === 0 ? P.wall : P.wallLight;
      ctx.fillRect(0, y, L.vw, plank);
      // 板缝
      ctx.fillStyle = P.wallLine;
      ctx.fillRect(0, y + plank - 3, L.vw, 3);
      // 木纹
      for (let k = 0; k < Math.round(L.vw / 26); k++) {
        const gx = rnd() * L.vw;
        const gy = y + 5 + rnd() * (plank - 14);
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fillRect(Math.round(gx), Math.round(gy), 8 + Math.round(rnd() * 22), 2);
      }
      // 竖向接缝
      const seams = Math.max(2, Math.round(L.vw / 150));
      for (let s = 0; s < seams; s++) {
        const sx = Math.round((s + 0.5 + rnd() * 0.6) * L.vw / seams);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(sx, y + 2, 2, plank - 6);
      }
    }

    // 屋顶阴影
    const g = ctx.createLinearGradient(0, 0, 0, wallH);
    g.addColorStop(0, 'rgba(0,0,0,0.50)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.vw, wallH);

    // 墙脚横梁
    ctx.fillStyle = P.woodDark;
    ctx.fillRect(0, wallH - 9, L.vw, 9);
    ctx.fillStyle = 'rgba(255,220,170,0.18)';
    ctx.fillRect(0, wallH - 9, L.vw, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, wallH, L.vw, 4);
  }

  // ---------------- 木屑地面 ----------------
  function drawFloor(ctx, L, rnd) {
    const top = L.wallH;
    const h = L.floorEnd - top;

    ctx.fillStyle = P.shaving;
    ctx.fillRect(0, top, L.vw, h);

    // 由墙向外的明暗分层
    const g = ctx.createLinearGradient(0, top, 0, L.floorEnd);
    g.addColorStop(0, 'rgba(120,80,40,0.18)');
    g.addColorStop(0.35, 'rgba(255,240,200,0.10)');
    g.addColorStop(1, 'rgba(140,95,50,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, L.vw, h);

    // 木屑：大片 + 小片两层
    const area = h * L.vw;
    const tones = ['#e3c184', '#f7e3b6', '#d3ac6c', '#fdf0cd', '#c79f5f'];

    // 大片木屑：带明暗边，像刨花
    for (let i = 0; i < Math.round(area / 520); i++) {
      const x = rnd() * L.vw;
      const y = top + 6 + rnd() * (h - 12);
      const w = 8 + Math.round(rnd() * 18);
      const tone = tones[Math.floor(rnd() * tones.length)];
      ctx.fillStyle = tone;
      ctx.fillRect(Math.round(x), Math.round(y), w, 4);
      ctx.fillStyle = 'rgba(120,82,40,0.20)';
      ctx.fillRect(Math.round(x), Math.round(y) + 4, w, 1);
      ctx.fillStyle = 'rgba(255,248,220,0.45)';
      ctx.fillRect(Math.round(x), Math.round(y), w, 1);
    }

    // 小碎屑
    for (let i = 0; i < Math.round(area / 130); i++) {
      const x = rnd() * L.vw;
      const y = top + 4 + rnd() * (h - 8);
      const w = 2 + Math.round(rnd() * 5);
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
      ctx.fillRect(Math.round(x), Math.round(y), w, 2);
    }

    // 卷曲刨花
    for (let i = 0; i < Math.round(L.vw / 42); i++) {
      const x = rnd() * L.vw;
      const y = top + 16 + rnd() * (h - 40);
      ctx.strokeStyle = 'rgba(190,145,85,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(y), 4 + rnd() * 5, Math.PI * 0.15, Math.PI * 1.15);
      ctx.stroke();
    }

    // 木屑堆出的起伏
    for (let i = 0; i < Math.round(L.vw / 30); i++) {
      const x = rnd() * L.vw;
      const y = top + 14 + rnd() * (h - 30);
      ctx.fillStyle = 'rgba(170,120,62,0.14)';
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y), 12 + rnd() * 20, 4 + rnd() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 零星木块
    for (let i = 0; i < Math.round(L.vw / 90); i++) {
      const x = rnd() * L.vw;
      const y = top + 20 + rnd() * (h - 50);
      ctx.fillStyle = '#a9743d';
      ctx.fillRect(Math.round(x), Math.round(y), 8, 5);
      ctx.fillStyle = '#d2a066';
      ctx.fillRect(Math.round(x), Math.round(y), 8, 2);
      ctx.fillStyle = 'rgba(80,50,25,0.25)';
      ctx.fillRect(Math.round(x), Math.round(y) + 5, 8, 1);
    }
  }

  // ---------------- 家具 ----------------
  function drawWheel(ctx, cx, cy, r) {
    // 支架
    ctx.fillStyle = P.woodDark;
    ctx.fillRect(cx - r * 0.78, cy + r * 0.52, Math.max(4, r * 0.10), r * 0.55);
    ctx.fillRect(cx + r * 0.66, cy + r * 0.52, Math.max(4, r * 0.10), r * 0.55);
    ctx.fillStyle = P.wood;
    ctx.fillRect(cx - r * 1.02, cy + r * 1.02, r * 2.04, Math.max(5, r * 0.13));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(cx - r * 1.02, cy + r * 1.12, r * 2.04, Math.max(2, r * 0.05));

    // 外圈（深色描边 + 木色 + 内侧亮边）
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#7a5330';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.90, 0, Math.PI * 2);
    ctx.fillStyle = '#c99a5e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
    ctx.fillStyle = '#a97b47';
    ctx.fill();

    // 内鼓
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.60, 0, Math.PI * 2);
    ctx.fillStyle = '#8d6236';
    ctx.fill();
    // 鼓面横条
    ctx.fillStyle = 'rgba(255,220,170,0.16)';
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(cx - r * 0.5, cy + i * r * 0.22 - 1, r, 2);
    }

    // 辐条
    ctx.strokeStyle = 'rgba(70,44,22,0.75)';
    ctx.lineWidth = Math.max(2, r * 0.07);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + 0.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.60, cy + Math.sin(a) * r * 0.60);
      ctx.lineTo(cx + Math.cos(a) * r * 0.90, cy + Math.sin(a) * r * 0.90);
      ctx.stroke();
    }

    // 轴心
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#e3b273';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#7a5330';
    ctx.fill();

    // 高光
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,235,190,0.18)';
    ctx.fill();
  }

  function drawBottle(ctx, x, y, s) {
    // 底座
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(x - s * 0.55, y + s * 0.86, s * 1.1, s * 0.18);
    ctx.fillStyle = '#c3c8d0';
    ctx.fillRect(x - s * 0.55, y + s * 0.86, s * 1.1, s * 0.06);

    // 立柱
    ctx.fillStyle = '#b9bec7';
    ctx.fillRect(x - s * 0.06, y + s * 0.3, s * 0.12, s * 0.6);

    // 瓶身
    ctx.fillStyle = 'rgba(228,246,255,0.80)';
    ctx.fillRect(x - s * 0.34, y - s * 0.86, s * 0.68, s * 1.24);
    ctx.fillStyle = 'rgba(140,205,235,0.98)';
    ctx.fillRect(x - s * 0.30, y - s * 0.10, s * 0.60, s * 0.48);
    // 水面
    ctx.fillStyle = 'rgba(112,188,220,1)';
    ctx.fillRect(x - s * 0.30, y - s * 0.10, s * 0.60, s * 0.05);
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - s * 0.26, y - s * 0.78, s * 0.07, s * 1.06);
    // 瓶盖与吸嘴
    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(x - s * 0.19, y - s * 1.0, s * 0.38, s * 0.16);
    ctx.fillStyle = '#b6bcc6';
    ctx.fillRect(x - s * 0.05, y + s * 0.34, s * 0.10, s * 0.24);
    // 描边
    ctx.strokeStyle = 'rgba(58,44,28,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - s * 0.34, y - s * 0.86, s * 0.68, s * 1.24);
  }

  function drawHideout(ctx, x, y, w, h) {
    const left = x - w / 2;

    // 箱体
    ctx.fillStyle = '#cfa66b';
    ctx.fillRect(left, y - h, w, h);
    // 左侧暗面
    ctx.fillStyle = '#b8915c';
    ctx.fillRect(left, y - h, w * 0.14, h);
    // 顶盖
    ctx.fillStyle = '#e0bd84';
    ctx.fillRect(left - 4, y - h - 7, w + 8, 8);
    ctx.fillStyle = '#c0a06f';
    ctx.fillRect(left - 4, y - h + 1, w + 8, 2);

    // 门洞
    const dw = w * 0.52;
    const dh = h * 0.66;
    ctx.fillStyle = '#4b2f1b';
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, y);
    ctx.lineTo(x - dw / 2, y - dh + dw / 2);
    ctx.arc(x, y - dh + dw / 2, dw / 2, Math.PI, 0);
    ctx.lineTo(x + dw / 2, y);
    ctx.closePath();
    ctx.fill();
    // 门洞内侧亮边
    ctx.strokeStyle = 'rgba(255,226,180,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 瓦楞纹理
    ctx.fillStyle = 'rgba(140,100,55,0.20)';
    for (let i = 1; i < 6; i++) {
      const lx = left + w * 0.16 + (w * 0.84) * (i / 6);
      if (Math.abs(lx - x) > dw / 2 + 4) {
        ctx.fillRect(Math.round(lx), y - h + 6, 1, h - 10);
      }
    }

    // 箱体轮廓
    ctx.strokeStyle = 'rgba(90,62,34,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(left + 1, y - h + 1, w - 2, h - 2);
  }

  function drawBowl(ctx, cx, cy) {
    // 碗身
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#aeb4bd';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, 24, 9, 0, 0, Math.PI);
    ctx.fillStyle = '#c7ccd4';
    ctx.fill();
    // 碗口
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 20, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#6f757e';
    ctx.fill();
    // 颗粒
    ctx.fillStyle = '#a9753f';
    [[-9, -3], [-4, -5], [1, -3], [6, -5], [-1, -1], [4, 0], [-7, 0]].forEach(function (p) {
      ctx.fillRect(cx + p[0], cy - 4 + p[1], 3, 3);
    });
    ctx.strokeStyle = 'rgba(60,45,30,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 24, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBall(ctx, cx, cy, r, c1, c2) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = c1;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fillStyle = c2;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(70,45,25,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.36, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }

  // ---------------- 前景：栅栏 + 草地 ----------------
  function drawFence(ctx, L, rnd) {
    const top = L.fenceTop;
    const bottom = L.fenceBottom;
    const postW = Math.max(10, Math.round(L.vw / 20));
    const step = postW * 1.30;

    // 后方草地（栅栏底部的暗色草）
    ctx.fillStyle = P.grassDark;
    ctx.fillRect(0, bottom - 4, L.vw, L.vh - bottom + 4);

    // 横杆
    ctx.fillStyle = P.fence;
    ctx.fillRect(0, top + 12, L.vw, 9);
    ctx.fillRect(0, bottom - 26, L.vw, 9);
    ctx.fillStyle = P.fenceDark;
    ctx.fillRect(0, top + 21, L.vw, 2);
    ctx.fillRect(0, bottom - 17, L.vw, 2);

    // 立柱
    for (let x = -step * 0.5; x < L.vw + step; x += step) {
      const px = Math.round(x);
      const h = bottom - top;
      // 柱身
      ctx.fillStyle = P.fence;
      ctx.fillRect(px, top, postW, h + 6);
      // 受光面
      ctx.fillStyle = P.fenceLight;
      ctx.fillRect(px, top, 4, h + 6);
      // 暗面
      ctx.fillStyle = P.fenceDark;
      ctx.fillRect(px + postW - 4, top, 4, h + 6);
      // 柱顶
      ctx.fillStyle = P.fenceLight;
      ctx.fillRect(px - 2, top - 4, postW + 4, 5);
      ctx.fillStyle = P.fenceDark;
      ctx.fillRect(px - 2, top + 1, postW + 4, 1);
      // 木纹
      for (let k = 0; k < 3; k++) {
        const gy = top + 10 + rnd() * (h - 20);
        ctx.fillStyle = 'rgba(120,80,30,0.20)';
        ctx.fillRect(px + 5 + rnd() * 3, Math.round(gy), Math.max(3, postW - 12), 1);
      }
    }
  }

  function drawGrass(ctx, L, rnd) {
    ctx.fillStyle = P.grass;
    ctx.fillRect(0, L.grassTop, L.vw, L.vh - L.grassTop);

    // 明暗起伏
    const g = ctx.createLinearGradient(0, L.grassTop, 0, L.vh);
    g.addColorStop(0, 'rgba(40,80,20,0.30)');
    g.addColorStop(0.4, 'rgba(120,190,90,0.12)');
    g.addColorStop(1, 'rgba(30,70,20,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.grassTop, L.vw, L.vh - L.grassTop);

    // 草叶
    for (let i = 0; i < Math.round(L.vw / 2.4); i++) {
      const x = rnd() * L.vw;
      const y = L.grassTop + 2 + rnd() * (L.vh - L.grassTop - 4);
      const h = 3 + Math.round(rnd() * 7);
      ctx.fillStyle = rnd() > 0.55 ? P.grassLight : P.grassDark;
      ctx.fillRect(Math.round(x), Math.round(y - h), 2, h);
    }

    // 花
    const colors = ['#fff8e6', '#ffd166', '#ff9f68'];
    for (let i = 0; i < Math.max(6, Math.round(L.vw / 80)); i++) {
      const x = 8 + rnd() * (L.vw - 16);
      const y = L.grassTop + 8 + rnd() * (L.vh - L.grassTop - 14);
      const c = colors[Math.floor(rnd() * colors.length)];
      const s = rnd() > 0.6 ? 2 : 1.6;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x - s * 2), Math.round(y), Math.round(s), Math.round(s));
      ctx.fillRect(Math.round(x + s), Math.round(y), Math.round(s), Math.round(s));
      ctx.fillRect(Math.round(x), Math.round(y - s * 2), Math.round(s), Math.round(s));
      ctx.fillRect(Math.round(x), Math.round(y + s), Math.round(s), Math.round(s));
      ctx.fillStyle = '#e8a33d';
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(s), Math.round(s));
    }
  }

  function drawVignette(ctx, L) {
    const g = ctx.createRadialGradient(
      L.vw * 0.5, L.vh * 0.42, L.vh * 0.30,
      L.vw * 0.5, L.vh * 0.5, Math.max(L.vw, L.vh) * 0.80
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(28,15,7,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.vw, L.vh);
  }

  function makeCanvas(vw, vh) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(vw);
    cv.height = Math.round(vh);
    return cv;
  }

  // 生成画面：背景层 + 前景层
  function build(vw, vh) {
    const L = layout(vw, vh);
    const rnd = makeRandom(20261118);

    // ---- 背景层 ----
    const bg = makeCanvas(vw, vh);
    const bgc = bg.getContext('2d');
    drawWall(bgc, L, rnd);
    drawFloor(bgc, L, rnd);

    drawWheel(bgc, Math.round(vw * 0.185), Math.round(vh * 0.545), Math.round(vh * 0.155));
    drawBottle(bgc, Math.round(vw * 0.705), Math.round(vh * 0.63), Math.round(vh * 0.088));
    drawHideout(bgc, Math.round(vw * 0.795), Math.round(vh * 0.72), Math.round(vh * 0.25), Math.round(vh * 0.21));
    drawBowl(bgc, Math.round(vw * 0.085), Math.round(vh * 0.73));
    drawBall(bgc, Math.round(vw * 0.885), Math.round(vh * 0.715), Math.round(vh * 0.030), P.red, '#f4f1e6');
    drawBall(bgc, Math.round(vw * 0.945), Math.round(vh * 0.675), Math.round(vh * 0.024), P.yellow, P.blue);

    // ---- 前景层 ----
    const fg = makeCanvas(vw, vh);
    const fgc = fg.getContext('2d');
    drawFence(fgc, L, rnd);
    drawGrass(fgc, L, rnd);
    drawVignette(fgc, L);

    return { bg: bg, fg: fg, layout: L };
  }

  return { build: build, layout: layout };
})();
