# 日程记事本工具 · GitHub 上传指南

> 对象：`C:/Users/刘涛/Desktop/研一上/记事本工具`
> 技术栈：原生 HTML / CSS / JavaScript 前端 + Node.js 原生 `http` 后端（**零 npm 依赖**），DeepSeek API 代理
> 当前状态：本地可运行（`node server.js` → http://127.0.0.1:5173），**尚未初始化 Git 仓库**

上传前先确认三件事，它们决定了下面所有清单的取舍：

| 判断 | 本项目实际情况 | 影响 |
| --- | --- | --- |
| 源码里有没有硬编码密钥？ | 没有。密钥只存在于浏览器 `localStorage` 和服务端环境变量 `DEEPSEEK_API_KEY` | 仓库可以放心公开 |
| 有没有依赖缓存 / 构建产物？ | 没有 `node_modules`，没有 `dist/`、`build/` | 仓库极小（约 130 KB），`git add` 不会拖入垃圾文件 |
| 有没有本地私有数据？ | 有 `.workbuddy/`（会话记忆与工作日志） | **必须排除**，否则会把本地笔记一并公开 |

---

## 1. 上传内容清单

### 1.1 应当纳入 Git 仓库

| 路径 | 类别 | 用途 / 为什么必须进仓库 |
| --- | --- | --- |
| `server.js` | 源代码（后端） | 唯一的服务端文件：静态托管 + `/api/extract` 代理 DeepSeek + 字段二次校验。缺了它前端无法运行 |
| `public/index.html` | 源代码（页面骨架） | 顶栏、周表格、侧栏搜索卡、三个弹窗的 DOM 结构 |
| `public/styles.css` | 源代码（样式） | 全部视觉：浅色主题、周表格布局、优先级色板、响应式断点 |
| `public/app.js` | 源代码（交互） | 渲染、弹窗控制、搜索触发、AI 提取请求编排 |
| `public/core.js` | 源代码（纯逻辑） | 日期换算、本地兜底解析、便签格式化、`sortEvents` / `filterEvents` / `highlightHTML`。被浏览器和测试同时引用，**属于核心资产** |
| `test/core.test.js` | 测试 | 21 项单元测试，`npm test` 即可跑。有测试的项目才敢让人 clone 后改 |
| `package.json` | 依赖清单 / 元信息 | 声明 `name`、`engines.node >= 18`、`start` / `test` 脚本。即使零依赖也不能少——它是「怎么启动这个项目」的唯一权威说明 |
| `README.md` | 说明文档 | 陌生人打开仓库后第一眼看到的东西，见第 4.1 节的章节建议 |
| `start.bat` | 启动脚本（Windows） | 双击启动并自动打开浏览器。若想更跨平台，可在 README 里注明 macOS/Linux 用 `node server.js` |
| `.gitignore` ⭐ 建议新建 | 配置文件 | 见第 4.2 节。**必须在第一次 `git add` 之前创建** |
| `LICENSE` ⭐ 建议新建 | 许可证 | 不写许可证＝默认保留所有权利，别人不能合法复用。见第 4.3 节 |
| `.env.example` ○ 可选 | 配置样例 | 只有 4 个环境变量，用 README 表格说明也够；若加，必须只写占位值（`DEEPSEEK_API_KEY=sk-your-key-here`） |
| `docs/` 目录 ○ 可选 | 静态资源 | 放 README 要引用的界面截图（周视图、搜索、今日日程各一张）。截图属于文档资产，应该入库 |

> ⭐ = 目前还没有，建议随首次提交一起补上；○ = 视需要。

### 1.2 不应上传的文件与目录

