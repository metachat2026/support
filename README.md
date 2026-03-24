# MetaChat OpenClaw 配置工具

一键配置 MetaChat 全系模型到 [OpenClaw](https://github.com/openclaw/openclaw)，支持安装、更新、精准回退。

## 快速安装

```bash
# 1. 设置 API Key（从 https://metachat.fun 获取）
export METACHAT_API_KEY="your-api-key"

# 2. 一键安装
curl -fsSL https://raw.githubusercontent.com/metachat2026/support/main/openclaw/setup-metachat-openclaw.js | node -

# 3. 重启 Gateway
openclaw gateway restart
```

## 回退（卸载 MetaChat 配置）

出问题时一键回退，**只移除 MetaChat 注入的配置，不影响你的其他设置**：

```bash
curl -fsSL https://raw.githubusercontent.com/metachat2026/support/main/openclaw/setup-metachat-openclaw.js | node - --rollback
```

## 查看安装状态

```bash
curl -fsSL https://raw.githubusercontent.com/metachat2026/support/main/openclaw/setup-metachat-openclaw.js | node - --status
```

## 本地保存（推荐）

下载脚本到本地，方便随时回退：

```bash
# 下载
curl -fsSL https://raw.githubusercontent.com/metachat2026/support/main/openclaw/setup-metachat-openclaw.js -o setup-metachat-openclaw.js

# 安装
METACHAT_API_KEY="your-api-key" node setup-metachat-openclaw.js

# 回退
node setup-metachat-openclaw.js --rollback

# 状态
node setup-metachat-openclaw.js --status

# 帮助
node setup-metachat-openclaw.js --help
```

## 支持的模型

35+ 模型，包括：

- **OpenAI**: GPT-5.4 / 5.3 Codex / 5.2 / 5 / 4.1 / 4o 及各 Mini/Nano 变体
- **Anthropic**: Claude Opus 4.6 / 4.5 / Sonnet 4.6 / 4.5 / Haiku 4.5
- **Google**: Gemini 3.1 Pro / 3 Pro / 3 Flash / 2.5 Pro / 2.5 Flash
- **xAI**: Grok 4.1 Fast / 4 Fast / Code Fast
- **其他**: MiniMax M2.7/M2.5/M2.1 / Kimi K2.5 / GLM 5/4.7

## 回退机制说明

- **精准回退**：只删除 MetaChat 注入的 provider、模型别名、默认模型和环境变量
- **用户配置安全**：你自定义的 provider、别名、其他设置完全不受影响
- **兼容旧版**：即使用旧版脚本安装的也能回退（自动检测 MetaChat 配置特征）
- **自动备份**：每次安装/回退前自动备份 `openclaw.json`

## 链接

- 🌐 官网: https://metachat.fun
- 📖 API 文档: https://metachat.apifox.cn
- 🔑 获取 API Key: https://metachat.fun → 登录 → API 管理
