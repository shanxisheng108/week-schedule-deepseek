# GitHub Desktop 发布操作步骤（本项目实测版）

> 对象：`C:\Users\刘涛\Desktop\研一上\记事本工具`
> 客户端：GitHub Desktop **3.6.7**（已安装于 `C:\Users\刘涛\AppData\Local\GitHubDesktop\GitHubDesktop.exe`）
> 界面语言：GitHub Desktop 无中文版，下文所有按钮为**英文原文**，括号内为中文说明，照抄即可。

---

## 0. 开工前的状态确认（已完成，无需你操作）

| 检查项 | 实测结果 | 影响 |
| --- | --- | --- |
| 项目是否已有 `.git` | **没有** | 决定了必须走 **Publish**，不是 Push |
| 上级目录是否有嵌套仓库 | `研一上`、`Desktop`、`用户目录` 均无 `.git` | 不会误把父目录认成仓库 |
| `.gitignore` | 已就位，含 `.workbuddy/`、`.env`、`*.log` | `.workbuddy/` 不会进 Changes |
| 将被提交的文件 | **13 个**（见第 2 节；若取消勾选两份 md 则为 11） | 与预期一致 |
| GitHub 账号凭据 | 凭据管理器中已有 `GitHub - https://api.github.com/shanxisheng108` | 账号为 **shanxisheng108** |
| 提交身份 | 全局 `.gitconfig`：`shanxisheng108 <shanxisheng108@gmail.com>` | 与账号一致，提交后能点亮贡献图 |

**一个容易误解的点**：`package.json` 里的 `"private": true` 是 npm 字段（防止误发布到 npm），**与 GitHub 的 Private 可见性完全无关**。仓库要不要 Private，只看第 4 步的 `Keep this code private` 复选框。

---

## 1. 把文件夹添加为仓库

### 1.1 操作

1. 打开 GitHub Desktop（开始菜单 → GitHub Desktop）。
   若右上角显示 `Sign in`，点它用 **shanxisheng108** 登录——凭据已在系统里，通常点一下就走完授权。
2. 菜单 **File → Add Local Repository…**（快捷键 `Ctrl+O`）。
3. 在 `Local path` 填（或点 `Choose…` 选）：

   ```
   C:\Users\刘涛\Desktop\研一上\记事本工具
   ```

4. 此时窗口下方会出现红/黄色提示：

   > **This directory does not appear to be a Git repository.**
   > Would you like to **create a repository here** instead?

5. 点那句 **create a repository here** → 在确认提示里点 **Create repository**。

### 1.2 这一步到底做了什么

GitHub Desktop 在**这个文件夹内部**生成一个 `.git/` 目录，把本目录登记为仓库。

- **只新增 `.git/` 目录**，外加 GitHub Desktop 自动写的一个 `.gitattributes`（见第 2 节说明）；`server.js`、`public/`、`test/` 等源码文件**一个字节都不动**；
- 默认分支名为 `main`，与 GitHub 现在的默认一致，后面不会出现 `master`/`main` 分叉；
- `.gitignore` 已存在，Desktop 不会覆盖它。

> **版本差异兜底**：如果你的 3.6.7 点完链接后弹出的是 `Create a new repository` 表单而不是一次性确认，就按这样填——
> `Name` 保持 `记事本工具`（必须等于文件夹名，否则会新建一个空目录）；
> `Local path` 必须是 `C:\Users\刘涛\Desktop\研一上\记事本工具` 本身；
> **三个复选框（Initialize with README / .gitignore / License）全部不要勾**，勾了会往项目里塞新文件或覆盖现有 `.gitignore`。

---

## 2. 在 Changes 面板核对待提交内容

添加成功后，左侧就是 **Changes** 面板，中间列出所有"新增"文件。逐项对一遍：