| 路径 / 模式 | 类别 | 不应上传的原因 | 若上传的后果 |
| --- | --- | --- | --- |
| `.workbuddy/` | 本地工作区数据 | AI 助手的工作目录：`memory/2026-10-31.md` 里有你的取舍记录、踩坑笔记、甚至项目背景 | 私人笔记被公开；且内容随时变动，产生无意义的提交噪音 |
| `node_modules/` | 依赖缓存 | 本项目当前**不存在**，但一旦将来引入依赖就会生成 | 体积暴涨（动辄几万文件），且可由 `package.json` 还原 |
| `.env`、`.env.local` | 本地环境配置 | 放 `DEEPSEEK_API_KEY`、自定义 `PORT` 的正确位置 | **密钥泄露**。GitHub 上公开仓库的密钥分钟级就会被爬虫抓走 |
| 任何 `sk-` 开头的字符串 | 密钥 / 令牌 | 本项目源码中本就没有；风险点在于误粘到 README、commit message、issue 或截图里 | 同上；且**删掉文件也不够**，密钥留在 git 历史里仍可被检出，必须去 DeepSeek 后台吊销重建 |
| `.shots/` | 临时验收产物 | 我之前做无头浏览器截图时生成的目录（已删除，但可能再次出现） | 一堆无关 png 污染仓库 |
| `*.log`、`npm-debug.log*` | 运行时日志 | 本地调试产生，含时间戳与路径，无复用价值 | 噪音 + 可能泄露本地绝对路径 |
| `dist/`、`build/` | 构建产物 | 本项目**无构建步骤**，留作规则占位 | 生成物与源码不一致，review 时无法判断改了哪里 |
| `.vscode/`、`.idea/` | 编辑器配置 | 个人设置（主题、字体、调试配置） | 团队协作时互相覆盖 |
| `.DS_Store`、`Thumbs.db`、`desktop.ini` | 系统文件 | macOS / Windows 自动生成 | 无意义二进制文件 |
| `*.tmp`、`*.bak`、`*~` | 临时与备份 | 编辑过程中的中间态 | 噪音 |
| `package-lock.json` | 依赖锁文件 | ⚠️ **反例提醒**：这个文件**将来必须提交**，不要写进 `.gitignore`。它锁定版本，保证别人装出和你一样的环境 | 依赖版本漂移，出现「我这里能跑」的问题 |

### 1.3 提交前自查（两条命令）

```bash
# 1) 看即将提交的文件清单，肉眼过一遍
git status --short

# 2) 全仓库扫一遍疑似密钥（Git Bash 下可直接运行）
grep -rniE "sk-[a-zA-Z0-9]{16,}" --include="*.js" --include="*.json" --include="*.md" --include="*.html" .
```

第 2 条应**没有任何输出**。若出现结果，先删掉那行内容再提交；如果已经 push 过，请立刻去 DeepSeek 控制台吊销该 Key 并重建。

---

## 2. GitHub 仓库各填写项说明

### 2.1 仓库名称（Repository name）

命名规则：全小写、用连字符、不含中文与空格、见名知意。建议与 `package.json` 里的 `"name"` 保持一致，避免「仓库叫一个名、包叫另一个名」的混乱。

| 候选 | 评价 |
| --- | --- |
| `week-schedule-deepseek` | ✅ **首选**，与 `package.json` 的 `name` 完全一致，风格贴近 npm 包名 |
| `deepseek-schedule-tool` | 可以，突出「DeepSeek + 工具」 |
| `schedule-week-view` | 可以，突出「周视图」这一视觉特征，但看不出 AI |
| `日程记事本` / `week schedule` | ❌ 中文名会让 clone URL 变成一长串百分号编码；空格会被 GitHub 自动转成 `-`，容易和本地目录名对不上 |

新建时填 `week-schedule-deepseek`，最终 URL 形如 `https://github.com/<你的用户名>/week-schedule-deepseek`。

### 2.2 Description（简介）

GitHub 的 Description 会出现在仓库卡片、搜索结果和社交分享卡片上，建议一句话讲清「是什么 + 靠什么 + 有什么」。三条可选：

**英文（推荐，便于被搜索结果命中）**
```
A zero-dependency weekly schedule tool powered by DeepSeek: turn one sentence into structured events, with week grid, priority tags, full-text search and a today-agenda modal.
```

**中文（面向中文读者）**
```
接入 DeepSeek 的周视图日程小工具：一句话生成结构化日程，支持优先级标注、全量搜索与今日日程弹窗。零 npm 依赖，Node 原生实现。
```

**极简版（放不下时用）**
```
DeepSeek 驱动的周视图日程工具 · 自然语言 → 结构化日程 · 零依赖
```

