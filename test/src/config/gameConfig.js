// 测试版全局配置
// 数值来源：docs/design/花枝鼠养成小屋-立项设计文档.md 第 1.2、1.3、2.1、2.2 节
// 本文件只放数据，不放逻辑。改数值改这里。
window.HZ = window.HZ || {};

// 测试版开关：为 true 时显示调试按钮（加速、重置）。正式版必须为 false。
HZ.DEV = true;

HZ.CONFIG = {
  version: 'test-v003',

  // 虚拟分辨率：高度固定 360，宽度按屏幕比例算，保证铺满不变形
  virtual: { height: 360, minWidth: 460, maxWidth: 900 },

  palette: {
    wallDark: '#4c301f',
    wall: '#6b4529',
    wallLight: '#8a5c38',
    wallLine: '#3b2416',
    shaving: '#efd39b',
    shavingDark: '#dfbc7b',
    shavingLight: '#f8e6bc',
    fence: '#d8a04b',
    fenceDark: '#a9762c',
    fenceLight: '#f0c273',
    grass: '#6fae4e',
    grassDark: '#4c8437',
    grassLight: '#8cc45f',
    mouse: '#a9a8b2',
    mouseLight: '#cbc9d2',
    mouseBelly: '#f4f0e6',
    pink: '#f0a3a8',
    pinkDark: '#d0737c',
    ink: '#2a1c12',
    wood: '#bd8a4c',
    woodDark: '#8d6231',
    blue: '#7fbfe0',
    water: '#a8dcf0',
    red: '#d9534f',
    yellow: '#f2c14e',
    panel: 'rgba(42,28,18,0.74)',
    panelLine: 'rgba(255,236,200,0.20)',
    text: '#f7e9cf',
    textDim: 'rgba(247,233,207,0.55)'
  },

  // 四项数值（2.1）
  stats: [
    { id: 'satiety', name: '饱食', max: 100, initial: 80, decayPerHour: 5, weight: 0.30, color: '#f0a63c' },
    { id: 'thirst', name: '水分', max: 100, initial: 80, decayPerHour: 7, weight: 0.25, color: '#7fbfe0' },
    { id: 'clean', name: '清洁', max: 100, initial: 90, decayPerHour: 3.5, weight: 0.20, color: '#9ad6a0' },
    { id: 'happy', name: '心情', max: 100, initial: 70, decayPerHour: 3, weight: 0.25, color: '#f28fae' }
  ],

  // 离线段折算（2.1）
  offline: { factor: 0.8, capHours: 10 },

  // 照料动作（1.2）。值为 0 表示该动作只影响清洁，不涨单项上限。
  actions: [
    { id: 'feed', name: '喂食', stat: 'satiety', value: 25, cooldownSec: 600, dailyLimit: 12, exp: 5, mouseAct: 'eat' },
    { id: 'drink', name: '喝水', stat: 'thirst', value: 30, cooldownSec: 480, dailyLimit: 12, exp: 3, mouseAct: 'drink' },
    { id: 'bath', name: '洗澡', stat: 'clean', value: 40, cooldownSec: 1800, dailyLimit: 8, exp: 8, mouseAct: 'bath' },
    { id: 'play', name: '玩耍', stat: 'happy', value: 20, cooldownSec: 300, dailyLimit: 12, exp: 6, mouseAct: 'jump' },
    { id: 'tidy', name: '收拾', stat: 'clean', value: 12, cooldownSec: 180, dailyLimit: 10, exp: 2, mouseAct: 'happy' },
    // 抚摸不在按钮栏里，点鼠鼠本体触发
    { id: 'pet', name: '抚摸', stat: 'happy', value: 12, cooldownSec: 60, dailyLimit: 30, exp: 2, mouseAct: 'happy', hidden: true }
  ],

  // 探险档位（1.3）。10 分钟档在测试版下调到 Lv1 解锁，方便立刻验证。
  expedition: [
    { id: 'exp_10m', name: '10 分钟', durationSec: 600, seedBase: 20, materialRate: 0.10, unlockLevel: 1 },
    { id: 'exp_30m', name: '30 分钟', durationSec: 1800, seedBase: 45, materialRate: 0.15, unlockLevel: 2 },
    { id: 'exp_2h', name: '2 小时', durationSec: 7200, seedBase: 90, materialRate: 0.20, unlockLevel: 3 },
    { id: 'exp_8h', name: '8 小时', durationSec: 28800, seedBase: 200, materialRate: 0.35, unlockLevel: 4 }
  ],

  expeditionRules: {
    longDurationSec: 7200,   // 2 小时及以上受状态分门槛约束
    minScoreForLong: 20,
    // 状态系数（1.3）
    scoreTiers: [
      { min: 70, mul: 1.1 },
      { min: 40, mul: 1.0 },
      { min: 20, mul: 0.8 },
      { min: 0,  mul: 0.6 }
    ],
    emptyPenaltyClean: 30   // 状态分 <20 派长探险：空手而归，清洁 -30
  },

  // 经济：广告兑换 + 家具商店（test-v003）
  // 家具清单来源：docs/design/01-核心循环/家具与商店-测试版细化设计.md 第 2 节
  // w/h 为摆放判定与占位绘制尺寸；draw 只放配色参数，绘制逻辑在 view/furniture.js
  economy: {
    seedPerAd: 50,
    roomCap: 12,        // 同屏摆放上限（不含 5 个固定物件）
    placeHappy: 5,      // 每件家具首次摆放开心加成
    furniture: [
      {
        id: 'f_201', name: '小坐垫', price: 200, tier: 'small', wall: false,
        w: 54, h: 22,
        draw: { fill: '#c96b4a', light: '#e0876a', dark: '#5a3a24' }
      },
      {
        id: 'f_202', name: '小盆栽', price: 250, tier: 'small', wall: false,
        w: 34, h: 56,
        draw: { leaf: '#7f9a54', leafLight: '#9cbb6a', pot: '#b06a44', dark: '#5a3a24' }
      },
      {
        id: 'f_203', name: '挂画', price: 300, tier: 'small', wall: true,
        w: 56, h: 42,
        draw: { frame: '#8d6231', frameLight: '#bd8a4c', paper: '#f3e3c0', motif: '#7fbfe0', dark: '#5a3a24' }
      },
      {
        id: 'f_204', name: '条纹毛毯', price: 300, tier: 'small', wall: false,
        w: 72, h: 24,
        draw: { a: '#c96b4a', b: '#f0c273', dark: '#5a3a24' }
      },
      {
        id: 'f_205', name: '小木梯', price: 350, tier: 'small', wall: false,
        w: 44, h: 64,
        draw: { fill: '#bd8a4c', dark: '#5a3a24' }
      },
      {
        id: 'f_206', name: '吊秋千', price: 400, tier: 'small', wall: true,
        w: 60, h: 56,
        draw: { beam: '#8d6231', rope: '#c9a36b', board: '#bd8a4c', dark: '#5a3a24' }
      },
      {
        id: 'f_207', name: '草编球窝', price: 450, tier: 'small', wall: false,
        w: 58, h: 34,
        draw: { straw: '#d8a04b', strawDark: '#a9762c', ball: '#8cc45f', dark: '#5a3a24' }
      },
      {
        id: 'f_208', name: '小书架', price: 500, tier: 'small', wall: false,
        w: 50, h: 66,
        draw: { fill: '#8d6231', grid: '#5a3a24', bookA: '#c96b4a', bookB: '#7fbfe0', bookC: '#f0c273', dark: '#5a3a24' }
      }
    ]
  },

  ads: { dailyCap: 8 },

  level: {
    expBase: 60,
    expStep: 20,
    maxLevel: 30,
    titles: [
      '小毛球', '好奇宝宝', '会自己吃饭', '木屑专家', '探险新手',
      '跑轮健将', '藏食大师', '小屋主人', '深夜跑酷王', '洗脸冠军',
      '阳台常客', '社交鼠鼠', '家具收藏家', '影子猎手', '阳光捕手',
      '老练探险家', '毛色鉴赏家', '小屋改造师', '花枝传奇', '小屋之魂'
    ]
  }
};
