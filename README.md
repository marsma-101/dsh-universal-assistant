# dsh-agent-studio

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web GUI 用的**自定义智能体设定台**。

DSH 自带的 preset 界面只做三件事：新建会话时选 preset、会话标题显示当前 preset、设置里列出名单（复制 / 打开目录 / 删除）。它的 README 明确写着「**浏览器不编辑任何组装文本**」——也就是说，你没有地方去看和改一个智能体的人格文件、记忆文件、挂载了哪些工具与技能。

这个插件补上这一块。

## 它做什么

- 在**左侧边栏**加一个原生入口「智能体设定」（展开时一行、收起时一个图标，两态由外壳接管）
- 点开中间面板，列出本机**所有自定义智能体**（萧潇 + 以后新建的），显示工具行数、有无 SOUL
- **不显示、也不改动系统自带的四个模式**（标准 / PTC / 极简 / 创造）

## 它不做什么

- 不碰系统自带的四个 preset
- 不改 DSH 自身的界面（不替换、不遮挡任何内置槽位）
- v0.1 只做**只读列表**；编辑与创建在后续版本

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
3. 更新该 profile 的 `package.json`：加 `dependencies["dsh-agent-studio"] = "link:<本仓库>"`，并把包名追加进 `dsh.profile.bundles`。

安装后**重载 Web GUI**；若侧边栏入口没出现，重启一次 profile。

手动装也可以——把上面第 2、3 步自己做一遍即可。想卸载就删掉 junction、从 `package.json` 的两处移除该名字。

## 架构

| 文件 | 角色 |
|---|---|
| `index.js` | Host 半：在 `ctx.webServer` 上注册 `/agent-studio-api` 前缀路由 |
| `lib/client.js` | Client 半：已构建的浏览器 bundle（`window.__ModuleLoader__` 工厂格式） |
| `cordis.patch.yml` | 把 `agent-studio` 这一行插进 profile 的组合树 |

**为什么用 HTTP 路由而不是 typert `@Remote`**：这是插件私有的 UI 桥，不需要跨插件契约、不需要生成 wire schema、不需要注册进 gateway。一条前缀路由是能跑通的最小实现，也让插件保持自包含。

**Host 半** 复用 `ctx.agentPresets` 名单（它才知道 trust 与组装文件的绝对路径），因此：

- 只列 `trust === 'user'` 的 preset —— 系统那四个天然被排除
- 只允许写 `SOUL.md` / `USER.md` / `AGENT.md` / `MEMORY.md`
- **不允许**从界面改 `agent.cordis.yml`：组装写坏会让 preset 挂载失败，这一步要单独验证后再开

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/agent-studio-api/agents` | 自定义智能体列表 |
| `GET` | `/agent-studio-api/agent?id=<id>` | 单个智能体的文件内容与 memory 目录 |
| `POST` | `/agent-studio-api/agent` | 写入一个文档文件（`{id, file, content}`） |

## 关于样式

侧边栏入口走的是正规槽位 `sidebar.panellist`，它给出的 owner props 是：

```ts
interface SidebarPanelIconOwnerProps { size: number; active: boolean }
```

`size` 对应侧边栏当前态、`active` 对应选中态，**收起/展开由外壳处理**——不需要像某些插件那样去 `querySelector` 侧边栏节点、自己判断 `[data-sidebar-collapsed]`。配色一律用产品自己的设计变量（`--dsw-alias-*`），所以外观天然一体，且会跟着产品主题走。

## 许可

MIT