顺手在仓库右侧 **Topics** 里加：`deepseek`、`llm`、`schedule`、`calendar`、`vanilla-javascript`、`nodejs`、`zero-dependency`、`json-mode`。这比 Description 更容易被检索到。

### 2.3 可见性（Public / Private）

| 选项 | 建议 | 判断依据 |
| --- | --- | --- |
| **Public** | ✅ 推荐 | 源码里没有密钥、没有内网地址、没有个人信息。公开能换来：作品集展示、别人提 issue、GitHub Actions 免费额度。作为简历里的项目链接也更合适 |
| **Private** | 备选 | 适用情形：① 你打算把真实 `DEEPSEEK_API_KEY` 写进某个配置文件（不推荐，但如果你打算这么做就选私有）；② 后续要接入校内系统或未公开数据；③ 纯粹不想被人看到过程。私有仓库同样可以随时在 Settings → Danger Zone 改成公开 |

⚠️ 两个和本项目强相关的提醒：

1. **公开 ≠ 能在线试用**。这个工具需要 Node 进程做 API 代理，**GitHub Pages 只能托管静态站点，跑不起来**。想给简历配个在线 demo，得用 Render / Railway / Zeabur 这类支持 Node 的平台，并在平台的环境变量里配 `DEEPSEEK_API_KEY`（**永远不要提交到仓库**）。
2. 选 Private 时，README 里的截图和演示链接同样要检查一遍，别把含密钥的设置弹窗截进去。

### 2.4 初始化选项（Initialize this repository with）

创建仓库页面下方有三个勾选框，**建议全部不勾**：

| 选项 | 建议 | 理由 |
| --- | --- | --- |
| **Add a README file** | ❌ 不勾 | 本地已有 9 KB 的 `README.md`。勾了会在远端生成一个只有标题的 README，本地 push 时直接报 `rejected (fetch first)`——因为远端已有本地没有的提交。要么 `git pull --allow-unrelated-histories` 处理无关历史，要么 `git push -f` 覆盖（危险）。**不勾最省事** |
| **Add .gitignore** | ❌ 不勾（推荐自己在本地写） | 模板里选 **Node** 会生成一个通用 Node 规则，但**它不含 `.workbuddy/`、`.shots/`**，正是本项目最需要排除的两项。与其勾完再补，不如直接放第 4.2 节那份定制版 |
| **Choose a license** | 可勾 MIT，或留空 | 选 MIT 会生成 `LICENSE` 文件并自动出现在仓库首页。若想自己写版权人信息（用中文名还是 GitHub ID），留空、之后本地 `git add LICENSE` 也是一样的效果。详见 4.3 |

一句话版本：**三个都不勾**，所有内容从本地推上去，远端仓库保持空白。

---

## 3. 上传操作步骤

以下命令在 Git Bash（Windows）中执行，工作目录为项目根目录：

```bash
cd "C:/Users/刘涛/Desktop/研一上/记事本工具"
```

### 步骤 1：先补 `.gitignore`，再动 Git

> 一句话：这一步不产生任何提交，但它决定了后面 `git add` 会不会把不该传的东西装进仓库。**顺序一旦反了，不是配置不生效，而是配置对该文件永久失效。**

这一步只有两个动作：① 在项目根目录建 `.gitignore`；② 确认 Git 版本够新。两个动作都不涉及版本历史，做完随时可以反悔。

#### 1.1 为什么它必须排在 `git add` 之前

`.gitignore` 的工作方式是**过滤**，不是**删除**。Git 只在「决定要不要把一个新文件纳入跟踪」的那一刻查这份清单。三条机制串起来就是结论：

1. `.gitignore` 只被查询于「加入跟踪」这个动作；对已经在索引（index / 暂存区）里的文件，它不再被查询；
2. Git 的判定优先级是 **已跟踪 > `.gitignore`**，所以文件一旦进过索引，之后写什么规则都会被无视；
3. 因此顺序反了不是「规则写错」，而是「规则对这几个文件失效」，只能手动把它们从索引里拽出来；而如果已经推送过，GitHub 的旧提交里仍然留着完整副本。

