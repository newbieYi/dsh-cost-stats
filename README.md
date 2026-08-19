# dsh-cost-stats

DSH Web 插件：会话级成本统计面板。

## 面向谁，解决什么

- **面向**：想随时看清每个会话、每个模型 token 用量与费用的 DSH 用户
- **解决**：不用再手动估算成本，一个面板实时统计当前会话的 token 消耗、缓存命中率与费用，支持 USD / CNY

## 功能

- 实时统计当前会话的 token 用量与费用估算
- 按模型分组展示：未缓存输入、缓存读、缓存写、输出
- 显示缓存命中率
- 支持 USD / CNY 双币种显示

## 支持的模型定价

| 模型 | 输入 | 缓存读 | 缓存写 | 输出 |
|------|------|--------|--------|------|
| deepseek-v4-pro | $0.43/M | $0.004/M | — | $0.86/M |
| deepseek-v4-flash | $0.14/M | $0.003/M | — | $0.29/M |
| claude-opus-5-thinking | $5.0/M | $0.5/M | $6.25/M | $25.0/M |
| claude-opus-5 | $5.0/M | $0.5/M | $6.25/M | $25.0/M |

## 安装

### 第 1 步：安装 DSH 本体

插件依赖 [DSH (DeepSeek Harness)](https://github.com/nicepkg/dsh)。如果终端执行 `dsh -V` 提示 `command not found`，说明还没装：

```bash
npm install -g @deepseek-ai/dsh
```

装好后确认一下：

```bash
dsh -V
```

### 第 2 步：安装并登记插件

整段复制到终端执行即可，不用手改任何文件：

```bash
PLUGIN=dsh-cost-stats
REPO=newbieYi/dsh-cost-stats
PROFILE="$HOME/.dsh/profiles/web"

dsh plugin --profile web add "github:$REPO" \
&& test -f "$PROFILE/node_modules/$PLUGIN/cordis.patch.yml" \
&& node -e '
const fs = require("fs");
const file = process.argv[1] + "/package.json";
const name = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
const profile = ((pkg.dsh ??= {}).profile ??= {});
const list = (profile.bundles ??= []);
if (!list.includes(name)) {
  list.push(name);
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
console.log("已登记 bundles:", list.join(", "));
' "$PROFILE" "$PLUGIN" \
|| echo "安装未完成，profile 未被改动。请检查网络后重跑本段。"
```

看到 `已登记 bundles: ... dsh-cost-stats` 就成功了，继续第 3 步。

看到 `安装未完成` 说明包没下载下来（常见原因：网络不通、pnpm 不可用）。这时 profile 没有被改动，DSH 仍能正常启动；解决网络问题后重跑本段即可。

### 第 3 步：重启 DSH

插件在启动时装载，改完配置必须重启才生效。请正常退出，不要用 `kill -9`，否则会话数据可能来不及落盘：

1. 切到正在运行 `dsh web` 的那个终端窗口，按 `Ctrl + C` 等它自己退出；
2. 重新启动：

```bash
dsh web
```

如果找不到原来的终端窗口，可以先查一下进程再正常终止：

```bash
lsof -ti :3080 | xargs kill
```

### 第 4 步：验证

浏览器打开 DSH Web，进入任意会话，tab 栏里应该能看到「成本统计」。

## 常见问题

**装完没有「成本统计」tab？**
九成是没重启。也可以检查 `~/.dsh/profiles/web/package.json` 的 `bundles` 里有没有 `"dsh-cost-stats"`。

**启动时报 `cannot resolve profile bundle "dsh-cost-stats"`？**
`bundles` 里登记了插件，但 `node_modules` 里没有这个包。重跑第 2 步那段即可（它会先确认下载成功再动 profile）。

如果始终装不上，用这条命令把登记撤掉，DSH 就能正常启动，之后再从容排查网络问题：

```bash
node -e '
const fs = require("fs");
const file = process.env.HOME + "/.dsh/profiles/web/package.json";
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
const list = pkg.dsh?.profile?.bundles ?? [];
pkg.dsh.profile.bundles = list.filter((n) => n !== "dsh-cost-stats");
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
console.log("剩余 bundles:", pkg.dsh.profile.bundles.join(", "));
'
```

**启动时报 `declares no dsh.bundle` 或 `failed to read overlay ... cordis.patch.yml`？**
包下载得不完整。重跑第 2 步；若仍然如此，先 `dsh plugin --profile web remove dsh-cost-stats` 再重新 add，避免 pnpm 复用坏的缓存。

**表格里出现 `unknown` 模型？**
DSH 内部调用（生成会话标题、上下文压缩等）不带模型标识，它们的 token 会归到 `unknown` 行，属于正常现象。

## 使用

启动 DSH Web 后，在对话界面的 tab 栏中点击「成本统计」即可查看当前会话的 token 消耗与费用。

## License

MIT
