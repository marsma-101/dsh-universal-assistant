# dsh-universal-assistant

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web GUI 用的**自定义智能体设定台**。

DSH 自带的 preset 界面只做三件事：新建会话时选 preset、会话标题显示当前 preset、设置里列出名单（复制 / 打开目录 / 删除）。它的 README 明确写着「**浏览器不编辑任何组装文本**」——也就是说，你没有地方去看和改一个智能体的人格文件、记忆文件、挂载了哪些工具与技能。

这个插件补上这一块，并把「一个智能体」变成人能直接读写的文件。

## 它做什么

**界面**（左栏「智能体设定」）：

- 在**左侧边栏**加一个原生入口（展开时一行、收起时一个图标，两态由外壳接管）
- 列出本机**所有自定义智能体**，显示工具行数、有无 SOUL
- 点卡片弹出设定窗，按标签页查看 / 编辑：
  - `SOUL.md` / `USER.md` / `AGENT.md` / `MEMORY.md` —— **可编辑保存，改完下一轮对话就生效**
  - `能力包` —— 勾选这个智能体要挂哪些工具能力（保存前会真的挂载一次，失败自动回滚）
  - `agent.cordis.yml` / `preset.yml` —— 只读
  - `记忆目录` —— `memory/` 下的文件列表
- 标题**左侧**是「← 返回会话」，与记忆系统同位置同款式（chevron + 文字，栏窄时只留箭头），
  动作是 `ctx.layout.selectPanel(null)`
- **不显示、也不改动系统自带的四个模式**（标准 / PTC / 极简 / 创造）

**给智能体用的工具**（`dsh-universal-assistant/forge`）：

- `agent_catalog` —— 看能挂哪些能力包、本机有哪些技能
- `agent_list` —— 列出现有自定义智能体
- `agent_create` —— **造一个新智能体**：写档案、生成组装，**并在工具内部跑挂载校验**，
  不通过直接报错，不会留下一个坏 preset

装上并把 `forge` 行挂给某个智能体，它就能给自己造同事了。

## 它不做什么

- 不碰系统自带的四个 preset
- 不改 DSH 自身的界面（不替换、不遮挡任何内置槽位）
- 不提供 per-agent 私有技能目录（技能根是全局的，本机所有智能体本来就能加载所有技能）

## 智能体档案（文件模型）

一个自定义智能体 = 一个 preset 目录，里面是人能直接读写的文件：

```
.agent-presets/<id>/
  agent.cordis.yml   组装（挂哪些行）
  preset.yml         显示名 / 描述 / 排序
  SOUL.md            是谁、怎么说话、底线
  AGENT.md           职责与工具治理
  USER.md            关于主子
  MEMORY.md          积累的记忆
```

**这些文件是给智能体看的**，所以里面只写它需要知道的。不要写同步日期、来源、"从哪儿移植过来"这类给人看的维护信息——那会分散它的注意力，是提示词污染。

四个 `.md` 按 `SOUL → AGENT → USER → MEMORY` 的顺序拼成人格，**缺哪个就跳过哪个**（新智能体可以只有一份 `SOUL.md`）。

### 两种读取方式

| | 装配时读（`!!js`，当前采用） | 每轮读（`dsh-universal-assistant/persona`） |
|---|---|---|
| 怎么接 | preset 的 `persona.prefix` 用 `!!js` 读文件 | 把 `persona` 行换成 `name: 'dsh-universal-assistant/persona'`，并配 `dir` |
| 改完 `.md` | 需要重启 profile | **下一步就生效** |
| 额外依赖 | 无 | 需要本插件 |

本插件导出 `./persona` 供第二种方式使用：它注册的是**函数值**的 `deployment:persona-prefix` 段——`dsh-system-prompt` 每次装配都会重新求值，所以改了文件下一轮就是新的。

> 切换成第二种需要**重启一次 profile**。Node 会缓存 `package.json` 的 `exports`，新加的子路径导出对已经在跑的进程不可见——没重启就切会报
> `Package subpath './persona' is not defined by "exports"`。

## 安装

本仓库自带**离线**安装脚本（不需要联网，不需要 `pnpm install`）：

```sh
node scripts/install.mjs                      # 只读校验，不改动任何东西
node scripts/install.mjs --apply              # 执行安装（默认 profile: web）
node scripts/install.mjs --profile <name> --apply
```

它做三件事：

1. **校验本包** —— `dsh.bundle.patch` / `dsh.client.platform` 是否声明、客户端 bundle 是否**已构建**（缺失会失败）、bundle patch 是否是**恰好一条** plain insert、host 半是否导出 `apply()`。
2. 在 `<DSH_HOME>/profiles/<profile>/node_modules/` 建一个 **junction** 指向本仓库（Windows 上不需要管理员权限）。
3. 更新该 profile 的 `package.json`：加 `dependencies["dsh-universal-assistant"] = "link:<本仓库>"`，并把包名追加进 `dsh.profile.bundles`。

安装后**重载 Web GUI**；若侧边栏入口没出现，重启一次 profile。

手动装也可以——把上面第 2、3 步自己做一遍即可。想卸载就删掉 junction、从 `package.json` 的两处移除该名字。

## 架构

| 文件 | 角色 |
|---|---|
| `index.js` | Host 半：在 `ctx.webServer` 上注册 `/universal-assistant-api` 前缀路由 |
| `lib/client.js` | Client 半：已构建的浏览器 bundle（`window.__ModuleLoader__` 工厂格式） |
| `cordis.patch.yml` | 把 `universal-assistant` 这一行插进 profile 的组合树 |

**为什么用 HTTP 路由而不是 typert `@Remote`**：这是插件私有的 UI 桥，不需要跨插件契约、不需要生成 wire schema、不需要注册进 gateway。一条前缀路由是能跑通的最小实现，也让插件保持自包含。

**Host 半** 复用 `ctx.agentPresets` 名单（它才知道 trust 与组装文件的绝对路径），因此：

- 只列 `trust === 'user'` 的 preset —— 系统那四个天然被排除
- 文档文件（`SOUL.md` / `USER.md` / `AGENT.md` / `MEMORY.md`）可编辑保存
- 组装文件（`agent.cordis.yml`）**不直接编辑**，而是通过「能力包」勾选重新生成；
  保存前会用 `standingKeyFor` 真的挂载一次，失败就把旧组装写回去

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/universal-assistant-api/agents` | 自定义智能体列表 |
| `GET` | `/universal-assistant-api/agent?id=<id>` | 单个智能体的文件、memory 目录、已挂能力 |
| `POST` | `/universal-assistant-api/agent` | 写入一个文档文件（`{id, file, content}`） |
| `GET` | `/universal-assistant-api/catalog` | 可挂的能力包 + 本机技能 |
| `POST` | `/universal-assistant-api/capabilities` | 按能力包重新生成组装（`{id, capabilities}`），校验失败自动回滚 |

## 关于样式

侧边栏入口走的是正规槽位 `sidebar.panellist`，它给出的 owner props 是：

```ts
interface SidebarPanelIconOwnerProps { size: number; active: boolean }
```

`size` 对应侧边栏当前态、`active` 对应选中态，**收起/展开由外壳处理**——不需要像某些插件那样去 `querySelector` 侧边栏节点、自己判断 `[data-sidebar-collapsed]`。配色一律用产品自己的设计变量（`--dsw-alias-*`），所以外观天然一体，且会跟着产品主题走。

## 许可

Apache-2.0
