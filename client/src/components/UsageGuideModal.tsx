import { useState } from 'react';
import { Modal } from './ui';

/* ============ 使用说明：分类 chips 弹窗（内容按需展示，不整页铺开） ============ */

interface Point { lead?: string; text: string }
interface QA { q: string; a: string }
interface Section {
  key: string;
  chip: string;
  title: string;
  intro?: string;
  points?: Point[];
  qa?: QA[];
  imgs?: { src: string; cap: string }[];
}

const SECTIONS: Section[] = [
  {
    key: 'start', chip: '🚀 快速开始', title: '快速开始',
    points: [
      { lead: '注册 / 登录', text: '打开应用 → 输入用户名密码注册（或用演示账号 demo / demo1234 体验）' },
      { lead: '创建旅程', text: '仪表盘点「＋ 创建旅程」，填标题、目的地和日期' },
      { lead: '邀请朋友', text: '进入旅程 → 「成员」页创建邀请码发给朋友，或直接输入对方旅行 ID 添加' },
      { lead: '开始规划', text: '手动添加安排，或交给 AI 一键生成' },
    ],
    imgs: [{ src: '/guide/10-login.png', cap: '登录 / 注册：支持演示账号一键体验' }],
  },
  {
    key: 'itinerary', chip: '🗓️ 每日行程', title: '每日行程：规划的起点',
    points: [
      { lead: '＋ 添加行程', text: '填时间、做什么、地点，可搜索定位（带坐标才能上地图）' },
      { text: '每站右侧「修改 / 删除」随时调整；按住左侧 ⋮⋮ 可拖拽排序、跨天移动' },
      { lead: '✨ AI 助手', text: '按目的地 + 天数 + 节奏生成整段行程，或粘贴攻略文本自动解析（一般 20~60 秒，请耐心等待）' },
      { text: '顶部 D1~Dn chips 快速切天；天气胶囊展示当日预报' },
    ],
    imgs: [{ src: '/guide/01-itinerary.png', cap: '每日行程：每站含时间、地点、费用与备注' }],
  },
  {
    key: 'tripmode', chip: '🧭 出发模式', title: '出发模式：旅途中的当天视图',
    intro: '行程页点「🧭 出发模式」进入全屏当天视图——这是旅途中真正会打开的界面：',
    points: [
      { text: '顶部日期条切换当天，勾选完成一站，「下一站」自动橙色高亮' },
      { text: '手绘路线图展示各站方位（断网也能看）' },
      { text: '每站可跳「高德导航」与「小红书」看攻略' },
      { text: '底部「复制今日路线」一键转发给同伴；「高德导航全天路线」按行程顺序串起所有站点' },
    ],
    imgs: [{ src: '/guide/02-tripmode.png', cap: '出发模式：勾选进度 + 手绘路线 + 一键导航' }],
  },
  {
    key: 'map', chip: '🗺️ 旅行地图', title: '旅行地图：一眼看全行程',
    points: [
      { text: '全部已定位地点按 D1~Dn 分色展示，虚线为建议路线顺序' },
      { text: '顶部 D1~Dn chips 按天筛选查看' },
      { lead: '🗺️ 高德搜索全部目的地', text: '把所有站点按行程顺序串成高德路线，一键导航' },
      { lead: '📋 复制全部行程', text: '完整行程文本进剪贴板，方便分享' },
      { text: '「地点搜索」面板可搜任意地点并直接加入某天行程' },
    ],
    imgs: [{ src: '/guide/03-map.png', cap: '旅行地图：分色标记 + 按天筛选 + 一键串联路线' }],
  },
  {
    key: 'budget', chip: '💰 团队预算', title: '团队预算：记账与结算',
    points: [
      { lead: '＋ 记一笔', text: '填说明和金额，选垫付人；可指定只有部分人分摊' },
      { text: '自动统计「团队总花费 / 我垫付的 / 待收回」与分类占比' },
      { text: '结算方案自动算出「转账最少」的组合，照着转就两清' },
    ],
    imgs: [{ src: '/guide/04-budget.png', cap: '旅行钱包：统计、分类占比与结算方案' }],
  },
  {
    key: 'packing', chip: '🎒 打包清单', title: '打包清单：别落下充电宝',
    points: [
      { lead: '从模板导入', text: '证件 / 衣物 / 电子 / 洗护 / 药品等 6 套模板一键生成' },
      { text: '物品可指派负责人、写数量与备注；出发前逐项勾选' },
    ],
    imgs: [{ src: '/guide/05-packing.png', cap: '出发准备清单：按分类勾选、指派到人' }],
  },
  {
    key: 'handbook', chip: '📖 旅行锦囊', title: '旅行锦囊：目的地攻略手册',
    points: [
      { lead: '✨ 按目的地重新生成', text: 'AI 生成美食 / 贴士 / 语言 / 拍摄四类卡片' },
      { text: '内置全国 20+ 热门城市与出境目的地内容，未配置 AI 也能用' },
      { lead: '＋ 自定义卡片', text: '记录团队约定、老饕私藏清单' },
    ],
    imgs: [{ src: '/guide/06-handbook.png', cap: '旅行锦囊：四类手册卡' }],
  },
  {
    key: 'members', chip: '👥 成员与分享', title: '成员与分享：把大家拉进来',
    points: [
      { lead: '邀请好友', text: '生成邀请码/链接（可限次数与有效期），朋友注册登录后自动加入' },
      { lead: '旅行 ID 添加', text: '对方在「我的」页查看自己的 6 位 ID' },
      { lead: '只填名称占位', text: '还没注册的家人朋友先占个位，之后自动绑定' },
      { lead: '角色', text: '发起人 / 管理员 / 成员 / 观察者，分级权限；发起人可转让' },
      { lead: '对外分享', text: '开启只读链接，适合发给长辈或不用操作的同行人' },
    ],
    imgs: [{ src: '/guide/07-members.png', cap: '成员管理：角色、邀请、对外分享' }],
  },
  {
    key: 'journal', chip: '✍️ 日志与动态', title: '日志与动态：记录与回顾',
    points: [
      { lead: '日志', text: '带心情的旅行手记，可关联某一天；谁写的谁编辑' },
      { lead: '动态', text: '全员操作自动生成时间线，谁改了行程、记了账一目了然' },
    ],
    imgs: [{ src: '/guide/08-journal.png', cap: '旅行日志：心情手记，按天关联' }],
  },
  {
    key: 'more', chip: '✨ 更多功能', title: '更多好用的小功能',
    points: [
      { lead: '💬 使用助手', text: '任意页面右下角悬浮球，随问随答使用问题；右上角 × 可隐藏，屏幕右缘小图标找回；按住可拖到顺手的位置' },
      { lead: '🌙 夜间模式', text: '顶栏一键切换，晚上看行程不刺眼' },
      { lead: '手机适配', text: '手机浏览器直接访问，布局自动适配' },
    ],
    imgs: [
      { src: '/guide/11-mobile.png', cap: '手机浏览器访问，自动适配小屏' },
      { src: '/guide/12-dark.png', cap: '夜间模式：顶栏一键切换' },
    ],
  },
  {
    key: 'faq', chip: '❓ 常见问题', title: '常见问题',
    qa: [
      { q: '地图上有些站点没显示？', a: '添加/编辑行程时在「地点」框搜索一次即可定位' },
      { q: 'AI 生成很慢？', a: '正常需 20~60 秒（复杂行程更久），界面有进度提示' },
      { q: '忘了密码？', a: '暂不支持自助找回，可重新注册（数据不互通）' },
      { q: '想删掉整个旅程？', a: '发起人在「成员」页操作解散' },
      { q: '线上访问偶尔提示休眠？', a: '免费托管闲置会休眠，点「唤醒并继续」等 10~30 秒即可；用前可运行 node scripts/keepalive.mjs 保活' },
    ],
  },
];

export default function UsageGuideModal({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState(SECTIONS[0].key);
  const sec = SECTIONS.find(s => s.key === cat) || SECTIONS[0];

  return (
    <Modal title="📖 使用说明" onClose={onClose} width={640}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {SECTIONS.map(s => (
          <button key={s.key} className={'chip' + (cat === s.key ? ' on' : '')} onClick={() => setCat(s.key)}>{s.chip}</button>
        ))}
      </div>
      <div className="ug-body">
        <h4 className="ug-title">{sec.title}</h4>
        {sec.intro && <p className="ug-intro">{sec.intro}</p>}
        {sec.points && (
          <ul className="ug-list">
            {sec.points.map((p, i) => (
              <li key={i}>{p.lead ? <b>{p.lead}：</b> : null}{p.text}</li>
            ))}
          </ul>
        )}
        {sec.qa && (
          <div className="ug-qa">
            {sec.qa.map((x, i) => (
              <p key={i} style={{ margin: '6px 0' }}><b>{x.q}</b><br />{x.a}</p>
            ))}
          </div>
        )}
        {sec.imgs?.map(im => (
          <div key={im.src}>
            <img className="ug-img" src={im.src} alt={im.cap} loading="lazy" />
            <p className="ug-cap">{im.cap}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