三种时序的实际后果：

| 时序 | 补规则时 `.workbuddy/` 的状态 | 补规则后的效果 | 结局 |
|---|---|---|---|
| ✅ 先写规则 → 再 `git add` | untracked（未跟踪） | 规则生效，压根不进暂存区 | 干净 |
| ❌ 先 `git add .` → 再写规则 | staged（已暂存） | **规则被无视**，文件仍在暂存区 | 需 `git rm --cached` 补救 |
| ❌ 同上，且已 `git push` | tracked（已跟踪） | **规则永久被无视** | 历史里有副本，只能洗历史或删库重建 |

第三行是真正要避免的：`git rm --cached` 只能让**以后**不再跟踪，**翻不到**的是已经被推上去的那几个 commit。公开仓库的访客只要点进 Commits 就能看到。

#### 1.2 本项目到底在防什么（实测）

跑一遍看真实体积：

```bash
find .workbuddy -type f
```

本机输出只有一行：

```
.workbuddy/memory/2026-10-31.md
```

单个文件 **3364 字节**。体积可以忽略，但它装的是这个项目的取舍记录、踩坑笔记和你本人的背景片段——属于「传上去也不会报错，但传上去就不合适」的那类内容。用 1 行规则换掉这个风险，没有任何犹豫的必要。

需要注意：GitHub 建仓时若勾选 `.gitignore` 模板并选 **Node**，生成的规则集**不含** `.workbuddy/`、`.shots/`、`secrets.json` 这三条——它们都是本项目/本机专属，任何通用模板都不会预置。这就是第 2 章建议「三个初始化选项全不勾」的直接原因。

#### 1.3 创建 `.gitignore`

三选一：

```bash
# 方式 A：VS Code（推荐，能直观确认编码）
code .gitignore

# 方式 B：记事本（不依赖 VS Code）
notepad .gitignore
```

方式 C：直接把第 4.2 节的代码块整段存成项目根目录下的 `.gitignore`。

> **Windows 专属提醒**：不要在资源管理器里「右键 → 新建 → 文本文档」再改名。资源管理器不允许以点开头的文件名，会提示「必须键入文件名」而建不出来。用上面任一方式都可以。

关于编码：保持 **UTF-8** 即可，但**不必纠结 BOM**。我实测过 Git 2.55：`.gitignore` 开头带 BOM（`EF BB BF`）时，Git 会自行剥离，规则照常生效（`git check-ignore -v` 仍能正确匹配到行号）。网上不少教程把 BOM 说成「会让第一条规则失效」，在这个版本上并不成立。

#### 1.4 确认 Git 版本

```bash
git --version
```

**为什么要查**：`git init -b <branch>` 里的 `-b` 参数是 **Git 2.28.0（2020 年 7 月）** 才加入的。低于此版本会报 `error: unknown switch 'b'`，得退回「`git init` + `git branch -M main`」两步写法（第 2 步已给出）。

**怎么读版本号**：本机实测输出 `git 2.55.0.windows.3`。`2.55.0` 是 Git 本体版本，`.windows.3` 是 Git for Windows 发行包的第 3 次修订，不影响功能判断。**2.55 > 2.28，`-b main` 可用，后面的命令直接照抄。**

若提示 `git: command not found`，说明 Git 没装或没进 PATH，去 git-scm.com 安装 Git for Windows 后重开终端。

#### 1.5 建好仓库后的 60 秒验证

`git init` 属于第 2 步，但它同时也是验证 `.gitignore` 的前提（没有 `.git` 目录就跑不了 `check-ignore`）。所以这两步现实中是连着做的，这里一次做完：

```bash
git init -b main        # 只生成 .git/，不改动任何源码
git status --short
```

同构环境下的实测输出（`??` 表示未跟踪）：

```
?? .gitignore
?? GITHUB_GUIDE.md
?? README.md
?? package.json
?? public/
?? server.js
?? start.bat
?? test/
```

**判据：`.workbuddy/` 和 `.env` 必须不在这份清单里。** 作为对照，如果先删掉 `.gitignore` 再跑，清单会多出两行 `?? .env` 与 `?? .workbuddy/`——那正是要避免的情形。

