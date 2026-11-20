// 家具视图层：占位绘制、摆放合法性（边界 + AABB 碰撞）、幽灵件
// 只读 state/CONFIG，不写存档；碰撞框与 scene.js 现有物件共用同一套坐标。
window.HZ = window.HZ || {};

HZ.Furniture = (function () {
  const VW = 640;
  const OUTLINE = '#5A3A24';   // 占位家具统一深色描边

  function all() {
    return HZ.CONFIG.economy.furniture;
  }

  function def(itemId) {
    return all().find(function (f) { return f.id === itemId; }) || null;
  }

  // x/y 为脚底中心锚点
  function boxOf(d, x, y) {
    return { x: x - d.w / 2, y: y - d.h, w: d.w, h: d.h };
  }

  function intersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // 摆放合法性：出界、压到固定物件、压到已摆家具、容量超限都判非法
  function validate(state, itemId, x, y, opts) {
    opts = opts || {};
    const d = def(itemId);
    if (!d) return { ok: false, reason: '未知家具' };

    const box = boxOf(d, x, y);
    if (box.x < 8 || box.x + box.w > VW - 8) return { ok: false, reason: '这里放不下' };

    if (d.wall) {
      // 贴墙件：底边挂在木墙上（wallBottom = 100 以上）
      if (y < 48 || y > 100 || y - d.h < 8) return { ok: false, reason: '这里放不下' };
    } else {
      // 地面件：落在木屑地面上，底边不超过前景栅栏顶端（260），避免小件被栅栏挡住
      if (y < 198 || y > 258 || y - d.h < 104) return { ok: false, reason: '这里放不下' };
    }

    const fixed = HZ.Scene.objects();
    for (let i = 0; i < fixed.length; i++) {
      if (intersect(box, fixed[i])) return { ok: false, reason: '和别的东西挤到了' };
    }

    const room = state.room || {};
    const placedList = Array.isArray(room.placed) ? room.placed : [];
    for (let i = 0; i < placedList.length; i++) {
      const p = placedList[i];
      if (!p || typeof p !== 'object') continue;
      if (opts.ignoreUid && p.uid === opts.ignoreUid) continue;
      const pd = def(p.itemId);
      if (!pd) continue;
      if (intersect(box, boxOf(pd, p.x, p.y))) return { ok: false, reason: '和别的东西挤到了' };
    }

    if (opts.checkCapacity === true && placedList.length >= (HZ.CONFIG.economy.roomCap || 12)) {
      return { ok: false, reason: '房间放不下了' };
    }

    return { ok: true };
  }

  // 命中已摆放家具：从前到后（y 大在前）
  function hitPlaced(state, x, y) {
    const room = state.room;
    if (!room || !Array.isArray(room.placed)) return null;
    const sorted = room.placed.filter(function (p) {
      return p && typeof p === 'object' && typeof p.y === 'number';
    }).sort(function (a, b) { return b.y - a.y; });
    const pad = 3; // 触摸/指针取整误差容忍
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      if (!p || typeof p !== 'object') continue;
      const d = def(p.itemId);
      if (!d) continue;
      const b = boxOf(d, p.x, p.y);
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return p;
    }
    return null;
  }

  // ---------------- 占位绘制 ----------------

  function strokeBox(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
    ctx.closePath();
  }

  const DRAWERS = {
    f_201: function (ctx, d, x, y) {
      const w = d.w, h = d.h, bx = x - w / 2, by = y - h;
      roundRectPath(ctx, bx, by, w, h, 7);
      ctx.fillStyle = d.draw.fill;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = d.draw.light;
      ctx.fillRect(bx + 7, by + 4, w - 14, 4);
      ctx.fillStyle = 'rgba(90,58,36,0.35)';
      ctx.fillRect(bx + 8, by + h - 6, w - 16, 2);
    },
    f_202: function (ctx, d, x, y) {
      const potH = 18;
      const potTop = y - potH;
      // 花盆
      ctx.beginPath();
      ctx.moveTo(x - 12, potTop);
      ctx.lineTo(x + 12, potTop);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
      ctx.fillStyle = d.draw.pot;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 盆沿
      strokeBox(ctx, x - 13, potTop - 5, 26, 6, d.draw.pot);
      // 叶片
      ctx.fillStyle = d.draw.leaf;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x - 7, potTop - 15, 7, 11, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + 6, potTop - 19, 7, 12, 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = d.draw.leafLight;
      ctx.beginPath();
      ctx.ellipse(x, potTop - 28, 6, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
    f_203: function (ctx, d, x, y) {
      const w = d.w, h = d.h, bx = x - w / 2, by = y - h;
      strokeBox(ctx, bx, by, w, h, d.draw.frame);
      ctx.fillStyle = d.draw.paper;
      ctx.fillRect(bx + 6, by + 6, w - 12, h - 12);
      ctx.strokeStyle = d.draw.frameLight;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 5.5, by + 5.5, w - 11, h - 11);
      // 小风景：太阳 + 山丘
      ctx.fillStyle = d.draw.motif;
      ctx.beginPath();
      ctx.arc(bx + w - 16, by + 15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9cbb6a';
      ctx.beginPath();
      ctx.moveTo(bx + 8, by + h - 8);
      ctx.lineTo(bx + w * 0.42, by + 17);
      ctx.lineTo(bx + w * 0.62, by + h - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6fae4e';
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.40, by + h - 8);
      ctx.lineTo(bx + w * 0.66, by + 24);
      ctx.lineTo(bx + w - 8, by + h - 8);
      ctx.closePath();
      ctx.fill();
    },
    f_204: function (ctx, d, x, y) {
      const w = d.w, h = d.h, bx = x - w / 2, by = y - h;
      ctx.fillStyle = d.draw.a;
      ctx.fillRect(bx, by, w, h);
      const stripe = 9;
      ctx.fillStyle = d.draw.b;
      for (let sx = bx + stripe; sx < bx + w - 2; sx += stripe * 2) {
        ctx.fillRect(sx, by, Math.min(stripe, bx + w - sx), h - 5);
      }
      // 流苏
      ctx.fillStyle = d.draw.b;
      for (let fx = bx + 3; fx < bx + w - 2; fx += 6) {
        ctx.fillRect(fx, by + h - 4, 2, 4);
      }
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, w - 2, h - 2);
    },
    f_205: function (ctx, d, x, y) {
      const w = d.w, h = d.h, bx = x - w / 2, by = y - h;
      const rail = 6;
      // 两竖
      strokeBox(ctx, bx, by, rail, h, d.draw.fill);
      strokeBox(ctx, bx + w - rail, by, rail, h, d.draw.fill);
      // 三横
      for (let i = 0; i < 3; i++) {
        const ry = by + 10 + i * Math.round((h - 20) / 2);
        strokeBox(ctx, bx + rail - 1, ry, w - rail * 2 + 2, 6, d.draw.fill);
      }
    },
    f_206: function (ctx, d, x, y) {
      const w = d.w, h = d.h, bx = x - w / 2, by = y - h;
      // 顶梁
      strokeBox(ctx, bx, by, w, 7, d.draw.beam);
      // 两根绳
      ctx.fillStyle = d.draw.rope;
      const boardW = Math.round(w * 0.72);
      const boardX = x - boardW / 2;
      const boardY = y - 12;
      ctx.fillRect(bx + 8, by + 7, 2, boardY - by - 7);
      ctx.fillRect(bx + w - 10, by + 7, 2, boardY - by - 7);
      // 坐板
      roundRectPath(ctx, boardX, boardY, boardW, 9, 3);
      ctx.fillStyle = d.draw.board;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 绳结
      ctx.fillStyle = d.draw.beam;
      ctx.fillRect(bx + 6, by + 5, 6, 4);
      ctx.fillRect(bx + w - 12, by + 5, 6, 4);
    },
    f_207: function (ctx, d, x, y) {
      const w = d.w, h = d.h;
      // 草窝
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.45, w / 2, h * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = d.draw.straw;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
      // 内圈
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.5, w * 0.30, h * 0.30, 0, 0, Math.PI * 2);
      ctx.fillStyle = d.draw.strawDark;
      ctx.fill();
      // 草编纹
      ctx.strokeStyle = 'rgba(90,58,36,0.40)';
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        const sx = x + i * (w / 8);
        ctx.beginPath();
        ctx.moveTo(sx, y - h * 0.86);
        ctx.lineTo(sx + 4, y - h * 0.10);
        ctx.stroke();
      }
      // 小球
      ctx.beginPath();
      ctx.arc(x + w * 0.22, y - h * 0.62, 6, 0, Math.PI * 2);
      ctx.fillStyle = d.draw.ball;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    f_208: function (ctx, d, x, y) {
      const w = d.w, h = d.h, bx = x - w / 2, by = y - h;
      strokeBox(ctx, bx, by, w, h, d.draw.fill);
      const pad = 5;
      const innerW = w - pad * 2;
      const rows = 3;
      const rowH = Math.floor((h - pad * 2 - (rows - 1) * 3) / rows);
      for (let r = 0; r < rows; r++) {
        const ry = by + pad + r * (rowH + 3);
        ctx.fillStyle = 'rgba(42,28,18,0.45)';
        ctx.fillRect(bx + pad, ry, innerW, rowH);
        // 书脊
        const colors = [d.draw.bookA, d.draw.bookB, d.draw.bookC];
        const count = 3;
        const bw = Math.floor((innerW - 4) / count);
        for (let i = 0; i < count; i++) {
          ctx.fillStyle = colors[(i + r) % colors.length];
          const bh = rowH - 4 - (i % 2) * 2;
          ctx.fillRect(bx + pad + 2 + i * bw, ry + rowH - 2 - bh, bw - 2, bh);
        }
      }
      ctx.strokeStyle = d.draw.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = d.draw.grid;
      for (let r = 1; r < rows; r++) {
        const ry = by + pad + r * (rowH + 3) - 3;
        ctx.fillRect(bx + 2, ry, w - 4, 2);
      }
    }
  };

  function drawItem(ctx, itemId, x, y) {
    const d = def(itemId);
    if (!d) return;
    const fn = DRAWERS[itemId];
    if (fn) {
      fn(ctx, d, x, y);
    } else {
      // 兜底：色块
      strokeBox(ctx, x - d.w / 2, y - d.h, d.w, d.h, '#c9a36b');
    }
  }

  // 场景内正式绘制（含接触阴影）
  function draw(ctx, itemId, x, y, opts) {
    const d = def(itemId);
    if (!d) return;
    if (!d.wall && !(opts && opts.shadow === false)) {
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = '#4a2d15';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, d.w * 0.42, Math.max(3, d.h * 0.10), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawItem(ctx, itemId, x, y);
  }

  // 商店列表缩略图：把原生尺寸缩放塞进 maxW×maxH
  function drawPreview(ctx, itemId, cx, cy, maxW, maxH) {
    const d = def(itemId);
    if (!d) return;
    const s = Math.min(maxW / d.w, maxH / d.h, 1.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    // 锚点从底部中心换算到预览框中心
    drawItem(ctx, itemId, 0, d.h / 2);
    ctx.restore();
  }

  // 拖拽幽灵件：半透明本体 + 绿/红合法性提示
  function drawGhost(ctx, itemId, x, y, valid) {
    const d = def(itemId);
    if (!d) return;
    const box = boxOf(d, x, y);

    ctx.save();
    ctx.globalAlpha = 0.62;
    drawItem(ctx, itemId, x, y);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = valid ? 'rgba(110,220,130,0.18)' : 'rgba(230,90,80,0.22)';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = valid ? '#7ee787' : '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    // 落地点横线
    ctx.fillStyle = valid ? '#7ee787' : '#ff6b6b';
    ctx.fillRect(box.x - 3, y - 1, box.w + 6, 2);
    ctx.restore();
  }

  return {
    all: all,
    def: def,
    boxOf: boxOf,
    validate: validate,
    hitPlaced: hitPlaced,
    draw: draw,
    drawPreview: drawPreview,
    drawGhost: drawGhost
  };
})();
