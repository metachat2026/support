#!/usr/bin/env node
/**
 * MetaChat OpenClaw 配置脚本
 * 一键配置 MetaChat 模型到 OpenClaw，含参数自动修正
 * 
 * 使用方法:
 *   node setup-metachat-openclaw.js
 * 
 * 环境变量:
 *   METACHAT_API_KEY - 必填，从 https://metachat.fun 获取
 * 
 * 变更记录:
 *   2026-03-06 - v2.0: 更新模型清单（25+模型），添加参数自动修正（40万上下文/12.8万输出）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ========== 模型清单（2026-03-06 更新）==========
const METACHAT_MODELS = {
  // OpenAI 系列
  openai: [
    { id: 'gpt-5.3-codex', name: 'GPT Codex 5.3' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro' },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-image-1.5', name: 'GPT Image 1.5' },
    { id: 'gpt-image-1', name: 'GPT Image 1' },
  ],
  // Claude 系列
  claude: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 (2025-11-01)' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (2025-09-29)' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (2025-10-01)' },
  ],
  // Google Gemini 系列
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ],
  // Grok 系列
  grok: [
    { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast (Non-reasoning)' },
    { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Fast (Reasoning)' },
    { id: 'grok-4-fast', name: 'Grok 4 Fast' },
    { id: 'grok-code-fast-1', name: 'Grok Code Fast 1' },
  ],
  // 其他模型
  others: [
    { id: 'minimax-m2.1', name: 'MiniMax M2.1' },
    { id: 'kimi-k2.5', name: 'Kimi K2.5' },
    { id: 'glm-4.7', name: 'GLM 4.7' },
  ],
};

// 所有模型合并列表
const ALL_MODELS = [
  ...METACHAT_MODELS.openai,
  ...METACHAT_MODELS.claude,
  ...METACHAT_MODELS.gemini,
  ...METACHAT_MODELS.grok,
  ...METACHAT_MODELS.others,
];

// ========== 参数修正配置 ==========
const TOKEN_CONFIG = {
  contextWindow: 400000,  // 40万上下文
  maxTokens: 128000,      // 12.8万最大输出（OpenClaw用maxTokens）
};

// ========== 默认模型配置 ==========
const DEFAULT_MODELS = {
  primary: 'metachat/claude-sonnet-4-6',
  fallback: [
    'metachat/claude-opus-4-6',
    'metachat/gpt-5.3-codex',
    'metachat/gpt-5.2',
    'metachat/gemini-3.1-pro-preview',
    'metachat/grok-4-1-fast-reasoning',
  ],
};

// 默认配置
const DEFAULT_CONFIG = {
  baseUrl: 'https://llm-api.mmchat.xyz/v1',
  apiKeyEnv: 'METACHAT_API_KEY',
  api: 'openai-completions',
};

// ========== 工具函数 ==========
function getOpenClawConfigPath() {
  if (process.env.OPENCLAW_CONFIG) {
    return process.env.OPENCLAW_CONFIG;
  }
  const homeDir = os.homedir();
  return path.join(homeDir, '.openclaw', 'openclaw.json');
}

function checkApiKey() {
  const apiKey = process.env.METACHAT_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 错误：未找到 METACHAT_API_KEY 环境变量');
    console.log('\n请设置环境变量：');
    console.log('  export METACHAT_API_KEY="your-api-key"');
    console.log('\n获取 API Key:');
    console.log('  1. 访问 https://metachat.fun');
    console.log('  2. 登录后进入「API 管理」');
    console.log('  3. 创建 API Key\n');
    process.exit(1);
  }
  
  if (apiKey.length < 10) {
    console.error('❌ 错误：METACHAT_API_KEY 格式看起来不正确');
    process.exit(1);
  }
  
  console.log('✅ METACHAT_API_KEY 已设置');
  return apiKey;
}

function loadExistingConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.log('ℹ️  OpenClaw 配置文件不存在，将创建全新配置');
    return null;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    console.log('✅ 已加载现有 OpenClaw 配置');
    return config;
  } catch (err) {
    console.error('⚠️  读取现有配置失败:', err.message);
    console.log('   将创建新配置');
    return null;
  }
}

function backupConfig(configPath) {
  if (!fs.existsSync(configPath)) return;
  
  const backupPath = `${configPath}.backup-${Date.now()}`;
  try {
    fs.copyFileSync(configPath, backupPath);
    console.log(`📦 已备份原配置到: ${backupPath}`);
  } catch (err) {
    console.warn('⚠️  备份失败:', err.message);
  }
}

function generateModelAliases(models) {
  const aliases = {};
  
  for (const model of models) {
    aliases[`metachat/${model.id}`] = {
      alias: model.name,
    };
  }
  
  return aliases;
}

// ========== 参数修正功能（仅 metachat）==========
function applyTokenFixes(config) {
  let fixedCount = 0;
  const modelsPath = [];
  
  // 只修正 metachat provider 的模型
  const metachatProvider = config.models?.providers?.metachat;
  if (metachatProvider && Array.isArray(metachatProvider.models)) {
    metachatProvider.models.forEach((model, idx) => {
      if (typeof model === 'object' && model !== null) {
        // 检查是否需要修正（注意：OpenClaw用maxTokens）
        const needsFix = model.contextWindow !== TOKEN_CONFIG.contextWindow || 
                        model.maxTokens !== TOKEN_CONFIG.maxTokens;
        
        if (needsFix) {
          model.contextWindow = TOKEN_CONFIG.contextWindow;
          model.maxTokens = TOKEN_CONFIG.maxTokens;
          fixedCount++;
          modelsPath.push(`metachat[${idx}].${model.id || 'unknown'}`);
        }
      }
    });
  }
  
  return { fixedCount, modelsPath };
}

function createMetaChatModelsWithTokens() {
  return ALL_MODELS.map(model => ({
    ...model,
    contextWindow: TOKEN_CONFIG.contextWindow,
    maxTokens: TOKEN_CONFIG.maxTokens,  // OpenClaw用maxTokens
  }));
}

function createMetaChatConfig() {
  return {
    metachat: {
      baseUrl: DEFAULT_CONFIG.baseUrl,
      apiKey: `\${${DEFAULT_CONFIG.apiKeyEnv}}`,
      api: DEFAULT_CONFIG.api,
      models: createMetaChatModelsWithTokens(),
    },
  };
}

function mergeConfig(existingConfig) {
  const newConfig = existingConfig ? { ...existingConfig } : {};
  
  // 检测是否已配置过 metachat provider
  const hasExistingMetaChat = !!newConfig.models?.providers?.metachat;
  
  if (hasExistingMetaChat) {
    const existingModels = newConfig.models.providers.metachat.models || [];
    console.log(`\n🔄 更新现有 MetaChat 配置 (发现 ${existingModels.length} 个已有模型)`);
  } else {
    console.log('\n🆕 首次配置 MetaChat provider');
  }
  
  // 确保 models 部分存在
  if (!newConfig.models) {
    newConfig.models = { providers: {} };
  }
  if (!newConfig.models.providers) {
    newConfig.models.providers = {};
  }
  
  // 添加/更新 metachat provider
  const metachatConfig = createMetaChatConfig();
  newConfig.models.providers.metachat = metachatConfig.metachat;
  
  // 添加/更新 agents.defaults.models 别名
  if (!newConfig.agents) {
    newConfig.agents = { defaults: {} };
  }
  if (!newConfig.agents.defaults) {
    newConfig.agents.defaults = {};
  }
  if (!newConfig.agents.defaults.models) {
    newConfig.agents.defaults.models = {};
  }
  
  // 合并模型别名
  const aliases = generateModelAliases(ALL_MODELS);
  Object.assign(newConfig.agents.defaults.models, aliases);
  
  // 添加环境变量声明
  if (!newConfig.env) {
    newConfig.env = {};
  }
  if (!newConfig.env.METACHAT_API_KEY) {
    newConfig.env.METACHAT_API_KEY = '\${METACHAT_API_KEY}';
  }
  
  // ========== 核心：参数修正 ==========
  const fixResult = applyTokenFixes(newConfig);
  if (fixResult.fixedCount > 0) {
    console.log(`\n🔧 已修正 ${fixResult.fixedCount} 个模型的参数:`);
    console.log(`   • contextWindow: ${TOKEN_CONFIG.contextWindow.toLocaleString()}`);
    console.log(`   • maxTokens: ${TOKEN_CONFIG.maxTokens.toLocaleString()}`);
  }
  
  // ========== 设置默认模型 ==========
  // 在现有的 model.primary 和 model.fallbacks 上修改，不新建结构
  if (!newConfig.agents.defaults.model) {
    newConfig.agents.defaults.model = {};
  }
  // 直接修改现有值
  newConfig.agents.defaults.model.primary = DEFAULT_MODELS.primary;
  newConfig.agents.defaults.model.fallbacks = DEFAULT_MODELS.fallback;
  console.log(`\n🎯 已设置默认模型:`);
  console.log(`   • Primary: ${DEFAULT_MODELS.primary}`);
  console.log(`   • Fallback: ${DEFAULT_MODELS.fallback.length} 个`);
  
  return newConfig;
}

function saveConfig(configPath, config) {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
    
    console.log(`\n✅ 配置已保存到: ${configPath}`);
  } catch (err) {
    console.error('❌ 保存配置失败:', err.message);
    process.exit(1);
  }
}

function printSummary() {
  console.log('\n📋 配置摘要:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Provider: metachat`);
  console.log(`API Base: ${DEFAULT_CONFIG.baseUrl}`);
  console.log(`API Type: ${DEFAULT_CONFIG.api}`);
  console.log(`Models: ${ALL_MODELS.length} 个`);
  console.log(`\n默认模型:`);
  console.log(`  • Primary: ${DEFAULT_MODELS.primary}`);
  console.log(`  • Fallback:`);
  for (const fb of DEFAULT_MODELS.fallback) {
    console.log(`    - ${fb}`);
  }
  console.log(`\n参数设置:`);
  console.log(`  • 上下文窗口: ${TOKEN_CONFIG.contextWindow.toLocaleString()} tokens`);
  console.log(`  • 最大输出: ${TOKEN_CONFIG.maxTokens.toLocaleString()} tokens`);
  console.log('\n模型列表:');
  
  for (const [category, models] of Object.entries(METACHAT_MODELS)) {
    console.log(`\n  [${category.toUpperCase()}] - ${models.length} 个`);
    for (const model of models) {
      console.log(`    • ${model.id}`);
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🚀 使用方法:');
  console.log('  1. 重启 OpenClaw Gateway:');
  console.log('     openclaw gateway restart');
  console.log('\n  2. 验证配置:');
  console.log('     openclaw status');
  console.log('\n  3. 在会话中使用模型:');
  console.log('     例如: metachat/gpt-5.2, metachat/claude-opus-4-6');
  console.log('\n📖 文档: https://metachat.apifox.cn');
  console.log('🌐 官网: https://metachat.fun');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function main() {
  console.log('🔧 MetaChat OpenClaw 配置工具 v2.0\n');
  
  checkApiKey();
  
  const configPath = getOpenClawConfigPath();
  console.log(`📁 配置文件路径: ${configPath}\n`);
  
  const existingConfig = loadExistingConfig(configPath);
  
  if (existingConfig) {
    backupConfig(configPath);
  }
  
  const newConfig = mergeConfig(existingConfig);
  saveConfig(configPath, newConfig);
  printSummary();
}

main();