| 应出现（13 项） | 类型 | 用途 |
| --- | --- | --- |
| `.gitattributes` | 配置 | **GitHub Desktop 建仓时自动生成**，内容为 `* text=auto`（换行符统一为 LF）。不是垃圾文件，正常提交 |
| `.gitignore` | 配置 | 排除规则 |
| `README.md` | 文档 | 项目说明 |
| `GITHUB_GUIDE.md` | 文档 | 上传指南（不想要可取消勾选） |
| `GITHUB_DESKTOP_操作步骤.md` | 文档 | 本文件（不想要可取消勾选） |
| `package.json` | 依赖清单 | 脚本与元信息 |
| `server.js` | 源码 | 静态服务 + DeepSeek 代理 |
| `start.bat` | 启动脚本 | 双击启动 |
| `public/index.html` | 前端 | 页面骨架 |
| `public/styles.css` | 前端 | 样式 |
| `public/core.js` | 前端 | 纯逻辑（可单测） |
| `public/app.js` | 前端 | 渲染与交互 |
| `test/core.test.js` | 测试 | 21 项单元测试 |

> **关于 `.gitattributes`（第 13 项）**：这是 GitHub Desktop 在「create a repository here」时**自己写进去的**，不是你项目里原有的文件，也不是我加的。内容仅两行：
>
> ```gitattributes
> # Auto detect text files and perform LF normalization
> * text=auto
> ```
>
> 作用是让 Git 自动识别文本文件并在仓库内统一存为 LF，避免 Windows（CRLF）与 macOS/Linux（LF）协作出出现"整文件都变了"的假 diff。**建议保留**。若想更严格地锁定批处理的换行符，可在末尾追加两行（可选）：
>
> ```gitattributes
> *.bat text eol=crlf
> *.sh  text eol=lf
> ```


**必须成立的判据**：列表里**没有** `.workbuddy/`。它是唯一含私人笔记的目录（`memory/2026-10-31.md`，3364 字节）。

- ✅ 没有 → 说明 `.gitignore` 生效，继续；
- ❌ 出现了 → 立刻停下。点 `Repository → Repository settings…` 检视，或直接在 `.gitignore` 补 `.workbuddy/` 后按 `Ctrl+R` 刷新；**不要**先 Commit，否则要么把它传上去，要么还得额外做 `git rm --cached` 补救。

若某个文件不想发布（比如这两份 md 指南），**取消它左侧的勾选**再提交，文件仍留在磁盘上，只是不进这次提交。

---

## 3. 填写提交说明并提交

1. 左下角 **Summary**（必填，单行）填：

   ```
   feat: 日程记事本 v1.0 —— DeepSeek 信息提取 + 周视图 + 搜索与今日日程
   ```

   规范是「类型前缀 + 简述」，`feat` 表示新功能；55 字以内，别写"更新""提交"这类无信息量的词。

2. 下方 **Description**（可选）填一句补充：

   ```
   原生 HTML/CSS/JS + Node 原生 http，零 npm 依赖；密钥经本地代理转发，事件存 localStorage。
   ```

3. 确认按钮文字是 **Commit to main**（若显示 `Commit to master`，说明第 1 步没建出 main 分支，先回头检查），点它。

**成功标志**：Changes 面板变空并显示 `No local changes`；顶部中间出现 **Publish repository** 按钮；点左侧 **History** 能看到 1 条记录，作者是 `shanxisheng108`。

---

## 4. 发布到 GitHub

1. 点顶部 **Publish repository**（注意：不是 `Push origin`，原因见第 6 节）。
2. 弹窗里填：

   | 字段 | 填什么 | 说明 |
   | --- | --- | --- |
   | **Name** | `week-schedule-deepseek` | 默认会是中文文件夹名「记事本工具」，URL 会被百分号编码成 `%E8%AE%B0...`，不适合放进简历。这个字段**可改**，改成与 `package.json` 的 `name` 一致 |
   | **Description** | `接入 DeepSeek API 的零依赖日程管理工具：一句话提取事件，周视图排布，支持优先级、搜索与今日日程` | 会显示在仓库页顶部 |
   | **Keep this code private** | **不勾** | 作品集/简历用途建议 Public；若暂时只想给自己看，勾上也可以，之后随时在仓库 Settings 里改可见性 |
   | **Publish using account** | `shanxisheng108` | 若显示的是别的组织，确认下拉里选的是你自己的账号 |

   > 若 `Name` 字段是灰的不可编辑（旧版本行为）：接受默认名先发布，再到网页端 `Settings → Repository name → Rename` 改名。git 会跟随重定向，Desktop 不需要改配置。