想确认某条具体规则真的命中了，用 `git check-ignore -v`（`-v` 会回显命中的文件名与行号，排错时非常有用）：

```bash
git check-ignore -v .workbuddy/memory/2026-10-31.md
```

实测输出：

```
.gitignore:16:.workbuddy/	.workbuddy/memory/2026-10-31.md
```

读法：`.gitignore` 第 16 行的 `.workbuddy/` 规则，挡住了这个文件。**没有任何输出**就说明规则没生效（检查路径写法、是否少了结尾的 `/`、文件是否真在根目录）；若报 `fatal: not a git repository`，说明当前目录不是项目根目录，先 `cd` 回来。

> 修好后建议顺手反向确认一次「**没有误伤源码**」：对 `server.js`、`public/app.js` 这类必须提交的文件跑同一条命令，**应该是完全没输出的**。本机实测 11 个待提交文件全部通过、无一被忽略。

> 附带说明：`git add` 时若刷出 `warning: in the working copy of 'xxx', LF will be replaced by CRLF`，那是 Windows 换行符转换提示，**无害**，不影响提交。想彻底消掉可加 `.gitattributes`（见 4.2 节末尾）。

#### 1.6 万一顺序真的反了：补救三步

假设已经 `git add .`，`.workbuddy/` 进了暂存区，此时补上 `.gitignore`。`git status --short` 会显示：

```
A  .workbuddy/memory/2026-10-31.md    ← 已经暂存，规则管不了它
A  README.md
?? .gitignore                         ← 规则文件自己还是未跟踪
```

补救：

```bash
git rm -r --cached .workbuddy          # 只从索引移除，磁盘文件不动
git commit -m "chore: stop tracking .workbuddy"
```

`--cached` 是这条命令的全部关键：

| 命令 | 磁盘上的文件 | Git 索引 | 适用场景 |
| --- | --- | --- | --- |
| `git rm -r --cached .workbuddy` | ✅ 原封不动 | ❌ 移出 | **本场景唯一正确写法** |
| `git rm -r .workbuddy` | ❌ **直接从磁盘删除** | ❌ 移出 | 真的要删文件时 |

在个人目录下把 `--cached` 漏掉，等于让 Git 顺手删掉你的笔记——这是这个操作唯一的实质性风险。

一个容易误判的细节：执行后该路径会从 `git status` 里**彻底消失**，而不是变成 `?? .workbuddy/`。因为此刻它已被忽略，Git 不再把它当候选文件展示。**看不到不等于没成功**，用 `ls .workbuddy/memory/` 确认文件还在即可。

如果此时**还没提交过**（只是 `git add`），有更轻的解法：`git reset` 清空暂存区，然后直接 `git add -A` 重来。

> 但请记住 1.1 的最后一条：以上补救**只在 `git push` 之前成立**。已经推上去的提交仍在远端历史里，彻底清理需要 `git filter-repo` 重写历史后强推，或者删库重建。事前 30 秒，省掉事后半小时。

#### 1.7 本步骤收尾检查表

- [ ] `.gitignore` 已在项目根目录，与 `server.js`、`package.json` 同级（不是放在 `public/` 里）
- [ ] 至少包含 `.workbuddy/`、`.env`、`*.log`、`node_modules/`
- [ ] `git status --short` 输出中没有 `.workbuddy/`、`.env`、`.shots/`
- [ ] `git check-ignore -v .workbuddy/memory/2026-10-31.md` 有输出且指向 `.gitignore` 对应行
- [ ] `git --version` ≥ 2.28（低于则第 2 步改用 `git branch -M main`）
- [ ] 没有忽略 `package-lock.json`（将来出现时必须提交）

### 步骤 2：初始化仓库

```bash
git init -b main
```

> 如果你按 1.5 节的验证流程已经执行过这一条，**这里跳过即可**（`git init` 是幂等的，重复执行不会破坏任何东西，只是重新提示 `Reinitialized existing Git repository`）。

