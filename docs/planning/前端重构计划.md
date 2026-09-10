> **历史记录：已被替代。** 本文为早期「文字驱动」方案，保留供追溯。当前首页目标以[前端优化计划](前端优化计划.md)及[动效设计规范](frontend-motion-design.md)为准；本文颜色、密度与动效约束不再作为首页实施依据。

---
name: Empact China — 文字驱动
version: alpha
# 用户已确认方向；以下具体尺寸为样张设计值或响应式实现建议，并非品牌手册认证值。
description: 大面积 Logo 蓝、哲学大字、红绿点缀，以紧凑的信息组织连接青少年实践与企业服务。
colors:
  primary: "#085A88" # 量得 — 本地 empact-logo-blue.png 主要蓝色像素；已选样张主背景。
  on-primary: "#FFFFFF" # 我们定的 — 已选样张反白文字与导航底色。
  accent-green: "#29B7B9" # 量得 — 同一 Logo 的主要青绿色像素；装饰用。
  accent-red: "#F06172" # 量得 — 同一 Logo 的主要红色像素；装饰用。
  surface: "#F4F7F8" # 我们定的 — 已选样张表单浅色底。
  secondary-text: "#4E6979" # 我们定的 — 已选样张浅色表面上的辅助文字。
  state-surface: "#E5F0F4" # 我们定的 — 已选样张未开放状态底色。
  disabled-surface: "#D6E1E7" # 我们定的 — 已选样张禁用控件底色。
  disabled-text: "#425B6A" # 我们定的 — 样张禁用文字加深以提高可读性，保留原禁用底色。
typography:
  hero-latin:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: 6.3em # 我们定的 — 已选桌面样张上限，相对正文基准，非嵌套父标题字号。
    fontWeight: 700 # 我们定的 — 已选样张英文主标题。
    lineHeight: 0.98 # 我们定的 — 已选样张英文行高比例。
    letterSpacing: -0.045em # 我们定的 — 仅用于英文哲学大字。
  hero-latin-mobile:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: 2.6em # 我们定的 — 手机起始值；需随真实可用行宽验收。
    fontWeight: 700 # 我们定的 — 与桌面相同。
    lineHeight: 1.05 # 我们定的 — 手机标题行高比例。
    letterSpacing: -0.03em # 我们定的 — 仅英文。
  cjk-heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 2.2em # 我们定的 — 已选样张业务板块标题，相对正文。
    fontWeight: 700 # 我们定的 — 使用真实粗体档位。
    lineHeight: 1.18 # 我们定的 — 已选样张短标题，不应用于正文。
    letterSpacing: 0em # 我们定的 — 中文不沿用英文负字距。
  hero-subtitle:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 1.75em # 我们定的 — 已选样张“赋能更大的影响力”。
    fontWeight: 700 # 我们定的 — 已选样张。
    lineHeight: 1.18 # 我们定的 — 已选样张短标题比例。
    letterSpacing: 0em # 我们定的 — 中文不使用负字距。
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 1em # 我们定的 — 尊重浏览器默认字号与用户缩放。
    fontWeight: 400 # 我们定的 — 正文用正常字重，不继承按钮粗体。
    lineHeight: 1.8 # 我们定的 — 已选样张中文正文比例。
    letterSpacing: 0em # 我们定的 — 正文默认字距。
  action:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 0.95em # 我们定的 — 已选样张按钮，相对正文。
    fontWeight: 700 # 我们定的 — 将样张中间字重归入真实粗体档位。
    lineHeight: 1.5 # 我们定的 — 已选样张短标签。
    letterSpacing: 0em # 我们定的 — 中文操作标签。
  label-caps:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: 0.72em # 我们定的 — 已选样张英文装饰性眉题，不承载唯一信息。
    fontWeight: 700 # 我们定的 — 已选样张。
    lineHeight: 1.5 # 我们定的 — 已选样张比例。
    letterSpacing: 0.14em # 我们定的 — 仅短英文眉题。
rounded:
  flat: 0em # 我们定的 — 已选样张矩形按钮、表单与业务区。
  focus: 0.15em # 我们定的 — 焦点环轻微转角，不改变组件轮廓。
