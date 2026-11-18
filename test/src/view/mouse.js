// 鼠鼠：状态机 + 像素风绘制
// 约定：角色永远朝右绘制，需要朝左时整体 scaleX = -1；
// 尾巴、耳朵都写在角色局部坐标系里，跟随身体/头部变换，
// 从根上避免"尾巴画反、耳朵脱节"（设计文档 0.4 第 3、4 条）。
window.HZ = window.HZ || {};

HZ.Mouse = (function () {
  const P = HZ.CONFIG.palette;
  const OUTLINE = '#5f5a63';

  function create(L) {
    const x = Math.round(L.vw * 0.5);
    return {
      x: x,
      baseY: L.baseline,
      targetX: x,
      facing: 1,
      state: 'idle',
      actT: 0,
      walkPhase: 0,
      nextWanderAt: 0,
      blinkAt: 0,
      blink: 0,
      away: false,
      tired: false
    };
  }

  function update(m, dt, now, L, opts) {
    m.tired = !!opts.tired;
    if (m.away) return;

    if (m.actT > 0) {
      m.actT -= dt * 1000;
      if (m.actT <= 0) {
        m.actT = 0;
        m.state = 'idle';
      }
    }

    if (m.blink > 0) m.blink -= dt;
    else if (now > m.blinkAt) {
      m.blink = 0.12;
      m.blinkAt = now + 2200 + Math.random() * 3200;
    }

    if (m.state === 'idle' && now > m.nextWanderAt && !m.actT) {
      const span = L.walkRight - L.walkLeft;
      if (Math.random() > 0.45) {
        m.targetX = Math.round(L.walkLeft + Math.random() * span);
        m.state = 'walk';
      }
      m.nextWanderAt = now + 2800 + Math.random() * 4200;
    }

    if (m.state === 'walk') {
      const dx = m.targetX - m.x;
      const speed = m.tired ? 16 : 34;
      if (Math.abs(dx) < 2) {
        m.x = m.targetX;
        m.state = 'idle';
      } else {
        m.facing = dx > 0 ? 1 : -1;
        m.x += Math.sign(dx) * speed * dt;
        m.walkPhase += dt * (m.tired ? 6 : 10);
      }
    } else if (m.state === 'idle') {
      m.walkPhase = 0;
    }
  }

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(ctx, m, now) {
    if (m.away) return;

    const t = now / 1000;
    const tired = m.tired;

    let bob = Math.sin(t * 1.8) * 1.2;
    let yOff = 0;
    let headY = 0;
    let rot = 0;
    let squash = 1;

    if (tired) bob *= 0.45;

    if (m.state === 'eat') {
      bob = Math.sin(t * 9) * 1.2;
      headY = 8 + Math.sin(t * 9) * 4;
    } else if (m.state === 'drink') {
      headY = -10 + Math.sin(t * 6) * 2;
      bob = Math.sin(t * 6) * 1;
    } else if (m.state === 'bath') {
      rot = Math.sin(t * 16) * 0.07;
      bob = Math.sin(t * 16) * 2;
    } else if (m.state === 'happy') {
      yOff = -Math.abs(Math.sin(t * 7)) * 9;
      bob = 0;
    } else if (m.state === 'jump') {
      yOff = -Math.abs(Math.sin(t * 6)) * 30;
      bob = 0;
    } else if (m.state === 'sleep') {
      squash = 1.05;
      bob = Math.sin(t * 1.1) * 1.2;
    } else if (m.state === 'walk') {
      bob = -Math.abs(Math.sin(m.walkPhase)) * 2.5;
    }

    // 地面投影
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#3a2313';
    ellipse(ctx, m.x, m.baseY + 3, 54 - yOff * 0.3, 8);
    ctx.restore();

    ctx.save();
    ctx.translate(m.x, m.baseY + yOff + bob);
    ctx.scale(m.facing, 1);
    if (rot) ctx.rotate(rot);
    if (squash !== 1) ctx.scale(1, squash);

    const legSwing = m.state === 'walk' ? Math.sin(m.walkPhase) * 5 : 0;
    const legSwing2 = m.state === 'walk' ? Math.sin(m.walkPhase + Math.PI) * 5 : 0;
    const hx = 36;
    const hy = -44 + headY;
    const earDrop = tired ? 7 : 0;

    // ---------- 尾巴：局部坐标，随整体镜像 ----------
    const tailWave = Math.sin(t * 2.2) * 5;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-46, -26);
    ctx.quadraticCurveTo(-78, -26 + tailWave, -96, -6 + tailWave * 0.6);
    ctx.stroke();
    ctx.strokeStyle = P.pinkDark;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = P.pink;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ---------- 后腿 ----------
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-38 + legSwing, -14, 13, 14);
    ctx.fillRect(4 - legSwing2, -13, 12, 13);
    ctx.fillStyle = P.mouse;
    ctx.fillRect(-36 + legSwing, -12, 10, 12);
    ctx.fillRect(5 - legSwing2, -11, 10, 11);
    ctx.fillStyle = P.pink;
    ctx.fillRect(-37 + legSwing, 0, 12, 4);
    ctx.fillRect(4 - legSwing2, 1, 12, 4);

    // ---------- 身体轮廓 + 身体 ----------
    ctx.fillStyle = OUTLINE;
    ellipse(ctx, -8, -33, 51, 26);
    ctx.fillStyle = P.mouse;
    ellipse(ctx, -8, -33, 48.5, 23.5);

    // 背部深色斑块
    ctx.fillStyle = '#8e8d97';
    ellipse(ctx, -22, -40, 26, 12);
    ctx.fillStyle = P.mouseLight;
    ellipse(ctx, -30, -44, 18, 7);

    // 肚皮
    ctx.fillStyle = P.mouseBelly;
    ellipse(ctx, -4, -21, 37, 12.5);

    // ---------- 前腿 ----------
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-24 + legSwing2, -10, 10, 11);
    ctx.fillRect(18 - legSwing, -9, 9, 10);
    ctx.fillStyle = P.mouse;
    ctx.fillRect(-23 + legSwing2, -9, 8, 10);
    ctx.fillRect(19 - legSwing, -8, 7, 9);
    ctx.fillStyle = P.pink;
    ctx.fillRect(-24 + legSwing2, 0, 9, 3);
    ctx.fillRect(18 - legSwing, 1, 9, 3);

    // ---------- 头（轮廓 + 圆脸）----------
    ctx.fillStyle = OUTLINE;
    ellipse(ctx, hx, hy, 23, 21.5);
    ctx.fillStyle = P.mouse;
    ellipse(ctx, hx, hy, 21, 19.5);

    // 口鼻
    ctx.fillStyle = P.mouseBelly;
    ctx.beginPath();
    ctx.ellipse(hx + 13, hy + 8, 13, 9.5, 0.16, 0, Math.PI * 2);
    ctx.fill();

    // 脸颊绒毛
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ellipse(ctx, hx + 4, hy + 10, 9, 6);

    // ---------- 耳朵（挂在头上，随头位移）----------
    ctx.fillStyle = OUTLINE;
    ellipse(ctx, hx - 5, hy - 19 + earDrop, 12.5, 12.5);
    ctx.fillStyle = P.mouse;
    ellipse(ctx, hx - 5, hy - 19 + earDrop, 10.5, 10.5);
    ctx.fillStyle = P.pink;
    ellipse(ctx, hx - 5, hy - 19 + earDrop, 6.5, 6.5);

    // 远侧耳朵
    ctx.fillStyle = '#8e8d97';
    ellipse(ctx, hx + 14, hy - 16 + earDrop, 8, 8);
    ctx.fillStyle = P.pinkDark;
    ellipse(ctx, hx + 14, hy - 16 + earDrop, 4, 4);

    // ---------- 眼睛 ----------
    const blinking = m.blink > 0 || m.state === 'sleep';
    if (blinking) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(hx + 8, hy - 3, 8, 2.5);
    } else {
      ctx.fillStyle = '#241a12';
      ellipse(ctx, hx + 12, hy - 3, 3.8, 4.2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(hx + 10, hy - 6, 2.5, 2.5);
    }

    // ---------- 鼻子与胡须 ----------
    ctx.fillStyle = P.pink;
    ellipse(ctx, hx + 25, hy + 6, 3, 2.4);

    ctx.strokeStyle = 'rgba(255,255,255,0.66)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hx + 26, hy + 9); ctx.lineTo(hx + 41, hy + 4);
    ctx.moveTo(hx + 26, hy + 12); ctx.lineTo(hx + 42, hy + 14);
    ctx.moveTo(hx + 26, hy + 11); ctx.lineTo(hx + 40, hy + 20);
    ctx.stroke();

    // 背部绒毛
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const fx = -34 + i * 11;
      ctx.beginPath();
      ctx.moveTo(fx, -50);
      ctx.lineTo(fx + 3, -44);
      ctx.stroke();
    }

    ctx.restore();

    // 睡觉的 z
    if (m.state === 'sleep') {
      ctx.save();
      ctx.fillStyle = 'rgba(247,233,207,0.85)';
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      const zy = -72 - ((t * 12) % 22);
      ctx.fillText('z', m.x + 44, m.baseY + zy);
      ctx.restore();
    }
  }

  return { create: create, update: update, draw: draw };
})();
