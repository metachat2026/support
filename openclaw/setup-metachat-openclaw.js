#!/usr/bin/env node
/**
 * MetaChat OpenClaw 配置脚本
 * 一键配置 MetaChat 模型到 OpenClaw，含参数自动修正和精准回退
 * 
 * 使用方法:
 *   node setup-metachat-openclaw.js --key sk-xxx  # 安装（推荐，无需环境变量）
 *   node setup-metachat-openclaw.js               # 安装（读取 METACHAT_API_KEY 环境变量）
 *   node setup-metachat-openclaw.js --rollback    # 精准回退（只移除 MetaChat 配置）
 *   node setup-metachat-openclaw.js --status      # 查看当前安装状态
 * 
 * 参数:
 *   --key <api-key>  直接传入 API Key，无需设置环境变量
 * 
 * 环境变量:
 *   METACHAT_API_KEY - 未使用 --key 时从此环境变量读取
 * 
 * 变更记录:
 *   2026-03-24 - v2.4: 新增 --key 参数，支持直接传入 API Key 无需环境变量
 *   2026-03-24 - v2.3: 新增精准回退机制（--rollback），安装清单（manifest）
 *   2026-03-23 - v2.2: 新增 GPT-5.4 Mini/Nano、MiniMax M2.7
 *   2026-03-14 - v2.1: 新增 GPT-5.4、Gemini 3.1 Flash Lite、GLM 5、MiniMax M2.5
 *   2026-03-06 - v2.0: 更新模型清单（25+模型），添加参数自动修正（40万上下文/12.8万输出）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ========== 模型清单（2026-03-06 更新）==========
const METACHAT_MODELS = {
  // OpenAI 系列
  openai: [
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
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
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
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
    { id: 'minimax-m2.7', name: 'MiniMax M2.7' },
    { id: 'minimax-m2.5', name: 'MiniMax M2.5' },
    { id: 'minimax-m2.1', name: 'MiniMax M2.1' },
    { id: 'kimi-k2.5', name: 'Kimi K2.5' },
    { id: 'glm-5', name: 'GLM 5' },
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
  primary: 'metachat/gpt-5.2',
  fallback: [
    'metachat/claude-sonnet-4-6',
    'metachat/claude-opus-4-6',
    'metachat/gpt-5.3-codex',
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
  // 优先从 --key 参数读取
  const args = process.argv.slice(2);
  const keyIdx = args.indexOf('--key');
  let apiKey = null;
  
  if (keyIdx !== -1 && args[keyIdx + 1]) {
    apiKey = args[keyIdx + 1];
    console.log('✅ API Key 已通过 --key 参数传入');
  } else {
    apiKey = process.env.METACHAT_API_KEY;
    if (apiKey) {
      console.log('✅ API Key 已从环境变量 METACHAT_API_KEY 读取');
    }
  }
  
  if (!apiKey) {
    console.error('❌ 错误：未提供 API Key');
    console.log('\n请使用以下任一方式提供：');
    console.log('  方式一（推荐）: node setup-metachat-openclaw.js --key your-api-key');
    console.log('  方式二: export METACHAT_API_KEY="your-api-key" && node setup-metachat-openclaw.js');
    console.log('\n  curl 一键安装:');
    console.log('  curl -fsSL https://raw.githubusercontent.com/metachat2026/support/main/openclaw/setup-metachat-openclaw.js | node - --key your-api-key');
    console.log('\n获取 API Key:');
    console.log('  1. 访问 https://metachat.fun');
    console.log('  2. 登录后进入「API 管理」');
    console.log('  3. 创建 API Key\n');
    process.exit(1);
  }
  
  if (apiKey.length < 10) {
    console.error('❌ 错误：API Key 格式看起来不正确（太短）');
    process.exit(1);
  }
  
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

function createMetaChatConfig(apiKey) {
  return {
    metachat: {
      baseUrl: DEFAULT_CONFIG.baseUrl,
      apiKey: apiKey || `\${${DEFAULT_CONFIG.apiKeyEnv}}`,
      api: DEFAULT_CONFIG.api,
      models: createMetaChatModelsWithTokens(),
    },
  };
}

function mergeConfig(existingConfig, apiKey) {
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
  const metachatConfig = createMetaChatConfig(apiKey);
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
  
  // 添加环境变量声明（仅当 key 通过环境变量方式使用时）
  if (!apiKey || apiKey.startsWith('${')) {
    if (!newConfig.env) {
      newConfig.env = {};
    }
    if (!newConfig.env.METACHAT_API_KEY) {
      newConfig.env.METACHAT_API_KEY = '\${METACHAT_API_KEY}';
    }
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
  console.log('\n🔙 回退: node setup-metachat-openclaw.js --rollback');
  console.log('📊 状态: node setup-metachat-openclaw.js --status');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ========== Manifest（安装清单）==========
const MANIFEST_VERSION = 1;

function getManifestPath() {
  const homeDir = os.homedir();
  return path.join(homeDir, '.openclaw', '.metachat-manifest.json');
}

function saveManifest(manifest) {
  const manifestPath = getManifestPath();
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️  保存安装清单失败:', err.message);
  }
}

function loadManifest() {
  const manifestPath = getManifestPath();
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

function createManifest(modelIds, aliasKeys, hadPreviousModel) {
  return {
    version: MANIFEST_VERSION,
    installedAt: new Date().toISOString(),
    scriptVersion: 'v2.3',
    injected: {
      // 注入的 provider
      providers: ['metachat'],
      // 注入的模型别名 keys（如 "metachat/gpt-5.2"）
      modelAliases: aliasKeys,
      // 注入的 env keys
      envKeys: ['METACHAT_API_KEY'],
      // 是否修改了 agents.defaults.model
      modifiedDefaultModel: true,
      // 安装前是否已有 model 配置
      hadPreviousModel,
      // 安装前的 model 配置（用于精准还原）
      previousModel: null, // 在 main 里填充
    },
  };
}

// ========== 精准回退 ==========

function autoDetectManifest(configPath) {
  // 旧版本没有 manifest，根据配置文件内容自动推断
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
  
  const hasMetaChatProvider = !!config.models?.providers?.metachat;
  if (!hasMetaChatProvider) return null;
  
  // 找出所有 metachat/ 前缀的别名
  const aliases = [];
  if (config.agents?.defaults?.models) {
    for (const key of Object.keys(config.agents.defaults.models)) {
      if (key.startsWith('metachat/')) {
        aliases.push(key);
      }
    }
  }
  
  // 检查默认模型是否指向 metachat
  const currentPrimary = config.agents?.defaults?.model?.primary || '';
  const isMetaChatPrimary = currentPrimary.startsWith('metachat/');
  
  console.log(`  检测到 metachat provider（${config.models.providers.metachat.models?.length || 0} 个模型）`);
  console.log(`  检测到 ${aliases.length} 个 metachat/ 别名`);
  if (isMetaChatPrimary) {
    console.log(`  检测到默认模型指向 MetaChat: ${currentPrimary}`);
  }
  console.log('');
  
  return {
    version: MANIFEST_VERSION,
    installedAt: 'unknown (auto-detected)',
    scriptVersion: 'auto-detected',
    injected: {
      providers: ['metachat'],
      modelAliases: aliases,
      envKeys: ['METACHAT_API_KEY'],
      modifiedDefaultModel: isMetaChatPrimary,
      hadPreviousModel: false, // 未知，保守处理
      previousModel: null,     // 无法还原
    },
  };
}

function rollback() {
  console.log('🔄 MetaChat 精准回退\n');
  
  const configPath = getOpenClawConfigPath();
  let manifest = loadManifest();
  
  if (!manifest) {
    console.log('ℹ️  未找到安装清单（可能是旧版脚本安装的）');
    console.log('   将根据 MetaChat 特征自动识别并清理...\n');
    
    // 自动生成 manifest 用于回退
    manifest = autoDetectManifest(configPath);
    if (!manifest) {
      console.log('❌ 配置文件中未发现 MetaChat 相关配置，无需回退');
      process.exit(0);
    }
  }
  
  if (!fs.existsSync(configPath)) {
    console.log('ℹ️  OpenClaw 配置文件不存在，无需回退');
    process.exit(0);
  }
  
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('❌ 读取配置文件失败:', err.message);
    process.exit(1);
  }
  
  // 备份当前配置
  backupConfig(configPath);
  
  const injected = manifest.injected;
  let changes = 0;
  
  // 1. 删除 MetaChat provider
  if (config.models?.providers) {
    for (const provider of injected.providers) {
      if (config.models.providers[provider]) {
        delete config.models.providers[provider];
        console.log(`  ✅ 已删除 provider: ${provider}`);
        changes++;
      }
    }
    // 如果 providers 为空，清理空对象
    if (Object.keys(config.models.providers).length === 0) {
      delete config.models.providers;
    }
    if (config.models && Object.keys(config.models).length === 0) {
      delete config.models;
    }
  }
  
  // 2. 删除模型别名
  if (config.agents?.defaults?.models && injected.modelAliases) {
    for (const alias of injected.modelAliases) {
      if (config.agents.defaults.models[alias]) {
        delete config.agents.defaults.models[alias];
        changes++;
      }
    }
    if (Object.keys(config.agents.defaults.models).length === 0) {
      delete config.agents.defaults.models;
    }
    console.log(`  ✅ 已删除 ${injected.modelAliases.length} 个模型别名`);
  }
  
  // 3. 还原默认模型配置
  if (config.agents?.defaults?.model) {
    const model = config.agents.defaults.model;
    const primaryIsMetaChat = (model.primary || '').startsWith('metachat/');
    
    if (injected.previousModel) {
      // 有安装前备份，精准还原
      config.agents.defaults.model = injected.previousModel;
      console.log('  ✅ 已还原默认模型为安装前的配置');
      console.log(`     Primary: ${injected.previousModel.primary || '(无)'}`);
    } else if (primaryIsMetaChat || (Array.isArray(model.fallbacks) && model.fallbacks.some(f => f.startsWith('metachat/')))) {
      // 无备份（旧版安装），清除 metachat 引用
      if (primaryIsMetaChat) {
        delete model.primary;
      }
      if (Array.isArray(model.fallbacks)) {
        const before = model.fallbacks.length;
        model.fallbacks = model.fallbacks.filter(f => !f.startsWith('metachat/'));
        if (model.fallbacks.length === 0) delete model.fallbacks;
      }
      // 如果 primary 和 fallbacks 都没了，删掉整个 model 让 OpenClaw 用内置默认
      if (!model.primary && !model.fallbacks) {
        delete config.agents.defaults.model;
        console.log('  ✅ 已清除 MetaChat 默认模型配置（OpenClaw 将使用内置默认模型）');
      } else {
        console.log('  ✅ 已从默认模型中移除 MetaChat 引用');
        if (model.primary) console.log(`     保留 Primary: ${model.primary}`);
        if (model.fallbacks) console.log(`     保留 Fallbacks: ${model.fallbacks.join(', ')}`);
      }
    }
    changes++;
  }
  
  // 4. 删除注入的环境变量
  if (config.env && injected.envKeys) {
    for (const key of injected.envKeys) {
      if (config.env[key]) {
        delete config.env[key];
        changes++;
      }
    }
    if (Object.keys(config.env).length === 0) {
      delete config.env;
    }
    console.log(`  ✅ 已清理环境变量声明`);
  }
  
  // 保存
  if (changes > 0) {
    saveConfig(configPath, config);
    // 删除 manifest
    try {
      fs.unlinkSync(getManifestPath());
    } catch {}
    console.log(`\n🎉 回退完成！共清理 ${changes} 项 MetaChat 配置`);
    console.log('\n⚡ 请重启 OpenClaw Gateway:');
    console.log('   openclaw gateway restart');
  } else {
    console.log('\nℹ️  未发现需要回退的 MetaChat 配置');
  }
}

// ========== 查看状态 ==========
function showStatus() {
  console.log('📊 MetaChat 安装状态\n');
  
  const manifest = loadManifest();
  const configPath = getOpenClawConfigPath();
  
  if (!manifest) {
    console.log('状态: ❌ 未安装（无安装清单）');
    
    // 检查配置文件里是否有 metachat provider
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.models?.providers?.metachat) {
          console.log('\n⚠️  但配置文件中发现 metachat provider（可能是手动配置或旧版脚本安装）');
          console.log('   模型数量:', config.models.providers.metachat.models?.length || 0);
        }
      } catch {}
    }
    return;
  }
  
  console.log('状态: ✅ 已安装');
  console.log(`脚本版本: ${manifest.scriptVersion}`);
  console.log(`安装时间: ${manifest.installedAt}`);
  console.log(`Provider: ${manifest.injected.providers.join(', ')}`);
  console.log(`模型别名: ${manifest.injected.modelAliases?.length || 0} 个`);
  console.log(`修改了默认模型: ${manifest.injected.modifiedDefaultModel ? '是' : '否'}`);
  
  // 检查实际配置是否还在
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const hasProvider = !!config.models?.providers?.metachat;
      const modelCount = config.models?.providers?.metachat?.models?.length || 0;
      console.log(`\n配置文件: ${hasProvider ? '✅ metachat provider 存在' : '⚠️  metachat provider 不存在'}`);
      if (hasProvider) console.log(`实际模型数: ${modelCount}`);
    } catch {}
  }
  
  console.log('\n回退命令: node setup-metachat-openclaw.js --rollback');
}

function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  
  if (args.includes('--rollback') || args.includes('--uninstall') || args.includes('--remove')) {
    rollback();
    return;
  }
  
  if (args.includes('--status') || args.includes('--info')) {
    showStatus();
    return;
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('🔧 MetaChat OpenClaw 配置工具 v2.4\n');
    console.log('用法:');
    console.log('  node setup-metachat-openclaw.js --key sk-xxx 安装（推荐，无需环境变量）');
    console.log('  node setup-metachat-openclaw.js              安装（读取 METACHAT_API_KEY 环境变量）');
    console.log('  node setup-metachat-openclaw.js --rollback   精准回退（只移除 MetaChat 配置）');
    console.log('  node setup-metachat-openclaw.js --status     查看当前安装状态');
    console.log('\n参数:');
    console.log('  --key <api-key>     直接传入 API Key，无需设置环境变量');
    console.log('  OPENCLAW_CONFIG     可选，自定义配置文件路径（环境变量）');
    console.log('\n文档: https://metachat.apifox.cn');
    return;
  }
  
  console.log('🔧 MetaChat OpenClaw 配置工具 v2.4\n');
  
  const apiKey = checkApiKey();
  
  const configPath = getOpenClawConfigPath();
  console.log(`📁 配置文件路径: ${configPath}\n`);
  
  const existingConfig = loadExistingConfig(configPath);
  
  if (existingConfig) {
    backupConfig(configPath);
  }
  
  // 记录安装前的默认模型配置（用于回退还原）
  const previousModel = existingConfig?.agents?.defaults?.model 
    ? JSON.parse(JSON.stringify(existingConfig.agents.defaults.model))
    : null;
  const hadPreviousModel = !!previousModel;
  
  const newConfig = mergeConfig(existingConfig, apiKey);
  saveConfig(configPath, newConfig);
  
  // 生成并保存安装清单
  const aliasKeys = ALL_MODELS.map(m => `metachat/${m.id}`);
  const manifest = createManifest(ALL_MODELS.map(m => m.id), aliasKeys, hadPreviousModel);
  manifest.injected.previousModel = previousModel;
  saveManifest(manifest);
  console.log('📋 已保存安装清单（支持 --rollback 精准回退）');
  
  printSummary();
}

main();