spacing:
  hairline: 0.065em # 我们定的 — 已选样张常规细线，相对正文。
  xs: 0.35em # 我们定的 — 已选样张短标题内部间距。
  sm: 0.7em # 我们定的 — 已选样张操作间距。
  md: 1em # 我们定的 — 基本间隔。
  lg: 1.5em # 我们定的 — 已选样张表单内边距基准。
  xl: 2em # 我们定的 — 已选样张区块纵向内边距。
  desktop-gutter: 3.25em # 我们定的 — 已选样张桌面左右边距。
  mobile-gutter: 1.1em # 我们定的 — 手机内容边距建议。
  max-content: 80em # 我们定的 — 已选桌面画布换算后的内容宽度上限建议。
  tap-target: 2.75em # 我们定的 — 手机触控最小目标尺寸，相对默认正文；不随装饰小字缩小。
components:
  accent-green-marker:
    backgroundColor: "{colors.accent-green}"
  accent-red-marker:
    backgroundColor: "{colors.accent-red}"
  page:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
  navigation:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.flat}"
    height: 4.8em # 我们定的 — 已选样张桌面导航，不强制手机同高。
  logo:
    width: 9.4em # 我们定的 — 已选样张桌面 Logo，相对正文；高度按原图比例。
  button-primary:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    typography: "{typography.action}"
    rounded: "{rounded.flat}"
    padding: 0.7em # 我们定的 — 已选样张纵向内边距；横向规则见正文。
  button-secondary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.action}"
    rounded: "{rounded.flat}"
    padding: 0.7em # 我们定的 — 已选样张纵向内边距。
  form:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.flat}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.secondary-text}"
    typography: "{typography.body}"
    rounded: "{rounded.flat}"
  unavailable-state:
    backgroundColor: "{colors.state-surface}"
    textColor: "{colors.primary}"
    padding: "{spacing.md}"
  disabled-button:
    backgroundColor: "{colors.disabled-surface}"
    textColor: "{colors.disabled-text}"
    rounded: "{rounded.flat}"
---

## Overview

手机上，经常单手；电脑前，或投在大屏上。

这是用户为 Empact China 选定的「反着来（文字驱动）」方向：以整片品牌蓝、英文哲学大字、中文业务信息和少量红绿符号构成有力度的官网。主角是 “Empowering Greater Empact”，页面要能迅速说明 Empact 做什么，并把访问者引向青少年业务或企业业务。

确认记录逐字保留：

> 【列宾 · 设计方向确认】
> 1 选择：反着来（文字驱动）
> 2 否决理由（原话）：气质不对（太嫩 / 太商务 / 太炫）
> 3 使用场景：手机上，经常单手；电脑前，或投在大屏上

“贴着做”和“取其神”未入选。用户没有分别说明两版各自对应哪一种气质问题，不得自行推断；也不把这条反馈解释为撤销刚选定的大字、品牌蓝与动态符号。

视觉基准：[已选首页](v3s1.png)、[已选业务屏](v3s2.png)、[已选咨询空状态](v3s3.png)。[三版交互样张](proof.html)保留用于追溯。三个屏幕是方向样张，并非要复制成三个固定高度页面。

本文件确认设计方向，不代表批准发布样张中的业务草稿。青少年与企业两类入口、关于 Empact、ChatCircle、咨询合作和已有的完整内容应保留；业务数据、内容审核和后台功能按现有项目规则处理。案例归入对应业务的上下文，动态等已有内容沿用统一视觉语言。

## Colors

品牌蓝是首页、业务总览和关键转场的主要背景，向左右铺满；白色用于正文、导航和必要的浅色表面。红绿仅用于箭头、星形、序号、分隔标记和状态细线。大屏加宽时，蓝色背景仍铺满，正文宽度遵守内容上限。

品牌三色来源为本地 `empact-brand-cases/apps/site/public/brand/empact-logo-blue.png` 的像素取样，不是新加坡站 CSS，也不声称是品牌手册规范值。Logo 保留原图构成与颜色，其中原有紫色仅属于标识本身。页面不用紫色主题或重新调色后的 Logo。

绿色、红色不承载白底上的小字，不单独表示业务类别或错误。蓝底正文用白色；浅色表面正文用品牌蓝。后续若需要错误、成功等语义色，应单独验证可读性，不能直接把品牌点缀色当正文颜色。