**作用**：在当前目录生成 `.git/`，把这里变成 Git 仓库，并把默认分支命名为 `main`。
**注意**：
- 不加 `-b main` 时，老版本 Git 会默认创建 `master`，之后推到 GitHub 会出现「远端默认分支是 main、本地是 master」的分叉情况；
- 若你的 Git 版本低于 2.28，改用 `git init` + `git branch -M main`；
- 初始化后如果想反悔，删掉 `.git/` 目录即可（**只会删版本历史，不动源码**）。

如果是第一次在本机用 Git，先补身份信息（只需一次，`--global` 对全部仓库生效）：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的GitHub注册邮箱"
```

> 邮箱建议用 GitHub 账号的邮箱（或 Settings → Emails 里的 `@users.noreply.github.com` 隐私地址），这样提交才能关联到你的头像和贡献图。

Windows 上还建议加一条，避免每次提交刷一堆 `LF will be replaced by CRLF` 警告：

```bash
git config --global core.autocrlf true
```

### 步骤 3：暂存并核对

```bash
git add -A
git status --short
```

**作用**：把工作区改动放进暂存区，`-A` 表示包含新增、修改、删除。
**注意**：这一步之后**必须**看一眼 `git status --short` 的输出。期望看到的是：

```
A  .gitignore
A  README.md
A  package.json
A  public/app.js
A  public/core.js
A  public/index.html
A  public/styles.css
A  server.js
A  start.bat
A  test/core.test.js
```

如果出现了 `.workbuddy/`、`.env`、`.shots/`——**立刻停下**，回去检查 `.gitignore`，用 `git rm -r --cached <路径>` 撤出暂存区后再继续。

### 步骤 4：首次提交

```bash
git commit -m "feat: DeepSeek 驱动的周视图日程工具（AI 提取 / 优先级 / 搜索 / 今日日程）"
```

**作用**：把暂存区固化成第一个版本快照。
**注意**：提交信息建议用「类型: 描述」的格式（`feat` / `fix` / `docs` / `refactor` / `test` / `chore`），第一行控制在 50 字以内。**不要**在 commit message 里粘贴密钥、内网地址、个人手机号。

### 步骤 5：在 GitHub 创建空仓库

浏览器打开 https://github.com/new ：

- **Repository name**：`week-schedule-deepseek`
- **Description**：从 2.2 节里选一条粘进去
- **Public / Private**：按 2.3 节判断，一般选 Public
- **Add a README / .gitignore / license**：**三个都不勾**（见 2.4）
- 点 **Create repository**

创建后会看到一个「Quick setup」页面，上面有仓库地址，形如：

```
https://github.com/<你的用户名>/week-schedule-deepseek.git
```

### 步骤 6：关联远端并推送

```bash
git remote add origin https://github.com/<你的用户名>/week-schedule-deepseek.git
git remote -v                      # 核对地址是否填对
git push -u origin main
```

**作用**：
- `remote add origin` 给远端仓库起个别名 `origin`；
- `-u`（`--set-upstream`）把本地 `main` 和远端 `origin/main` 绑定，之后直接 `git push` 即可，不用再写分支名。

**注意**：
- GitHub **早已不支持账号密码**通过 HTTPS 推送。密码框里要填 **Personal Access Token**：GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → 勾选 `repo` 权限 → 生成后复制（只显示一次），粘贴到密码位置；
- 或者改用 SSH：`git remote add origin git@github.com:<你的用户名>/week-schedule-deepseek.git`，前提是已配置 SSH key；
- 第一次推送会弹 Windows 凭据管理器，选「记住我」可免去重复输入。

### 步骤 7：验证

```bash
git log --oneline            # 应看到一条提交
git ls-files                 # 应只有 10 个左右文件，不含 .workbuddy/
```

浏览器刷新仓库页面，确认：文件都在、README 正常渲染、首页没有出现 `node_modules`。

**建议紧接着打一个版本标签**（首个可运行版本）：

```bash
git tag -a v1.0.0 -m "首个可运行版本：AI 提取 + 周视图 + 优先级 + 搜索 + 今日日程"
git push origin v1.0.0
```

之后在仓库右侧 **Releases** → Draft a new release → 选择 `v1.0.0`，一键生成源码压缩包下载页。

### 步骤 8：日常迭代

```bash
git add -A
git commit -m "fix: 搜索清空关键词后未恢复全部列表"
git push
```

### 3.9 常见报错速查

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `fatal: not a git repository` | 不在项目目录，或忘了 `git init` | `cd` 到项目根目录后执行 `git init -b main` |
| `src refspec main does not match any` | 本地还没有提交（只 `add` 没 `commit`） | 先 `git commit`，或检查分支名是 `master` 还是 `main` |
| `remote origin already exists` | 之前配过远端 | `git remote set-url origin <新地址>`，或 `git remote remove origin` 后重加 |
| `! [rejected] main -> main (fetch first)` | 远端有本地没有的提交（多半是建仓库时勾了 README） | 推荐：`git pull origin main --allow-unrelated-histories` 解决冲突后推送；或删掉远端仓库重建（**不要**随手 `--force`） |
| `Authentication failed` | 用了账号密码，或 Token 过期/权限不足 | 改用 Personal Access Token（勾 `repo`）或 SSH |
| `LF will be replaced by CRLF` | Windows 换行符提示（警告非错误） | `git config --global core.autocrlf true` |
| `Updates were rejected because the remote contains work...` | 同 `fetch first` | 先 `git pull --rebase` 再推 |
| 推送卡住无响应 | 网络问题（GitHub 直连不稳） | 配置代理：`git config --global http.proxy http://127.0.0.1:端口`，或改用 SSH |

