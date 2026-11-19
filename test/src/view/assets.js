// 素材加载：统一入口，全部加载完成后才启动游戏
// 所有图片放在 test/assets/images/，文件名即素材 id
window.HZ = window.HZ || {};

HZ.Assets = (function () {
  const MANIFEST = {
    bg: 'bg-room.png',
    fence: 'fg-fence.png',
    wheel: 'wheel.png',
    wheelF2: 'wheel-f2.png',
    bottle: 'bottle.png',
    bottleLow: 'bottle-low.png',
    bowl: 'bowl.png',
    bowlEmpty: 'bowl-empty.png',
    hideout: 'hideout.png',
    balls: 'balls.png',
    mouse: 'mouse.png'
  };

  const images = {};
  let ready = false;

  function load(cb) {
    const keys = Object.keys(MANIFEST);
    let left = keys.length;

    keys.forEach(function (k) {
      const img = new Image();
      img.src = 'assets/images/' + MANIFEST[k];
      img.onload = done;
      img.onerror = function () {
        console.warn('素材加载失败：' + MANIFEST[k]);
        done();
      };
      images[k] = img;

      function done() {
        left -= 1;
        if (left === 0) {
          ready = true;
          cb();
        }
      }
    });
  }

  function get(k) {
    return images[k];
  }

  function isReady() {
    return ready;
  }

  return { load: load, get: get, isReady: isReady };
})();