## Typography

桌面英文哲学保持 “Empowering / Greater / Empact.” 的分行关系，使用样张中的粗无衬线和细横线。标题语义可覆盖完整英文短语，中文“赋能更大的影响力”作为相邻解释。箭头、星形是独立装饰，不混进可访问名称。

YAML 的英文上限、中文标题和正文均以正文基准解释；实现中可映射为相同倍率的根字号单位，不能因父节点另有标题字号而再次乘大。英文负字距仅作用于英文大字。中文标题字距保持零，正文行高依照 token，中西文相邻时留约 0.25em（我们定的）视觉间隔；中文标点采用字体和浏览器支持的自然压缩，不在文案中手塞空格破坏复制与搜索。

手机保留同样的英文分行逻辑，但字号随实际可用行宽调整。先保证 “Empowering” 完整可见，再放置装饰符号；符号可以移到独立位置。不得裁切单词、依赖横向滚动或把整块桌面画面等比缩成小字。英文主标题之外的中文说明与操作文字维持正文可读尺度。

短标签用真实粗体档位，正文正常字重。辅助英文眉题只作层次装饰，中文标题应独立表达完整含义。大屏保持清楚的主次，不把每段正文都加粗成海报标题。

## Layout

大面积蓝色形成连续页面；白色导航条略内缩，哲学短语纵向展开，随后紧接两类业务入口。信息通过线条、字号与对齐分组，避免为制造“高级感”而拉大空白。

桌面业务与咨询采用等宽双栏，业务行紧凑排列；手机改为纵向单栏。响应式切换由导航、英文单词与两栏内容是否拥挤决定，初始断点建议为 48em（我们定的，后续需实测）。手机青少年入口和企业入口均应在相近的滚动距离内出现。

桌面沿用 token 的边距和内容宽度上限；手机使用 mobile-gutter。正文较长的详情、隐私及条款页面采用约 40em（我们定的）阅读列上限，随屏宽缩小。页面高度由内容决定，不复制样张画布的固定高度、绝对定位页脚或裁切容器。

触控目标使用 tap-target；相邻链接留足独立点击区域，列表整行可点击。手机导航使用紧凑的菜单入口，并在展开层同时呈现两类业务和咨询。电脑展开主要导航。菜单可键盘操作、有清晰关闭入口，关闭后焦点返回触发按钮；操作状态不依赖悬停。

## Elevation & Depth

已选方案依赖平面色块和细线，不依赖卡片阴影。导航、业务矩阵和表单不加浮起阴影。需要遮罩层的手机菜单以可读底色、明确边界和焦点管理区分前后层级。

保留滚动内容渐显与星形低速转动。渐显时长沿用 0.9s（我们定的，已选样张），位移不超过 1.15em（我们定的，已选样张），标题组错开 0.12s（我们定的，已选样张），列表行错开 0.08s（我们定的，已选样张）。星形完整转动周期为 10s（我们定的，已选样张）。这些是克制动效的起点，不作为必须持续吸引注意的表演。

产品实现中内容首次进入视区时渐显即可；离开视区暂停装饰动画。样张的手动重播仅用于比较，不进入官网。不得劫持滚动，不增加强制横向滚屏或巨大视差。开启减少动态效果时直接显示内容并停转；关闭或加载失败的 JavaScript 不得让正文不可见。首屏标题、业务入口和焦点中的控件不等待动画完成才能操作。

## Shapes

使用矩形按钮、浅色表单面、细横线与规整网格。默认圆角依照 flat；焦点环可使用 focus。按钮横向内边距沿用 1.2em（我们定的，已选样张），纵向内边距由 token 指定，并保证触控尺寸。

不把未选的线场、轨道图或倾斜剪贴卡片混入主构图。箭头与星形使用独立 SVG 或稳定的矢量路径实现，保留样张的笔画关系；不照抄字体字形可能产生的跨设备偏差。线宽使用统一 hairline；不得把英文巨字的相对线宽直接套到正文列表。

## Components

### 导航与首页

导航保留原 Logo、青少年业务、企业业务、关于 Empact、ChatCircle 和咨询与合作。使用已有内容对应的真实路由。首页哲学短语和中文解释先建立定位，随后用摘要与两类业务入口让用户决定去向。主按钮为白底蓝字，次按钮为蓝底白字加白色边框；悬停、按下与键盘焦点均需可见。