---

## 4. 配套文件建议

### 4.1 README 应包含的章节结构

你现在的 `README.md` 已经有 8 个章节，结构是够的。下面是「标准骨架 + 本项目对应内容 + 现状」的对照表：

| 章节 | 本项目应写什么 | 现状 |
| --- | --- | --- |
| 项目名 + 一句话简介 | 「说一句话 → 结构化日程 → 周表格 → 优先级 → 搜索 / 今日日程」 | ✅ 已有 |
| 徽章行 | 可选：`Node >= 18`、`零依赖`、`MIT License` 三个静态徽章（shields.io），一眼看出技术约束 | ❌ 建议补 |
| 界面截图 | 周视图、搜索结果、今日日程弹窗各一张，放 `docs/`，用 `![周视图](docs/week.png)` 引用 | ❌ 建议补（公开仓库有图，star 率明显更高） |
| 快速开始 | `node server.js` / 双击 `start.bat`，访问 `http://127.0.0.1:5173`，换端口 `PORT=5174 node server.js` | ✅ 已有 |
| 配置 API Key | 页面设置（存 localStorage）与 `DEEPSEEK_API_KEY` 环境变量两种方式，含三平台写法 | ✅ 已有 |
| 功能说明 | AI 提取、周视图、优先级、搜索、今日日程，各讲清规则与边界 | ✅ 已有（五节） |
| 技术栈 + 选型理由 | 为什么不做纯前端（密钥暴露 + CORS），为什么零依赖 | ✅ 已有 |
| 项目结构 | 目录树 + 每个文件的职责 | ✅ 已有 |
| 测试 | `npm test`，21 项断言覆盖哪些场景 | ✅ 已有 |
| 已知边界 | 1 小时时间槽、localStorage 不跨浏览器、搜索只匹配详情 | ✅ 已有 |
| **License** | 一节写「MIT © 2026 刘涛」，链到 `LICENSE` 文件 | ❌ **必补**（否则法律上默认「保留所有权利」） |
| 在线演示 | ⚠️ 说明 GitHub Pages 跑不了本项目（需 Node 进程），如部署到 Render 再补链接 | 视情况 |

补的顺序建议：**License > 截图 > 徽章**。前两个影响「别人能不能用、想不想用」，徽章只是好看。

### 4.2 `.gitignore` 建议覆盖的条目类型

本项目按四类覆盖即可，可直接复制为项目根目录的 `.gitignore`：

