#!/usr/bin/env node
/**
 * MetaChat OpenClaw 配置脚本
 * 一键配置 MetaChat 模型到 OpenClaw
 * 
 * 使用方法:
 *   node setup-metachat-openclaw.js
 * 
 * 环境变量:
 *   METACHAT_API_KEY - 必填，从 https://metachat.fun 获取
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// MetaChat 模型配置 - OpenAI Compatible
const METACHAT_MODELS = {
  // OpenAI 系列
  openai: [
    { id: 'gpt-5.3-codex', name: 'GPT Codex 5.3' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'o3', name: 'o3' },
    { id: 'o4-mini', name: 'o4-mini' },
  ],
  // Claude 系列 (OpenAI compatible format)
  claude: [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
  ],
  // Gemini 系列 (OpenAI compatible format)
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ],
  // 其他模型
  others: [
    { id: 'grok-3', name: 'Grok 3' },
    { id: 'deepseek-r1', name: 'DeepSeek R1' },
    { id: 'deepseek-v3', name: 'DeepSeek V3' },
  ],
};

// 所有模型合并列表
const ALL_MODELS = [
  ...METACHAT_MODELS.openai,
  ...METACHAT_MODELS.claude,
  ...METACHAT_MODELS.gemini,
  ...METACHAT_MODELS.others,
];

// 默认配置
const DEFAULT_CONFIG = {
  baseUrl: 'https://llm-api.mmchat.xyz/v1',
  apiKeyEnv: 'METACHAT_API_KEY',
  api: 'openai-completions',
};

function getOpenClawConfigPath() {
  // 优先使用环境变量指定的路径
  if (process.env.OPENCLAW_CONFIG) {
    return process.env.OPENCLAW_CONFIG;
  }
  
  // 默认路径
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
  
  // 简单验证 key 格式
  if (apiKey.length < 10) {
    console.error('❌ 错误：METACHAT_API_KEY 格式看起来不正确');
    process.exit(1);
  }
  
  console.log('✅ METACHAT_API_KEY 已设置');
  return apiKey;
}

function loadExistingConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.log('ℹ️  未找到现有配置，将创建新配置');
    return null;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    console.log('✅ 已加载现有配置');
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
    // 创建别名，如 gpt-5.2 -> GPT-5.2
    aliases[`metachat/${model.id}`] = {
      alias: model.name,
    };
  }
  
  return aliases;
}

function createMetaChatConfig() {
  return {
    metachat: {
      baseUrl: DEFAULT_CONFIG.baseUrl,
      apiKey: `\${${DEFAULT_CONFIG.apiKeyEnv}}`,
      api: DEFAULT_CONFIG.api,
      models: ALL_MODELS,
    },
  };
}

function mergeConfig(existingConfig) {
  const newConfig = existingConfig ? { ...existingConfig } : {};
  
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
  
  // 添加环境变量声明（如果不存在）
  if (!newConfig.env) {
    newConfig.env = {};
  }
  if (!newConfig.env.METACHAT_API_KEY) {
    newConfig.env.METACHAT_API_KEY = '\${METACHAT_API_KEY}';
  }
  
  return newConfig;
}

function saveConfig(configPath, config) {
  try {
    // 确保目录存在
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 写入配置，格式化 JSON
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
    
    console.log(`✅ 配置已保存到: ${configPath}`);
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
  console.log('\n模型列表:');
  
  for (const [category, models] of Object.entries(METACHAT_MODELS)) {
    console.log(`\n  [${category.toUpperCase()}]`);
    for (const model of models) {
      console.log(`    • ${model.id} (${model.name})`);
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🚀 使用方法:');
  console.log('  1. 重启 OpenClaw Gateway:');
  console.log('     openclaw gateway restart');
  console.log('\n  2. 验证配置:');
  console.log('     openclaw status');
  console.log('\n  3. 在会话中使用模型:');
  console.log('     例如: metachat/gpt-5.2, metachat/claude-sonnet-4-6');
  console.log('\n📖 文档: https://metachat.apifox.cn');
  console.log('🌐 官网: https://metachat.fun');
}

function main() {
  console.log('🔧 MetaChat OpenClaw 配置工具\n');
  
  // 检查 API Key
  checkApiKey();
  
  // 获取配置路径
  const configPath = getOpenClawConfigPath();
  console.log(`📁 配置文件路径: ${configPath}\n`);
  
  // 加载现有配置
  const existingConfig = loadExistingConfig(configPath);
  
  // 备份原配置
  if (existingConfig) {
    backupConfig(configPath);
  }
  
  // 合并配置
  const newConfig = mergeConfig(existingConfig);
  
  // 保存配置
  saveConfig(configPath, newConfig);
  
  // 打印摘要
  printSummary();
}

main();
