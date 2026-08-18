# dsh-cost-stats

DSH Web 插件：会话级成本统计面板。

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

### 第 2 步：下载插件到 web profile

```bash
dsh plugin --profile web add github:newbieYi/dsh-cost-stats
```

这一步只是把包下载进 `~/.dsh/profiles/web/node_modules`，插件还不会生效，必须继续第 3 步。

### 第 3 步：在 bundles 中登记插件

打开 `~/.dsh/profiles/web/package.json`，在 `dsh.profile.bundles` 数组末尾加一行 `"dsh-cost-stats"`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-cost-stats"
      ]
    }
  }
}
```

注意 JSON 语法：新增行的前一行末尾要补英文逗号。数组里原有的条目保持不动。

### 第 4 步：重启 DSH

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

### 第 5 步：验证

浏览器打开 DSH Web，进入任意会话，tab 栏里应该能看到「成本统计」。

## 常见问题

**装完没有「成本统计」tab？**
九成是漏了第 3 步，或者没重启。先检查 `~/.dsh/profiles/web/package.json` 的 `bundles` 里有没有 `"dsh-cost-stats"`。

**启动时报 `declares no dsh.bundle`？**
说明包没下载完整，重跑第 2 步。

**表格里出现 `unknown` 模型？**
DSH 内部调用（生成会话标题、上下文压缩等）不带模型标识，它们的 token 会归到 `unknown` 行，属于正常现象。

## 使用

启动 DSH Web 后，在对话界面的 tab 栏中点击「成本统计」即可查看当前会话的 token 消耗与费用。

## License

MIT
