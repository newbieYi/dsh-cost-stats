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

### 前置条件

需要先安装 [DSH (DeepSeek Harness)](https://github.com/nicepkg/dsh)：

```bash
npm install -g @deepseek-ai/dsh
```

### 安装插件

```bash
dsh plugin --profile web add github:newbieYi/dsh-cost-stats
```

在 `package.json` 的 `dsh.profile.bundles` 中添加 `"dsh-cost-stats"`，重启 DSH 即可。

## 使用

启动 DSH Web 后，在对话界面的 tab 栏中点击「成本统计」即可查看当前会话的 token 消耗与费用。

## License

MIT
