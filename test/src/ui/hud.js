// HUD：数值条、瓜子与等级、动作按钮、探险面板、结算面板
// 所有坐标都在虚拟分辨率里，与场景共用一套坐标系。
window.HZ = window.HZ || {};

HZ.HUD = (function () {
  const C = HZ.CONFIG;
  const P = C.palette;

  let panel = null; // null | 'expedition' | 'result' | 'reset'

  function setPanel(name) { panel = name; }
  function getPanel() { return panel; }

  function font(ctx, size, bold) {
    ctx.font = (bold ? 'bold ' : '') + size + 'px "Microsoft YaHei", sans-serif';
  }

  // 像素风方框：直角 + 2px 描边 + 硬投影，替代圆角半透明面板
  function pixelBox(ctx, x, y, w, h, opts) {
    opts = opts || {};
    const fill = opts.fill || 'rgba(48,30,17,0.94)';
    const border = opts.border || 'rgba(232,196,138,0.80)';

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(x + 2, y + 2, w, h);

    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = border;
    ctx.fillRect(x, y, w, 2);
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x, y, 2, h);
    ctx.fillRect(x + w - 2, y, 2, h);
  }

  function panelBox(ctx, x, y, w, h) {
    pixelBox(ctx, x, y, w, h);
  }

  function layout(vw, vh) {
    const btnW = 62, btnH = 28, gap = 6;
    const visible = C.actions.filter(function (a) { return !a.hidden; });
    const count = visible.length + 1;
    const total = btnW * count + gap * (count - 1);
    const startX = Math.round((vw - total) / 2);
    const btnY = vh - btnH - 6;

    const buttons = visible.map(function (a, i) {
      return { kind: 'care', id: a.id, label: a.name, x: startX + i * (btnW + gap), y: btnY, w: btnW, h: btnH };
    });
    buttons.push({
      kind: 'panel', id: 'expedition', name: 'expedition', label: '探险',
      x: startX + (count - 1) * (btnW + gap), y: btnY, w: btnW, h: btnH
    });

    const dev = [
      { kind: 'save', label: '存档', x: 8, y: 78, w: 36, h: 14 },
      { kind: 'load', label: '读档', x: 48, y: 78, w: 36, h: 14 },
      { kind: 'panel', name: 'reset', label: '重置', x: 88, y: 78, w: 36, h: 14 }
    ];

    return {
      vw: vw, vh: vh,
      stats: { x: 8, y: 8, w: 168, h: 66 },
      right: { x: vw - 150, y: 8, w: 142, h: 54 },
      speed: { kind: 'speedToggle', x: Math.round(vw / 2) - 30, y: 8, w: 60, h: 16 },
      buttons: buttons,
      dev: dev,
      expTag: { x: Math.round(vw / 2) - 62, y: 30, w: 124, h: 20 }
    };
  }

  function modalRect(vw, vh) {
    let w, h;
    if (panel === 'expedition') { w = Math.min(360, vw - 40); h = 206; }
    else if (panel === 'result') { w = 300; h = 168; }
    else { w = 262; h = 122; }
    return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w: w, h: h };
  }

  function expeditionRows(vw, vh) {
    const m = modalRect(vw, vh);
    return C.expedition.map(function (e, i) {
      return {
        kind: 'dispatch', id: e.id,
        x: m.x + 14, y: m.y + 40 + i * 38, w: m.w - 28, h: 32
      };
    });
  }

  function resultButtons(vw, vh) {
    const m = modalRect(vw, vh);
    const w = 104, h = 26, gap = 12;
    const total = w * 2 + gap;
    const x = m.x + Math.round((m.w - total) / 2);
    const y = m.y + m.h - h - 12;
    return [
      { kind: 'adDouble', x: x, y: y, w: w, h: h, label: '看广告翻倍' },
      { kind: 'closePanel', x: x + w + gap, y: y, w: w, h: h, label: '收下' }
    ];
  }

  function resetButtons(vw, vh) {
    const m = modalRect(vw, vh);
    const w = 96, h = 26, gap = 14;
    const total = w * 2 + gap;
    const x = m.x + Math.round((m.w - total) / 2);
    const y = m.y + m.h - h - 12;
    return [
      { kind: 'closePanel', x: x, y: y, w: w, h: h, label: '取消' },
      { kind: 'doReset', x: x + w + gap, y: y, w: w, h: h, label: '确定重置' }
    ];
  }

  function closeRect(vw, vh) {
    const m = modalRect(vw, vh);
    return { x: m.x + m.w - 24, y: m.y + 6, w: 18, h: 18 };
  }

  function inRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // ---------------- 交互命中 ----------------
  function hit(x, y, state, now, vw, vh) {
    if (panel === 'expedition') {
      if (inRect(x, y, closeRect(vw, vh))) return { kind: 'closePanel' };
      const rows = expeditionRows(vw, vh);
      for (let i = 0; i < rows.length; i++) {
        if (inRect(x, y, rows[i])) return { kind: 'dispatch', id: rows[i].id };
      }
      if (!inRect(x, y, modalRect(vw, vh))) return { kind: 'closePanel' };
      return null;
    }

    if (panel === 'result') {
      const btns = resultButtons(vw, vh);
      for (let i = 0; i < btns.length; i++) {
        if (inRect(x, y, btns[i])) return { kind: btns[i].kind };
      }
      if (!inRect(x, y, modalRect(vw, vh))) return { kind: 'closePanel' };
      return null;
    }

    if (panel === 'reset') {
      const btns = resetButtons(vw, vh);
      for (let i = 0; i < btns.length; i++) {
        if (inRect(x, y, btns[i])) return { kind: btns[i].kind };
      }
      if (!inRect(x, y, modalRect(vw, vh))) return { kind: 'closePanel' };
      return null;
    }

    const L = layout(vw, vh);
    for (let i = 0; i < L.buttons.length; i++) {
      const b = L.buttons[i];
      if (inRect(x, y, b)) {
        return b.kind === 'care' ? { kind: 'care', id: b.id } : { kind: 'panel', name: 'expedition' };
      }
    }

    if (HZ.DEV) {
      if (inRect(x, y, L.speed)) return { kind: 'speedToggle' };
      for (let i = 0; i < L.dev.length; i++) {
        const d = L.dev[i];
        if (inRect(x, y, d)) return d.kind === 'panel' ? { kind: 'panel', name: d.name } : { kind: d.kind };
      }
    }

    // 点鼠鼠：抚摸
    return null;
  }

  // ---------------- 绘制 ----------------
  function drawStats(ctx, state, L, now) {
    const s = L.stats;
    panelBox(ctx, s.x, s.y, s.w, s.h);

    C.stats.forEach(function (def, i) {
      const rowY = s.y + 8 + i * 15;
      const v = state.stats[def.id];
      const low = v < 25;
      const pulse = 0.45 + 0.35 * Math.sin(now / 260);

      font(ctx, 9, false);
      ctx.fillStyle = low ? '#ffb3a7' : P.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.name, s.x + 8, rowY + 4);

      const bx = s.x + 40, bw = s.w - 50, bh = 7;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(bx, rowY, bw, bh);
      ctx.fillStyle = def.color;
      ctx.globalAlpha = low ? pulse + 0.35 : 1;
      ctx.fillRect(bx, rowY, Math.round(bw * v / def.max), bh);
      ctx.globalAlpha = 1;

      font(ctx, 8, true);
      ctx.fillStyle = P.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(v), s.x + s.w - 6, rowY + 4);
    });
  }

  function drawRight(ctx, state, L) {
    const r = L.right;
    panelBox(ctx, r.x, r.y, r.w, r.h);

    // 瓜子
    ctx.fillStyle = P.yellow;
    ctx.beginPath();
    ctx.ellipse(r.x + 14, r.y + 15, 6, 4.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    font(ctx, 11, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(state.seeds)), r.x + 24, r.y + 15);

    font(ctx, 9, false);
    ctx.fillStyle = P.textDim;
    ctx.textAlign = 'right';
    ctx.fillText('瓜子', r.x + r.w - 8, r.y + 15);

    // 等级 + 称号
    font(ctx, 9, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'left';
    ctx.fillText('Lv.' + state.level + ' ' + HZ.State.title(state), r.x + 8, r.y + 32);

    // 经验条
    const need = HZ.State.expNeeded(state.level);
    const bw = r.w - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(r.x + 8, r.y + 41, bw, 5);
    ctx.fillStyle = '#9ad6a0';
    ctx.fillRect(r.x + 8, r.y + 41, Math.round(bw * Math.min(1, state.exp / need)), 5);
  }

  function buttonBase(ctx, b, ready, lowPulse) {
    pixelBox(ctx, b.x, b.y, b.w, b.h, {
      fill: ready ? 'rgba(64,42,24,0.96)' : 'rgba(36,23,13,0.94)',
      border: ready ? 'rgba(240,206,152,0.90)' : 'rgba(138,108,78,0.55)'
    });

    // 顶部高光：像素按钮的斜面感
    ctx.fillStyle = ready ? 'rgba(255,236,200,0.16)' : 'rgba(255,236,200,0.05)';
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 2);

    if (lowPulse) {
      ctx.fillStyle = 'rgba(255,168,116,' + lowPulse.toFixed(2) + ')';
      ctx.fillRect(b.x, b.y, b.w, 2);
      ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
      ctx.fillRect(b.x, b.y, 2, b.h);
      ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);
    }
  }

  function drawButtons(ctx, state, L, now) {
    L.buttons.forEach(function (b) {
      if (b.kind === 'panel') {
        const exp = state.expedition;
        let label = '探险';
        let ready = !exp;
        if (exp) {
          const left = Math.max(0, exp.endsAt - now);
          label = fmtTime(left);
        }
        buttonBase(ctx, b, ready, 0);
        font(ctx, 11, true);
        ctx.fillStyle = exp ? P.yellow : P.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
        return;
      }

      const def = C.actions.find(function (a) { return a.id === b.id; });
      const wait = HZ.State.actionReadyIn(state, def.id, now);
      const used = state.daily.counts[def.id] || 0;
      const outOfDaily = used >= def.dailyLimit;
      const ready = wait <= 0 && !outOfDaily;
      const low = state.stats[def.stat] < 25;
      const pulse = low ? 0.35 + 0.4 * Math.sin(now / 240) : 0;

      buttonBase(ctx, b, ready, pulse);

      font(ctx, 11, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ready ? P.text : 'rgba(247,233,207,0.42)';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - (ready ? 0 : 4));

      if (!ready) {
        font(ctx, 8, false);
        ctx.fillStyle = 'rgba(247,233,207,0.55)';
        ctx.fillText(outOfDaily ? '今日已用完' : fmtTime(wait), b.x + b.w / 2, b.y + b.h / 2 + 8);
      }
    });
  }

  function fmtTime(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function drawExpTag(ctx, state, L, now) {
    if (!state.expedition) return;
    const t = L.expTag;
    pixelBox(ctx, t.x, t.y, t.w, t.h, {
      fill: 'rgba(48,30,17,0.92)',
      border: 'rgba(242,193,78,0.65)'
    });
    font(ctx, 9, true);
    ctx.fillStyle = P.yellow;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('探险中 ' + fmtTime(Math.max(0, state.expedition.endsAt - now)), t.x + t.w / 2, t.y + t.h / 2);
  }

  function drawSpeed(ctx, L, speedMul) {
    if (!HZ.DEV) return;
    const b = L.speed;
    pixelBox(ctx, b.x, b.y, b.w, b.h, {
      fill: speedMul > 1 ? 'rgba(150,52,44,0.92)' : 'rgba(48,30,17,0.80)',
      border: speedMul > 1 ? 'rgba(255,170,150,0.85)' : 'rgba(232,196,138,0.45)'
    });
    font(ctx, 9, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(speedMul > 1 ? '加速 ×' + speedMul : '正常速度', b.x + b.w / 2, b.y + b.h / 2);
  }

  function drawDev(ctx, L) {
    if (!HZ.DEV) return;
    L.dev.forEach(function (d) {
      pixelBox(ctx, d.x, d.y, d.w, d.h, {
        fill: 'rgba(40,26,15,0.70)',
        border: 'rgba(200,170,130,0.40)'
      });
      font(ctx, 8, false);
      ctx.fillStyle = 'rgba(247,233,207,0.62)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.label, d.x + d.w / 2, d.y + d.h / 2);
    });
  }

  function drawModal(ctx, state, L, now) {
    if (!panel) return;
    ctx.fillStyle = 'rgba(16,10,6,0.58)';
    ctx.fillRect(0, 0, L.vw, L.vh);

    const m = modalRect(L.vw, L.vh);
    pixelBox(ctx, m.x, m.y, m.w, m.h, {
      fill: 'rgba(54,35,21,0.98)',
      border: 'rgba(240,206,152,0.80)'
    });

    if (panel === 'expedition') drawExpeditionPanel(ctx, state, L, m, now);
    else if (panel === 'result') drawResultPanel(ctx, state, L, m, now);
    else if (panel === 'reset') drawResetPanel(ctx, L, m);
  }

  function drawExpeditionPanel(ctx, state, L, m, now) {
    font(ctx, 13, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('派遣探险', m.x + 14, m.y + 18);

    font(ctx, 9, false);
    ctx.fillStyle = P.textDim;
    ctx.textAlign = 'right';
    ctx.fillText('状态分 ' + Math.round(HZ.State.statusScore(state)), m.x + m.w - 32, m.y + 18);

    // 关闭按钮
    const c = closeRect(L.vw, L.vh);
    pixelBox(ctx, c.x, c.y, c.w, c.h, {
      fill: 'rgba(255,236,200,0.10)',
      border: 'rgba(255,236,200,0.30)'
    });
    font(ctx, 11, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.fillText('×', c.x + c.w / 2, c.y + c.h / 2 + 1);

    const score = HZ.State.statusScore(state);
    const rows = expeditionRows(L.vw, L.vh);
    C.expedition.forEach(function (def, i) {
      const r = rows[i];
      const locked = state.level < def.unlockLevel;
      const isLong = def.durationSec >= C.expeditionRules.longDurationSec;
      const scoreBlocked = isLong && score < C.expeditionRules.minScoreForLong;
      const disabled = locked || scoreBlocked || !!state.expedition;

      pixelBox(ctx, r.x, r.y, r.w, r.h, {
        fill: disabled ? 'rgba(0,0,0,0.28)' : 'rgba(255,236,200,0.08)',
        border: disabled ? 'rgba(255,236,200,0.06)' : 'rgba(255,236,200,0.20)'
      });

      font(ctx, 10, true);
      ctx.fillStyle = disabled ? 'rgba(247,233,207,0.40)' : P.text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.name, r.x + 12, r.y + r.h / 2);

      font(ctx, 9, false);
      ctx.textAlign = 'right';
      if (locked) {
        ctx.fillStyle = 'rgba(247,233,207,0.38)';
        ctx.fillText('Lv' + def.unlockLevel + ' 解锁', r.x + r.w - 12, r.y + r.h / 2);
      } else if (scoreBlocked) {
        ctx.fillStyle = '#ffb3a7';
        ctx.fillText('状态分不足', r.x + r.w - 12, r.y + r.h / 2);
      } else {
        const est = Math.round(def.seedBase * tierMulEx(score));
        ctx.fillStyle = P.yellow;
        ctx.fillText('约 ' + est + ' 瓜子', r.x + r.w - 12, r.y + r.h / 2);
      }
    });
  }

  function tierMulEx(score) {
    const t = C.expeditionRules.scoreTiers.find(function (x) { return score >= x.min; });
    return t ? t.mul : 0.6;
  }

  function drawResultPanel(ctx, state, L, m, now) {
    const r = state.lastResult || { seeds: 0, material: false, empty: false, doubled: false };

    font(ctx, 13, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('探险回来啦', m.x + m.w / 2, m.y + 22);

    font(ctx, 10, false);
    ctx.textAlign = 'center';
    if (r.empty) {
      ctx.fillStyle = '#ffb3a7';
      ctx.fillText('空手而归，一身泥', m.x + m.w / 2, m.y + 52);
      ctx.fillStyle = P.textDim;
      ctx.fillText('清洁 -30，洗个澡就好', m.x + m.w / 2, m.y + 70);
    } else {
      ctx.fillStyle = P.yellow;
      font(ctx, 18, true);
      ctx.fillText('+' + r.seeds + ' 瓜子', m.x + m.w / 2, m.y + 56);
      font(ctx, 9, false);
      ctx.fillStyle = P.textDim;
      const extra = [];
      if (r.material) extra.push('带回 1 个材料');
      if (r.doubled) extra.push('已翻倍');
      ctx.fillText(extra.length ? extra.join('　') : '鼠鼠玩得很开心', m.x + m.w / 2, m.y + 82);
    }

    const btns = resultButtons(L.vw, L.vh);
    btns.forEach(function (b) {
      const disabled = b.kind === 'adDouble' && (r.doubled || r.empty || !HZ.State.canWatchAd(state, now));
      pixelBox(ctx, b.x, b.y, b.w, b.h, {
        fill: disabled ? 'rgba(0,0,0,0.30)' : (b.kind === 'adDouble' ? 'rgba(178,62,52,0.92)' : 'rgba(255,236,200,0.14)'),
        border: 'rgba(255,236,200,0.28)'
      });
      font(ctx, 10, true);
      ctx.fillStyle = disabled ? 'rgba(247,233,207,0.35)' : P.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  }

  function drawResetPanel(ctx, L, m) {
    font(ctx, 12, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('确定重置存档？', m.x + m.w / 2, m.y + 34);

    font(ctx, 9, false);
    ctx.fillStyle = P.textDim;
    ctx.fillText('等级、瓜子、数值全部清空', m.x + m.w / 2, m.y + 54);

    const btns = resetButtons(L.vw, L.vh);
    btns.forEach(function (b) {
      pixelBox(ctx, b.x, b.y, b.w, b.h, {
        fill: b.kind === 'doReset' ? 'rgba(178,62,52,0.92)' : 'rgba(255,236,200,0.14)',
        border: 'rgba(255,236,200,0.28)'
      });
      font(ctx, 10, true);
      ctx.fillStyle = P.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    });
  }

  function draw(ctx, state, L, now, speedMul) {
    drawStats(ctx, state, L, now);
    drawRight(ctx, state, L);
    drawExpTag(ctx, state, L, now);
    drawButtons(ctx, state, L, now);
    drawSpeed(ctx, L, speedMul);
    drawDev(ctx, L);
    drawModal(ctx, state, L, now);
  }

  return {
    layout: layout,
    hit: hit,
    draw: draw,
    setPanel: setPanel,
    getPanel: getPanel
  };
})();