### 业务矩阵与详情

青少年与企业分成明确区域，每区包含中文标题、真实摘要与业务列表。序号和颜色只是辅助，不替代名称。服务列表保留项目实际存在的业务；显示数量和排序取自内容，不将样张的固定条数写死。详情页延续蓝色标题区、清晰的信息层级和紧凑阅读节奏，长文可放在浅色阅读面上。

### ChatCircle、动态与案例

ChatCircle 保留独立名称和介绍入口。案例与动态存在时采用相同的标题、分隔线、正文和标签体系，不另起一套插画或卡片风格。无可发布内容时沿用项目现有空态／隐藏规则，不编造项目成绩、合作方、年份或活动照片填满版面。

### 咨询与状态

咨询页延续“从一次交流开始”的标题与浅色表单。输入区需使用真实的 label、input、select、textarea 和 button；样张的视觉假控件不能进入生产代码。字段、同意项、提交校验、发送反馈与可用状态沿用现有业务逻辑。

样张中的未开放状态原文为“在线咨询尚未开放。联系方式确认后将在这里公布。”仅在实际条件成立时使用，不能永久写死。按钮禁用时表达原因，并保留浏览两类业务的可行路径。提交失败与成功用可见文案及可访问状态区域反馈。

### 实现验收

对照已选三个屏幕，确认主色覆盖、文字轻重、内容密度和双业务入口仍是同一方向。检查手机纵向排版、单手点击、电脑阅读与大屏显示。覆盖减少动态效果、无脚本正文、横向溢出、浏览器错误、图片比例和尺寸、正文对比度、导航键盘操作、咨询状态；现有内容与功能测试应继续通过。此处定义后续验收范围，不宣称网站实现已经完成。

## Do's and Don'ts

### 用户原话

- 「气质不对（太嫩 / 太商务 / 太炫）」——本次对未入选的“贴着做”“取其神”的总体否决；用户未细分对应关系。逐字保留。
- 「现在留白我觉得有点太多了」——初始需求中对旧站密度的反馈。逐字保留。
- 「首页有变这个图实在是太丑了」——初始需求中对旧站首页图的反馈，保留原文中的表述。逐字保留。

### 执行约束

以下为从已选方向和需求归纳的实现约束，不冒充用户新增原话：

- 保持文字主导、品牌蓝主导、红绿点缀，保留内容清晰度与两类业务入口。
- 用真实业务名称、摘要与清晰行动路径填充页面，不靠额外装饰增加密度。
- 不重新引入未选的轨道线场或剪贴式主视觉；不把全蓝海报改回大面积白底通用卡片页。
- 不把“更紧凑”落实为手机小字、过短点击区、中文负字距或难以阅读的长行。
- 不推断用户否决了所有动态；采用克制动效并尊重减少动态效果设置。

### 什么时候别用这套

长篇政策、密集表格、编辑后台和需要谨慎阅读的错误说明不使用整屏巨字节奏。保留品牌配色和字阶关系，按真实任务提供正常正文、浅色阅读面和稳定操作布局。手机端不照搬桌面双栏。没有真实图片和获准文案时，不用图库人物或虚构成绩营造可信度。

### 来源与状态

格式按 [Google Labs DESIGN.md 规范](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)组织。设计来源为本次用户确认、同目录已选样张，以及 README.md 中记录的本地品牌和内容证据。数值来源逐条标明：品牌取样为“量得”；样张设计值与响应式规则均为“我们定的”。当前文件是设计交付，网站代码尚未按此方向改造。

## 实现时的创意指令

在尊重本文件已确认的设计方向、真实内容和用户原话约束的前提下，充分发挥你的设计创造力。

开始实现前，用工具生成一串随机字母与数字，从其中的组合、节奏和联想中寻找灵感，用于尚未确定的构图、排版、色彩、图像和交互设计。随机字符串仅供创作启发，不要出现在页面中。

大胆做出具体、有个性的设计选择，尝试你通常不会首先采用的表达。需要时使用图片生成来实现关键视觉。运用你的判断，让这些选择形成一个完整、有吸引力、适合这个产品的设计。
