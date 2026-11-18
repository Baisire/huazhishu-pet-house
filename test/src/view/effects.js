// 粒子与飘字：星星、爱心、泡泡、尘土
window.HZ = window.HZ || {};

HZ.Effects = (function () {
  let particles = [];
  let floats = [];
  let toastText = '';
  let toastT = 0;

  function push(p) {
    if (particles.length > 140) particles.shift();
    particles.push(p);
  }

  function spawnStars(x, y, color, n) {
    const count = n || 8;
    for (let i = 0; i < count; i++) {
      push({
        type: 'star', x: x, y: y,
        vx: (Math.random() - 0.5) * 90,
        vy: -40 - Math.random() * 70,
        life: 0.7 + Math.random() * 0.4,
        age: 0,
        size: 2 + Math.random() * 2,
        color: color || '#ffd54f'
      });
    }
  }

  function spawnHearts(x, y, n) {
    const count = n || 5;
    for (let i = 0; i < count; i++) {
      push({
        type: 'heart', x: x, y: y,
        vx: (Math.random() - 0.5) * 40,
        vy: -30 - Math.random() * 40,
        life: 0.9 + Math.random() * 0.4,
        age: 0,
        size: 3 + Math.random() * 2,
        color: '#f28fae'
      });
    }
  }

  function spawnBubbles(x, y, n) {
    const count = n || 8;
    for (let i = 0; i < count; i++) {
      push({
        type: 'bubble', x: x + (Math.random() - 0.5) * 40, y: y,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 30,
        life: 0.8 + Math.random() * 0.5,
        age: 0,
        size: 2 + Math.random() * 3,
        color: '#bfe9ff'
      });
    }
  }

  function spawnDust(x, y, n) {
    const count = n || 6;
    for (let i = 0; i < count; i++) {
      push({
        type: 'dust', x: x + (Math.random() - 0.5) * 30, y: y,
        vx: (Math.random() - 0.5) * 50,
        vy: -10 - Math.random() * 20,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        size: 2 + Math.random() * 2,
        color: '#e8c98d'
      });
    }
  }

  function floatText(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color || '#f7e9cf', age: 0, life: 1.1 });
  }

  function toast(text) {
    toastText = text;
    toastT = 1.8;
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.age += dt;
      if (f.age >= f.life) { floats.splice(i, 1); continue; }
      f.y -= 22 * dt;
    }
    if (toastT > 0) toastT -= dt;
  }

  function draw(ctx) {
    particles.forEach(function (p) {
      const k = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      if (p.type === 'star') {
        const s = p.size;
        ctx.fillRect(p.x - s, p.y, s * 2, 1.5);
        ctx.fillRect(p.x, p.y - s, 1.5, s * 2);
      } else if (p.type === 'heart') {
        const s = p.size;
        ctx.beginPath();
        ctx.arc(p.x - s * 0.5, p.y, s * 0.7, 0, Math.PI * 2);
        ctx.arc(p.x + s * 0.5, p.y, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x - s * 1.15, p.y + s * 0.2);
        ctx.lineTo(p.x + s * 1.15, p.y + s * 0.2);
        ctx.lineTo(p.x, p.y + s * 1.9);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'bubble') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.restore();
    });

    floats.forEach(function (f) {
      const k = 1 - f.age / f.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function drawToast(ctx, vw) {
    if (toastT <= 0) return;
    const alpha = Math.min(1, toastT / 0.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    const w = ctx.measureText(toastText).width + 26;
    const x = Math.round((vw - w) / 2);
    const y = 82;
    ctx.fillStyle = 'rgba(42,28,18,0.86)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, 24, 12) : ctx.rect(x, y, w, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,200,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f7e9cf';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toastText, vw / 2, y + 13);
    ctx.restore();
  }

  function clear() {
    particles = [];
    floats = [];
  }

  return {
    spawnStars: spawnStars,
    spawnHearts: spawnHearts,
    spawnBubbles: spawnBubbles,
    spawnDust: spawnDust,
    floatText: floatText,
    toast: toast,
    update: update,
    draw: draw,
    drawToast: drawToast,
    clear: clear
  };
})();
