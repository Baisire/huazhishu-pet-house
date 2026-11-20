// 鼠鼠：像素精灵 + 状态机
// 精灵图永远朝右绘制，向左时整体水平翻转；坐标在地面平面上二维移动。
window.HZ = window.HZ || {};

HZ.Mouse = (function () {
  const H = 96;          // 显示高度（640×360 坐标）
  const SPEED = 78;      // 像素/秒
  const GROUND = {
    yMin: 188,
    yMax: 320,
    leftAtBack: 84,
    rightAtBack: 552,
    leftAtFront: 94,
    rightAtFront: 548
  };

  let running = false;

  function create(y) {
    return {
      x: 352,
      y: y,
      targetX: 352,
      targetY: y,
      facing: 1,
      state: 'idle',
      actT: 0,
      walkPhase: 0,
      blinkAt: 0,
      blink: 0,
      away: false,
      onArrive: null
    };
  }

  function boundsAt(y) {
    const t = Math.max(0, Math.min(1, (y - GROUND.yMin) / (GROUND.yMax - GROUND.yMin)));
    return {
      left: GROUND.leftAtBack + (GROUND.leftAtFront - GROUND.leftAtBack) * t,
      right: GROUND.rightAtBack + (GROUND.rightAtFront - GROUND.rightAtBack) * t
    };
  }

  function clampToGround(x, y) {
    const cy = Math.max(GROUND.yMin, Math.min(GROUND.yMax, y));
    const bounds = boundsAt(cy);
    return {
      x: Math.max(bounds.left, Math.min(bounds.right, x)),
      y: cy
    };
  }

  function canWalk(x, y) {
    if (y < GROUND.yMin || y > GROUND.yMax) return false;
    const bounds = boundsAt(y);
    return x >= bounds.left && x <= bounds.right;
  }

  function walkTo(m, x, y, onArrive) {
    const target = clampToGround(x, y);
    m.targetX = target.x;
    m.targetY = target.y;
    m.onArrive = onArrive || null;
    if (Math.abs(m.targetX - m.x) < 2 && Math.abs(m.targetY - m.y) < 2) {
      m.x = m.targetX;
      m.y = m.targetY;
      if (m.onArrive) { const cb = m.onArrive; m.onArrive = null; cb(); }
      return;
    }
    m.state = 'walk';
  }

  function act(m, state, ms) {
    // 中断未完成的行走：停在当前位置并丢弃未执行的回调，
    // 否则走路途中点按钮会让 onArrive 永久丢失、鼠鼠卡在半路
    m.targetX = m.x;
    m.targetY = m.y;
    m.onArrive = null;
    m.state = state;
    m.actT = ms;
    running = (state === 'run');
  }

  function isRunning() {
    return running;
  }

  function update(m, dt, now) {
    if (m.away) return;

    if (m.blink > 0) m.blink -= dt;
    else if (now > m.blinkAt) {
      m.blink = 0.12;
      m.blinkAt = now + 2200 + Math.random() * 3400;
    }

    if (m.actT > 0) {
      m.actT -= dt * 1000;
      if (m.actT <= 0) {
        m.actT = 0;
        m.state = 'idle';
        running = false;
      }
      return;
    }

    if (m.state === 'walk') {
      const dx = m.targetX - m.x;
      const dy = m.targetY - m.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 2) {
        m.x = m.targetX;
        m.y = m.targetY;
        m.state = 'idle';
        m.walkPhase = 0;
        if (m.onArrive) {
          const cb = m.onArrive;
          m.onArrive = null;
          cb();
        }
      } else {
        if (Math.abs(dx) > 0.5) m.facing = dx > 0 ? 1 : -1;
        const step = Math.min(distance, SPEED * dt);
        m.x += (dx / distance) * step;
        m.y += (dy / distance) * step;
        m.walkPhase += dt * 9;
      }
    } else if (m.state === 'idle') {
      m.walkPhase = 0;
    }
  }

  function draw(ctx, m, now) {
    if (m.away) return;

    const t = now / 1000;
    const img = HZ.Assets.get('mouse');
    if (!img) return;

    const ih = img.naturalHeight || img.height || 1;
    const iw = img.naturalWidth || img.width || 1;
    const depth = (m.y - GROUND.yMin) / (GROUND.yMax - GROUND.yMin);
    const h = H * (0.92 + depth * 0.14);
    const w = Math.round(h * iw / ih);

    let bob = 0;
    if (m.state === 'walk') {
      bob = -Math.abs(Math.sin(m.walkPhase)) * 2.5;
    } else if (m.state === 'idle') {
      bob = Math.sin(t * 1.8) * 1.2;
    } else if (m.state === 'run') {
      bob = -Math.abs(Math.sin(t * 14)) * 3;
    } else if (m.state === 'eat') {
      bob = Math.sin(t * 9) * 1.2;
    } else if (m.state === 'drink') {
      bob = Math.sin(t * 7) * 1;
    } else if (m.state === 'pet') {
      bob = -Math.abs(Math.sin(t * 6)) * 4;
    }

    // 地面投影
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#4a2d15';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 2, w * 0.34, 5 + depth * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(m.x, m.y + bob);
    ctx.scale(m.facing, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }

  function hitTest(m, x, y) {
    const img = HZ.Assets.get('mouse');
    if (!img) return false;
    const depth = (m.y - GROUND.yMin) / (GROUND.yMax - GROUND.yMin);
    const h = H * (0.92 + depth * 0.14);
    const w = Math.round(h * (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1));
    return x > m.x - w / 2 && x < m.x + w / 2 && y > m.y - h && y < m.y + 6;
  }

  return {
    create: create,
    update: update,
    draw: draw,
    walkTo: walkTo,
    act: act,
    isRunning: isRunning,
    canWalk: canWalk,
    hitTest: hitTest
  };
})();
