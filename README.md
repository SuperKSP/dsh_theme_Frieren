# dsh-client-ui-skin-frieren · 葬送的芙莉莲皮肤

DeepSeek Harness Web GUI 的 **芙莉莲主题皮肤**：羊皮纸与金线、手绘魔法阵、
魔法书角落纹饰与缓缓飘落的花瓣。纯展示层客户端插件——`apply()` 在 `<body>`
上设置 `data-dsh-frieren` 作用域，按亮/暗主题覆盖整套设计令牌（`--dsw-*`），
以独立透明层挂载魔法阵水印、四角纹饰与花瓣；`ctx.effect` 销毁器还原全部
CSS/DOM 写入。不注入服务、不发出 Cordis 事件、不触达模型请求。

灵感来源：[小黑盒帖子《哥们，这还是deepseek harness吗？》](https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?h_camp=link&h_src=YXBwX3NoYXJl&link_id=a37a724ef813&new_post_share_style=true)
展示的「Abyssal Maid Atelier」皮肤（[dsh-deep-whale / maid-atelier](https://github.com/Small-tailqwq/dsh-deep-whale)）。

## 特性

- **亮色**：暖羊皮纸底 + 柔金主色 + 鼠尾草绿点缀；**暗色**：深林墨色 + 暗金。
- **芙莉莲透明立绘（与布局联动）**：透明底角色立绘（粉丝同人插画，已抠图）。
  和整个界面布局联动——**无对话的着陆页**她放大到约 420px、位置更高更醒目；
  **进入对话后**自动缩小到约 300px、退回右下角安全区并降低透明度，不挡聊天。
  立绘静止（不浮动），身后有缓缓脉动的金色魔法辉光。
- **魔法元素全阵容**：右上角大魔法阵水印（140s 旋转）+ **左下角第二座魔法阵**
  （反向旋转）+ 四角魔法书纹饰 + **8 颗符文**（菱形魔符，上浮旋转）+ **8 颗闪烁
  星光** + **3 道流星拖尾**（偶尔划过夜空，暗含对魔法的向往）+ 16 片飘落花瓣。
  全部尊重 `prefers-reduced-motion`。
- 整套 **DSW 设计令牌覆盖**：侧栏、对话流、输入框、菜单、滚动条、选中态、
  状态色（成功=鼠尾草绿 / 警告=琥珀金 / 错误=暖红）、阴影全部换装。
- 素材全部内联（SVG / WebP data URI），激活不依赖任何临时文件、远程 URL 或资源服务器。
- 卸载即复原：所有写入都注册在 `ctx.effect` 下。

## 更换角色立绘

皮肤通过目录链接安装，换图不需要重新装插件：

```powershell
# 1. 新图放任意位置（优先选「白底/纯色底的人物图」，抠图效果最好）
# 2. 若背景不透明，先抠图生成透明底（保留最大主体、去杂点、去白边、裁边）：
node D:\harness\_plugins_src\dsh-client-ui-skin-frieren\tools\cutout.cjs <你的图.png>
#    （需要能解析到 sharp：npm i -D sharp 或先设置 $env:NODE_PATH）
# 3. 内嵌进 client bundle（建议输出已是 assets\frieren-stage.webp，宽约 860px）：
node D:\harness\_plugins_src\dsh-client-ui-skin-frieren\tools\embed-art.mjs
# 4. 重启 dsh web + 硬刷新
```

调整立绘大小/位置/透明度：`lib\client.js` 里搜 `.fr-stage` 的 CSS 即可。

## 安装

### 方式一：本地目录（推荐，本机开发版）

```powershell
dsh plugin --profile web add D:\harness\_plugins_src\dsh-client-ui-skin-frieren
```

### 方式二：tarball（与 dsh-vision-any 相同的安装模式）

```powershell
dsh plugin --profile web add D:\harness\_plugins_src\dsh-client-ui-skin-frieren-0.1.0.tgz
```

安装后**重启 dsh web**，并**硬刷新浏览器**（Ctrl+Shift+R）。
皮肤随插件加载即生效——不需要任何开关。

> 若你安装了 [dsh-skin-toggle](https://github.com/tiantyu/dsh-skin-toggle) 皮肤管理器，
> 右键 🐋 按钮即可在「默认 / 芙莉莲」之间切换（本皮肤包名符合
> `dsh-client-ui-skin-<id>` 约定，会被自动识别为 `frieren`）。

## 卸载

```powershell
dsh plugin --profile web remove dsh-client-ui-skin-frieren
```

重启 dsh web 后皮肤完全还原。

## 启用芙莉莲人设（可选，第二个彩蛋）

帖子里的插件不止是皮肤——它配了一套带 6 个子代的 Agent 人设。同目录的
`persona/` 提供：

1. **Agent 预设「芙莉莲 · 旅途魔法使」**：把 `persona/agent.cordis.yml` 与
   `persona/preset.yml` 复制到 `C:\Users\<你>\.dsh\.agent-presets\frieren\`，
   在 Web GUI 新会话的 Agent 预设里选择「芙莉莲 · 旅途魔法使」即可
   （预设是即时发现的，复制后无需重启）。
2. **六人旅团子代理**：`persona/PARTY.md` 给出 6 个可直接粘贴的子代理提示词——
   菲伦（执行）、休塔尔克（代码/命令）、海塔（计划书）、赞恩（审查）、
   克拉夫特（调研）、芙莉莲·分身（总结归档）。

## 项目结构

```
dsh-client-ui-skin-frieren/
├── package.json          # dsh.bundle.patch / dsh.client(platform=web)
├── cordis.patch.yml      # 把 ui-skin-frieren 条目插入 web 插件名册
├── skin.json             # id=frieren, bodyAttr=data-dsh-frieren
├── lib/
│   ├── index.js          # 宿主侧空入口（无行为）
│   └── client.js         # 皮肤本体：令牌覆盖 + SVG 艺术 + 生命周期
├── preview/              # 亮/暗预览图（SVG）
└── persona/              # 芙莉莲 Agent 预设 + 六人旅团子代理提示词
```

## 素材与许可

- 代码与界面装饰以 **MIT** 发布（见 `LICENSE`）。
- 皮肤内全部视觉素材（魔法阵、花瓣、纹饰）均为本皮肤原创 SVG，
  不包含任何官方《葬送的芙莉莲》画面。
- 《葬送的芙莉莲》版权归山田钟人、阿部司及相应权利人所有；本皮肤为
  粉丝向非商业作品，与官方无关联（见 `NOTICE`）。

## 开发与验证

```powershell
node --check lib\client.js        # 语法检查
node tests\smoke.test.cjs         # DOM 桩冒烟测试（apply 可运行、可清理）
```