```gitignore
# ---------- 依赖（本项目当前零依赖，为将来预留） ----------
node_modules/
.pnp.*
.yarn/cache/
.yarn/install-state.gz

# ---------- 环境变量与密钥 ----------
.env
.env.*
!.env.example
*.pem
*.key
secrets.json

# ---------- 本项目 / 工具产物 ----------
.workbuddy/
.shots/
*.log
npm-debug.log*
yarn-error.log*

# ---------- 编辑器与系统文件 ----------
.vscode/*
!.vscode/extensions.json
.idea/
.DS_Store
Thumbs.db
desktop.ini

# ---------- 临时文件与构建产物（本项目无构建步骤，留作占位） ----------
*.tmp
*.bak
*~
dist/
build/
```

几点说明，都是针对这个项目容易踩的：

1. **`.workbuddy/` 这条最关键**：它是唯一真实存在的「私有数据」，里面是本地笔记。少了这条，第一次 `git add .` 就会把它带进去。
2. **不要忽略 `package-lock.json`**。现在没有依赖所以文件不存在；将来一旦 `npm install` 引入依赖，这个文件**必须提交**，否则别人还原不出同样的版本。
3. **不要用宽泛的 `*.js`、`public/*` 规则**。项目的 `public/app.js`、`core.js` 是手写源码，不是构建产物，被忽略掉整个前端就没了。只按目录/后缀精确排除。
4. **`.env.*` 后面必须跟 `!.env.example`**，否则样例文件也会被忽略——而样例文件恰恰是要给别人看「需要配哪些变量」的。
5. 可选加一个 `.gitattributes`，明确 Windows 脚本的换行符，避免 bat 在 Linux 上被改成 LF 后行为异常：

```gitattributes
* text=auto
*.bat text eol=crlf
*.sh  text eol=lf
```

### 4.3 开源许可证选择

| 许可证 | 特点 | 是否适合本项目 |
| --- | --- | --- |
| **MIT** | 最短最宽松，别人可商用、可闭源修改，只需保留版权声明 | ✅ **推荐**。一个 130 KB 的教学/作品型工具，用 MIT 让复用成本最低，也最符合「放上 GitHub 给人看」的目的 |
| **Apache-2.0** | 与 MIT 相近，但多了**专利授权**条款和「修改需说明」要求，文件更长 | 若你打算把它做成可被公司采用的基础组件，用这个更稳妥 |
| **GPL-3.0** | 传染性：任何人基于它发布的衍生作品也必须开源 | ❌ 一般不建议。会让想借鉴的人绕道，做作品集没必要 |
| 不写许可证 | 默认「保留所有权利」，别人**在法律上没有使用权** | ❌ 不建议公开仓库时留空 |

**落地三步：**

1. 在项目根目录新建 `LICENSE`（无后缀），粘贴 MIT 全文，把年份和署名替换掉：

```text
MIT License

Copyright (c) 2026 刘涛

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

2. `package.json` 里补一行许可证声明（可选但规范）：

```json
"license": "MIT"
```

3. `README.md` 末尾加一节：

```markdown
## License

[MIT](LICENSE) © 2026 刘涛
```

---

## 5. 上传前自查清单

按顺序打勾，全部通过再执行 `git push`：

- [ ] `.gitignore` 已创建，且包含 `.workbuddy/`、`.env`、`*.log`
- [ ] `git status --short` 里没有 `.workbuddy/`、`.shots/`、`.env`
- [ ] `grep -rniE "sk-[a-zA-Z0-9]{16,}" .` 没有任何输出
- [ ] README 里的截图没拍到设置弹窗中的密钥
- [ ] `node test/core.test.js` 显示「21 通过 / 0 失败」
- [ ] `node server.js` 能正常启动、页面能交互
- [ ] `LICENSE` 已添加，`README` 有 License 段落
- [ ] 仓库名与 `package.json` 的 `name` 一致
- [ ] 建仓库时**没勾** README / .gitignore / License（避免首推冲突）
- [ ] 推送成功后刷新页面，文件数与本地 `git ls-files` 一致
- [ ] 打了 `v1.0.0` 标签并在 Releases 里发布

---

**一句话路线图**：写 `.gitignore` → `git init -b main` → `git add -A` + `git status` 核对 → `git commit` → GitHub 建**空**仓库 → `git remote add origin` → `git push -u origin main` → 补 `LICENSE` / 截图 → 打 `v1.0.0`。
