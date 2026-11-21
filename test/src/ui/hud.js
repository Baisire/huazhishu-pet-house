// HUD：数值条、瓜子与等级、动作按钮、探险面板、结算面板
// 所有坐标都在虚拟分辨率里，与场景共用一套坐标系。
window.HZ = window.HZ || {};

HZ.HUD = (function () {
  const C = HZ.CONFIG;
  const P = C.palette;

  let panel = null; // null | 'expedition' | 'result' | 'reset' | 'shop'
  let panelAt = 0;  // 面板打开时间，用于商店底部上滑动画
  let expTab = 'dispatch'; // 探险面板页签：'dispatch' | 'photos'

  function setPanel(name) {
    if (panel !== name) {
      panel = name;
      panelAt = Date.now();
    }
  }
  function getPanel() { return panel; }

  function setExpTab(tab) {
    if (tab === 'dispatch' || tab === 'photos') expTab = tab;
  }
  function getExpTab() { return expTab; }

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
    // 5 个照料 + 商店 + 探险 = 7 个按钮，按钮宽度相应收窄
    const btnW = 54, btnH = 28, gap = 5;
    const visible = C.actions.filter(function (a) { return !a.hidden; });
    const count = visible.length + 2;
    const total = btnW * count + gap * (count - 1);
    const startX = Math.round((vw - total) / 2);
    const btnY = vh - btnH - 6;

    const buttons = visible.map(function (a, i) {
      return { kind: 'care', id: a.id, label: a.name, x: startX + i * (btnW + gap), y: btnY, w: btnW, h: btnH };
    });
    buttons.push({
      kind: 'panel', id: 'shop', name: 'shop', label: '商店',
      x: startX + (count - 2) * (btnW + gap), y: btnY, w: btnW, h: btnH
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
    if (panel === 'shop') {
      // 商店：贴底横条，从底部上滑
      w = vw - 16;
      h = 196;
      return { x: 8, y: vh - h, w: w, h: h };
    }
    if (panel === 'expedition') { w = Math.min(520, vw - 24); h = 246; }
    else if (panel === 'result') { w = 320; h = 186; }
    else { w = 262; h = 122; }
    return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w: w, h: h };
  }

  // 商店底部上滑偏移：绘制与命中都用它，避免动画期间点到下一行
  function shopSlideOffset(m) {
    const t = Math.min(1, (Date.now() - panelAt) / 220);
    const ease = 1 - Math.pow(1 - t, 3);
    return Math.round((1 - ease) * m.h);
  }

  // 商店条目网格（4 列 × 2 行，正好容纳首批 8 件）；yOff 用于入场动画
  function shopItems(vw, vh, yOff) {
    const m = modalRect(vw, vh);
    const list = C.economy.furniture;
    const padX = 12, top = m.y + 30, gap = 8, cols = 4;
    const cardW = Math.floor((m.w - padX * 2 - gap * (cols - 1)) / cols);
    const cardH = 64;
    const off = yOff || 0;
    return list.map(function (def, i) {
      return {
        id: def.id,
        x: m.x + padX + (i % cols) * (cardW + gap),
        y: top + Math.floor(i / cols) * (cardH + 6) + off,
        w: cardW,
        h: cardH
      };
    });
  }

  // 探险面板布局：两槽卡片 + 派遣/图鉴页签。绘制与命中共用，避免错位。
  function expeditionLayout(vw, vh) {
    const m = modalRect(vw, vh);
    const tabW = 62, tabH = 18, tabGap = 6;
    const tabs = [
      { kind: 'expTab', tab: 'dispatch', label: '派遣', x: m.x + 14, y: m.y + 30, w: tabW, h: tabH },
      { kind: 'expTab', tab: 'photos', label: '图鉴', x: m.x + 14 + tabW + tabGap, y: m.y + 30, w: tabW, h: tabH }
    ];

    const padX = 12, cardGap = 10;
    const cardW = Math.floor((m.w - padX * 2 - cardGap) / 2);
    const cardH = m.h - 52 - 24;
    const cards = (C.expeditionSlots || []).map(function (sd, i) {
      const cx = m.x + padX + i * (cardW + cardGap);
      const cy = m.y + 52;
      const tiers = C.expedition.filter(function (e) {
        return Array.isArray(e.slots) && e.slots.indexOf(sd.id) >= 0;
      }).map(function (e, j) {
        return {
          kind: 'dispatch', slot: sd.id, id: e.id,
          x: cx + 8, y: cy + 40 + j * 26, w: cardW - 16, h: 22
        };
      });
      return {
        slot: sd, index: i,
        x: cx, y: cy, w: cardW, h: cardH,
        tiers: tiers,
        claim: { kind: 'claim', slot: sd.id, x: cx + 10, y: cy + cardH - 32, w: cardW - 20, h: 24 }
      };
    });

    // 图鉴：4 列 × 3 行，正好 12 张
    const pool = (C.photos && C.photos.pool) || [];
    const cols = 4, gx = 6, gy = 6;
    const gridX = m.x + 12, gridY = m.y + 52;
    const cellW = Math.floor((m.w - 24 - gx * (cols - 1)) / cols);
    const cellH = 46;
    const cells = pool.map(function (p, i) {
      return {
        id: p.id,
        x: gridX + (i % cols) * (cellW + gx),
        y: gridY + Math.floor(i / cols) * (cellH + gy),
        w: cellW, h: cellH
      };
    });

    return {
      m: m,
      close: { x: m.x + m.w - 24, y: m.y + 6, w: 18, h: 18 },
      tabs: tabs,
      cards: cards,
      cells: cells
    };
  }

  function slotsOf(state) {
    const exp = state.expedition;
    return (exp && Array.isArray(exp.slots)) ? exp.slots : [null, null];
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

  function inRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // ---------------- 交互命中 ----------------
  function hit(x, y, state, now, vw, vh) {
    if (panel === 'shop') {
      const m = modalRect(vw, vh);
      const yOff = shopSlideOffset(m);
      const close = { x: m.x + m.w - 24, y: m.y + yOff + 6, w: 18, h: 18 };
      if (inRect(x, y, close)) return { kind: 'closePanel' };
      const items = shopItems(vw, vh, yOff);
      for (let i = 0; i < items.length; i++) {
        if (inRect(x, y, items[i])) return { kind: 'shopItem', id: items[i].id };
      }
      const sheet = { x: m.x, y: m.y + yOff, w: m.w, h: m.h };
      if (!inRect(x, y, sheet)) return { kind: 'closePanel' };
      return null;
    }

    if (panel === 'expedition') {
      const L2 = expeditionLayout(vw, vh);
      if (inRect(x, y, L2.close)) return { kind: 'closePanel' };
      for (let i = 0; i < L2.tabs.length; i++) {
        if (inRect(x, y, L2.tabs[i])) return { kind: 'expTab', tab: L2.tabs[i].tab };
      }

      if (expTab === 'photos') {
        if (!inRect(x, y, L2.m)) return { kind: 'closePanel' };
        return null;
      }

      const slots = slotsOf(state);
      for (let i = 0; i < L2.cards.length; i++) {
        const card = L2.cards[i];
        if (!inRect(x, y, card)) continue;
        const st = slots[card.index];
        const unlocked = state.level >= card.slot.unlockLevel;
        if (st) {
          // 已完成显示领取；倒计时中点击无效
          if (now >= st.endsAt && inRect(x, y, card.claim)) return { kind: 'claim', slot: card.slot.id };
          return null;
        }
        if (!unlocked) return { kind: 'lockedSlot', slot: card.slot.id };
        for (let j = 0; j < card.tiers.length; j++) {
          if (inRect(x, y, card.tiers[j])) {
            return { kind: 'dispatch', slot: card.tiers[j].slot, id: card.tiers[j].id };
          }
        }
        return null;
      }
      if (!inRect(x, y, L2.m)) return { kind: 'closePanel' };
      return null;
    }

    if (panel === 'result') {
      const r = state.lastResult || {};
      const btns = resultButtons(vw, vh);
      for (let i = 0; i < btns.length; i++) {
        if (!inRect(x, y, btns[i])) continue;
        // 禁用态不返回意图：空手/已翻倍/没有基础收益时点它不能白耗广告次数
        if (btns[i].kind === 'adDouble' && (r.empty || r.doubled || r.seeds <= 0)) return null;
        return { kind: btns[i].kind };
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
        return b.kind === 'care' ? { kind: 'care', id: b.id } : { kind: 'panel', name: b.name };
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
        if (b.name === 'shop') {
          // 商店随时可用（探险倒计时中也能布置房间）
          buttonBase(ctx, b, true, 0);
          font(ctx, 11, true);
          ctx.fillStyle = P.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('商店', b.x + b.w / 2, b.y + b.h / 2);
          return;
        }
        // 探险入口：Lv1 置灰；有已完成槽位显示「领取」；倒计时显示最早结束的那槽
        const slots = slotsOf(state);
        const shortUnlock = (C.expeditionSlots[0] || { unlockLevel: 2 }).unlockLevel;
        const unlocked = state.level >= shortUnlock;
        let running = 0;
        let soonest = Infinity;
        let done = false;
        slots.forEach(function (s) {
          if (!s) return;
          if (now >= s.endsAt) done = true;
          else {
            running += 1;
            soonest = Math.min(soonest, s.endsAt - now);
          }
        });

        let label = '探险';
        // 旧档遗留的低等级在途订单：仍允许进面板领取，避免奖励卡死
        let ready = unlocked || running > 0 || done;
        let color = P.text;
        let pulse = 0;
        if (!unlocked && !done && running === 0) {
          label = 'Lv' + shortUnlock + ' 解锁';
          color = 'rgba(247,233,207,0.40)';
        } else if (done) {
          label = '领取';
          color = P.yellow;
          pulse = 0.35 + 0.4 * Math.sin(now / 240);
        } else if (running > 0) {
          label = fmtClock(soonest) + (running > 1 ? ' +1' : '');
          color = P.yellow;
        }

        buttonBase(ctx, b, ready, pulse);
        font(ctx, unlocked && running > 0 ? 9 : 11, true);
        ctx.fillStyle = color;
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

  // 超过 1 小时显示 h:mm:ss，8 小时档也能读
  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function drawExpTag(ctx, state, L, now) {
    const slots = slotsOf(state);
    let running = 0;
    let soonest = Infinity;
    let done = false;
    slots.forEach(function (s) {
      if (!s) return;
      if (now >= s.endsAt) done = true;
      else {
        running += 1;
        soonest = Math.min(soonest, s.endsAt - now);
      }
    });
    if (!running && !done) return;

    const t = L.expTag;
    pixelBox(ctx, t.x, t.y, t.w, t.h, {
      fill: 'rgba(48,30,17,0.92)',
      border: 'rgba(242,193,78,0.65)'
    });
    font(ctx, 9, true);
    ctx.fillStyle = P.yellow;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = done
      ? '探险归来 · 待领取'
      : '探险中 ' + fmtClock(soonest) + (running > 1 ? ' +1' : '');
    ctx.fillText(label, t.x + t.w / 2, t.y + t.h / 2);
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
    if (panel === 'shop') { drawShopPanel(ctx, state, L); return; }

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

  // ---- 商店面板（底部上滑） ----
  function drawSeedIcon(ctx, x, y, dim) {
    ctx.save();
    ctx.fillStyle = dim ? 'rgba(242,193,78,0.40)' : P.yellow;
    ctx.beginPath();
    ctx.ellipse(x, y, 4.2, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShopPanel(ctx, state, L) {
    ctx.fillStyle = 'rgba(16,10,6,0.42)';
    ctx.fillRect(0, 0, L.vw, L.vh);

    const m = modalRect(L.vw, L.vh);
    const yOff = shopSlideOffset(m);

    pixelBox(ctx, m.x, m.y + yOff, m.w, m.h, {
      fill: 'rgba(54,35,21,0.98)',
      border: 'rgba(240,206,152,0.80)'
    });

    // 标题与余额
    font(ctx, 13, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('商店', m.x + 14, m.y + yOff + 16);

    drawSeedIcon(ctx, m.x + m.w - 78, m.y + yOff + 16, false);
    font(ctx, 10, true);
    ctx.fillStyle = P.yellow;
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(state.seeds)), m.x + m.w - 34, m.y + yOff + 16);

    // 关闭
    const c = { x: m.x + m.w - 24, y: m.y + yOff + 6, w: 18, h: 18 };
    pixelBox(ctx, c.x, c.y, c.w, c.h, {
      fill: 'rgba(255,236,200,0.10)',
      border: 'rgba(255,236,200,0.30)'
    });
    font(ctx, 11, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.fillText('×', c.x + c.w / 2, c.y + c.h / 2 + 1);

    // 条目
    const room = state.room || { inventory: [], placedEver: [] };
    const items = shopItems(L.vw, L.vh, yOff);
    items.forEach(function (cell, i) {
      drawShopCard(ctx, state, room, C.economy.furniture[i], cell);
    });

    // 底部提示
    font(ctx, 8, false);
    ctx.fillStyle = P.textDim;
    ctx.textAlign = 'center';
    ctx.fillText('轻点购买 · 按住拖到房间摆放 · 拖到「收回」区可放回库存',
      m.x + m.w / 2, m.y + yOff + m.h - 11);
  }

  function drawShopCard(ctx, state, room, def, cell) {
    const inv = room.inventory.filter(function (id) { return id === def.id; }).length;
    const ever = room.placedEver.indexOf(def.id) >= 0;
    const afford = state.seeds >= def.price;
    const x = cell.x, y = cell.y;

    pixelBox(ctx, x, y, cell.w, cell.h, {
      fill: afford ? 'rgba(255,236,200,0.08)' : 'rgba(0,0,0,0.30)',
      border: afford ? 'rgba(255,236,200,0.22)' : 'rgba(255,236,200,0.08)'
    });

    // 占位缩略图
    pixelBox(ctx, x + 6, y + 12, 40, 40, {
      fill: 'rgba(0,0,0,0.28)',
      border: 'rgba(255,236,200,0.14)'
    });
    HZ.Furniture.drawPreview(ctx, def.id, x + 26, y + 32, 34, 32);

    font(ctx, 10, true);
    ctx.fillStyle = afford ? P.text : 'rgba(247,233,207,0.42)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name, x + 52, y + 18);

    // 价格
    drawSeedIcon(ctx, x + 56, y + 33, !afford);
    font(ctx, 9, true);
    ctx.fillStyle = afford ? P.yellow : 'rgba(255,159,147,0.62)';
    ctx.textAlign = 'left';
    ctx.fillText(String(def.price), x + 63, y + 33);

    // 已购 / 已摆过标记
    font(ctx, 8, false);
    ctx.textAlign = 'left';
    if (inv > 0) {
      ctx.fillStyle = '#9ad6a0';
      ctx.fillText('已购 ×' + inv, x + 52, y + 50);
    } else if (ever) {
      ctx.fillStyle = 'rgba(247,233,207,0.42)';
      ctx.fillText('已摆过', x + 52, y + 50);
    } else if (!afford) {
      ctx.fillStyle = 'rgba(255,179,167,0.72)';
      ctx.fillText('瓜子不够', x + 52, y + 50);
    }
  }

  // ---- 探险面板：派遣（双槽卡片）/ 图鉴 两个页签 ----
  function drawExpTabs(ctx, L2) {
    L2.tabs.forEach(function (t) {
      const active = expTab === t.tab;
      pixelBox(ctx, t.x, t.y, t.w, t.h, {
        fill: active ? 'rgba(255,236,200,0.18)' : 'rgba(0,0,0,0.24)',
        border: active ? 'rgba(242,193,78,0.80)' : 'rgba(255,236,200,0.14)'
      });
      font(ctx, 10, true);
      ctx.fillStyle = active ? P.yellow : P.textDim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2);
    });
  }

  function drawExpeditionPanel(ctx, state, L, m, now) {
    const L2 = expeditionLayout(L.vw, L.vh);
    const score = HZ.State.statusScore(state);
    const pool = (C.photos && C.photos.pool) || [];

    font(ctx, 13, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('探险', m.x + 14, m.y + 18);

    font(ctx, 9, false);
    ctx.fillStyle = P.textDim;
    ctx.textAlign = 'right';
    if (expTab === 'photos') {
      ctx.fillText('照片 ' + HZ.State.photoCount(state) + '/' + pool.length, m.x + m.w - 32, m.y + 18);
    } else {
      ctx.fillText('状态分 ' + Math.round(score), m.x + m.w - 32, m.y + 18);
    }

    // 关闭按钮
    const c = L2.close;
    pixelBox(ctx, c.x, c.y, c.w, c.h, {
      fill: 'rgba(255,236,200,0.10)',
      border: 'rgba(255,236,200,0.30)'
    });
    font(ctx, 11, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.fillText('×', c.x + c.w / 2, c.y + c.h / 2 + 1);

    drawExpTabs(ctx, L2);

    if (expTab === 'photos') drawPhotoGrid(ctx, state, L2);
    else drawDispatchCards(ctx, state, L2, now, score);
  }

  function drawDispatchCards(ctx, state, L2, now, score) {
    const slots = slotsOf(state);
    L2.cards.forEach(function (card) {
      drawDispatchCard(ctx, state, slots[card.index], card, now, score);
    });
  }

  function drawDispatchCard(ctx, state, st, card, now, score) {
    const sd = card.slot;
    // 在途/待领取优先于等级锁定：v2 迁移来的 Lv1 订单也要能看到倒计时和领取按钮
    const locked = !st && state.level < sd.unlockLevel;

    pixelBox(ctx, card.x, card.y, card.w, card.h, {
      fill: locked ? 'rgba(0,0,0,0.26)' : 'rgba(255,236,200,0.06)',
      border: locked ? 'rgba(255,236,200,0.08)' : 'rgba(255,236,200,0.18)'
    });

    font(ctx, 11, true);
    ctx.fillStyle = locked ? 'rgba(247,233,207,0.42)' : P.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(sd.name, card.x + 10, card.y + 16);

    if (locked) {
      font(ctx, 9, false);
      ctx.fillStyle = 'rgba(247,233,207,0.40)';
      ctx.fillText('Lv' + sd.unlockLevel + ' 解锁' + sd.name, card.x + 10, card.y + 42);
      font(ctx, 8, false);
      ctx.fillStyle = P.textDim;
      ctx.fillText('先照顾鼠鼠升升级', card.x + 10, card.y + 60);
      return;
    }

    if (!st) {
      card.tiers.forEach(function (row) {
        const def = HZ.State.tierDef(row.id);
        if (!def) return;
        const tierLocked = state.level < def.unlockLevel;
        const risky = def.durationSec >= C.expeditionRules.longDurationSec &&
          score < C.expeditionRules.minScoreForLong;

        pixelBox(ctx, row.x, row.y, row.w, row.h, {
          fill: tierLocked ? 'rgba(0,0,0,0.26)' : 'rgba(255,236,200,0.08)',
          border: tierLocked ? 'rgba(255,236,200,0.07)' : 'rgba(255,236,200,0.20)'
        });

        font(ctx, 10, true);
        ctx.fillStyle = tierLocked ? 'rgba(247,233,207,0.38)' : P.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.name, row.x + 8, row.y + row.h / 2);

        font(ctx, 8, false);
        ctx.textAlign = 'right';
        if (tierLocked) {
          ctx.fillStyle = 'rgba(247,233,207,0.38)';
          ctx.fillText('Lv' + def.unlockLevel + ' 解锁', row.x + row.w - 8, row.y + row.h / 2);
        } else if (risky) {
          ctx.fillStyle = '#ffb3a7';
          ctx.fillText('状态分低 · 可能空手', row.x + row.w - 8, row.y + row.h / 2);
        } else {
          ctx.fillStyle = P.yellow;
          ctx.fillText('约 ' + Math.round(def.seedBase * HZ.State.tierMul(score)) + ' 瓜子',
            row.x + row.w - 8, row.y + row.h / 2);
        }
      });

      font(ctx, 8, false);
      ctx.fillStyle = P.textDim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('低状态也能出发，回来再算收获', card.x + card.w / 2, card.y + card.h - 10);
      return;
    }

    // 已在探险：倒计时 / 领取
    const done = now >= st.endsAt;
    font(ctx, 10, true);
    ctx.fillStyle = done ? '#9ad6a0' : P.yellow;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(done ? '鼠鼠回来了' : '探险中', card.x + 10, card.y + 44);

    font(ctx, done ? 14 : 18, true);
    ctx.fillStyle = done ? '#9ad6a0' : P.text;
    ctx.textAlign = 'center';
    ctx.fillText(done ? '已归来' : fmtClock(Math.max(0, st.endsAt - now)),
      card.x + card.w / 2, card.y + 78);

    font(ctx, 8, false);
    ctx.fillStyle = P.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(st.name + ' · 出发时状态分 ' + Math.round(st.score),
      card.x + card.w / 2, card.y + 104);

    if (done) {
      const b = card.claim;
      const pulse = 0.55 + 0.35 * Math.sin(now / 240);
      pixelBox(ctx, b.x, b.y, b.w, b.h, {
        fill: 'rgba(242,193,78,0.92)',
        border: 'rgba(255,236,200,' + (0.55 + pulse * 0.4).toFixed(2) + ')'
      });
      font(ctx, 11, true);
      ctx.fillStyle = '#3b2416';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('领取', b.x + b.w / 2, b.y + b.h / 2);
    } else {
      font(ctx, 8, false);
      ctx.fillStyle = P.textDim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('到点后回来领取', card.x + card.w / 2, card.y + card.h - 10);
    }
  }

  // ---- 图鉴页 ----
  function drawPhotoGrid(ctx, state, L2) {
    const owned = {};
    const list = (state.photos && Array.isArray(state.photos.owned)) ? state.photos.owned : [];
    list.forEach(function (id) { owned[id] = true; });
    const pool = (C.photos && C.photos.pool) || [];

    L2.cells.forEach(function (cell, i) {
      const def = pool[i];
      if (!def) return;
      drawPhotoCell(ctx, cell, def, !!owned[def.id]);
    });

    font(ctx, 8, false);
    ctx.fillStyle = P.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('探险结算有概率带回照片 · 重复折算 +' +
      ((C.photos && C.photos.dupSeeds) || 20) + ' 瓜子',
      L2.m.x + L2.m.w / 2, L2.m.y + L2.m.h - 10);
  }

  function drawPhotoCell(ctx, cell, def, owned) {
    pixelBox(ctx, cell.x, cell.y, cell.w, cell.h, {
      fill: owned ? 'rgba(255,236,200,0.08)' : 'rgba(0,0,0,0.26)',
      border: owned ? 'rgba(255,236,200,0.18)' : 'rgba(255,236,200,0.06)'
    });
    const aw = 34, ah = 28;
    const ax = cell.x + 6;
    const ay = cell.y + 6;
    drawPhotoArt(ctx, def, ax, ay, aw, ah, owned);

    font(ctx, 9, true);
    ctx.fillStyle = owned ? P.text : 'rgba(247,233,207,0.35)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(owned ? def.name : '未收集', ax + aw + 6, cell.y + cell.h / 2);
  }

  // 代码绘制的占位照片卡：拍立得白边 + 主色块 + 简单图案
  function drawPhotoArt(ctx, def, x, y, w, h, owned) {
    ctx.fillStyle = owned ? '#f3e3c0' : 'rgba(247,233,207,0.10)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = owned ? (def.color || '#c9a36b') : 'rgba(0,0,0,0.32)';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

    if (!owned) {
      font(ctx, 12, true);
      ctx.fillStyle = 'rgba(247,233,207,0.30)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + w / 2, y + h / 2);
      return;
    }

    const accent = def.accent || '#8d6231';
    const v = def.variant || 'sun';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, w - 4, h - 4);
    ctx.clip();
    ctx.fillStyle = accent;
    if (v === 'sun') {
      ctx.beginPath();
      ctx.arc(x + w * 0.64, y + h * 0.34, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 2, y + h - 7, w - 4, 5);
    } else if (v === 'stripe') {
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 2, y + 6 + i * 7, w - 4, 3);
    } else if (v === 'box') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
      ctx.fillRect(x + 7, y + 7, w - 14, 3);
    } else {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + 9 + (i % 2) * 13, y + 9 + Math.floor(i / 2) * 10, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(90,58,36,0.70)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  }

  function drawResultPanel(ctx, state, L, m, now) {
    const r = state.lastResult || { seeds: 0, material: false, empty: false, doubled: false };

    font(ctx, 13, true);
    ctx.fillStyle = P.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('探险回来啦', m.x + m.w / 2, m.y + 22);

    ctx.textAlign = 'center';
    if (r.empty) {
      font(ctx, 10, false);
      ctx.fillStyle = '#ffb3a7';
      ctx.fillText('空手而归，一身泥', m.x + m.w / 2, m.y + 56);
      ctx.fillStyle = P.textDim;
      ctx.fillText('清洁 -30，洗个澡就好', m.x + m.w / 2, m.y + 76);
    } else {
      font(ctx, 18, true);
      ctx.fillStyle = P.yellow;
      ctx.fillText('+' + r.seeds + ' 瓜子', m.x + m.w / 2, m.y + 56);

      font(ctx, 9, false);
      ctx.fillStyle = P.textDim;
      const extra = [];
      if (r.material) extra.push('带回 1 个材料');
      if (r.doubled) extra.push('已翻倍');
      ctx.fillText(extra.length ? extra.join('　') : '鼠鼠玩得很开心', m.x + m.w / 2, m.y + 82);

      // 照片卡（占位色块 + 名称）
      if (r.photoId) {
        const def = HZ.State.photoDef(r.photoId);
        const text = r.dup
          ? '重复照片 ' + r.photoName + ' 折算 +' + (r.dupSeeds || 20) + ' 瓜子'
          : '新照片 · ' + r.photoName;
        font(ctx, 9, true);
        const tw = ctx.measureText(text).width;
        const chip = 12;
        const startX = m.x + Math.round((m.w - (tw + chip + 5)) / 2);
        const cy = m.y + 106;
        ctx.fillStyle = def ? (def.color || '#c9a36b') : '#c9a36b';
        ctx.fillRect(startX, cy - chip / 2, chip, chip);
        ctx.strokeStyle = 'rgba(255,236,200,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX + 0.5, cy - chip / 2 + 0.5, chip - 1, chip - 1);
        ctx.fillStyle = r.dup ? P.textDim : P.text;
        ctx.textAlign = 'left';
        ctx.fillText(text, startX + chip + 5, cy + 1);
      }
    }

    const btns = resultButtons(L.vw, L.vh);
    btns.forEach(function (b) {
      const disabled = b.kind === 'adDouble' &&
        (r.doubled || r.empty || r.seeds <= 0 || !HZ.State.canWatchAd(state, now));
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
    getPanel: getPanel,
    setExpTab: setExpTab,
    getExpTab: getExpTab,
    shopItems: shopItems
  };
})();