3. 点 **Publish repository** 确认。

---

## 5. 验证发布结果并取得 HTTPS 地址

1. 回到主界面，右上角原来的 `Publish repository` 按钮应变成 **`Fetch origin`**；
2. 点一次 **Fetch origin**，它会短暂变成 `Fetching origin…`，随后显示 **`Last fetched just now`** —— 这就是"已同步"状态；
3. 取 HTTPS 地址，两种方式任选：

   - **菜单 `Repository → View on GitHub`**（快捷键 `Ctrl+Shift+G`）→ 浏览器打开仓库首页 → 地址栏即远程地址；
   - **`Repository → Repository settings…` → `Remote` 标签页** → `Primary remote repository (origin)` 框内就是完整地址。

   形如：

   ```
   https://github.com/shanxisheng108/week-schedule-deepseek
   ```

   克隆用的 `.git` 后缀版本（在仓库首页绿色 `Code` 按钮里复制）：

   ```
   https://github.com/shanxisheng108/week-schedule-deepseek.git
   ```

4. 顺手验一下内容是否完整：网页端应看到 13 个文件（取消勾选两份 md 则为 11）、`public/` 与 `test/` 是目录、README 正常渲染；**不应**出现 `.workbuddy`。

---

## 6. 为什么本项目必须 Publish 而不是 Push（判断依据）

界面上的三个判断点，本项目全部指向 Publish：

| 判断点 | 位置 | 本项目实际情况 | 结论 |
| --- | --- | --- | --- |
| 有没有 `.git` 目录 | 项目根目录 | 没有 | 还没有仓库，谈不上 Push |
| 菜单项长什么样 | `Repository` 菜单 | 只有 `Publish repository…`，没有 `Push origin` | 未配置远程 |
| 有没有 remote | `Repository settings… → Remote` | `Primary remote` 为空，提示 `None` | 没有可推送的目标 |

**两者的区别**：`Publish repository` = 在 GitHub 上**新建**一个远程仓库 + 关联 + 首次推送；`Push origin` = 把本地新提交**推到已存在**的远程仓库。

反过来说，如果哪天你打开项目发现菜单里是 `Push origin`、`Remote` 里已有 `origin` 地址，那就说明远程已配好，**只需要 Push**，绝对不要再点 Publish（会在 GitHub 上多建一个同名仓库）。

---

## 7. 约束核对

- **全程图形界面**：以上 5 个步骤没有任何命令行 `git` 操作，均由 GitHub Desktop 代劳；
- **不改动源码**：Desktop 只在项目内新增 `.git/`（版本数据库）与本次提交记录，`server.js`、`public/*`、`test/*` 内容不变；
- **例外说明**：若第 2 步为了排版/发布需要而取消勾选某文件，仅影响"是否进入本次提交"，磁盘文件不受影响。

---

## 8. 常见卡点速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 点 `create a repository here` 后要求选空目录 | 选成了父目录 | 重新 `File → Add Local Repository`，路径必须精确到 `记事本工具` 这一层 |
| Changes 里出现 `.workbuddy/` | `.gitignore` 未生效 | 确认 `.gitignore` 在项目根目录、内容含 `.workbuddy/`；`Ctrl+R` 刷新后再看 |
| Commit 按钮是灰的 | Summary 为空 | 填第 3 步的提交说明 |
| Publish 弹窗里没有你的账号 | 未登录 | 点 `Sign in`，用 shanxisheng108 授权 |
| 报 `repository already exists` | GitHub 上已有同名仓库 | 把 Name 改成 `week-schedule-deepseek-2` 之类，或去网页删掉旧仓库 |
| 报 `Authentication failed` | 凭据失效 | `File → Options → Accounts` 里 Sign out 后重新 Sign in |
| 提交后想反悔 | 尚未 Push | History 里右键那条提交 → `Undo commit`，文件回到 Changes |
