#!/usr/bin/env node
/**
 * OpenClaw 3.x 权限恢复脚本
 * 一键配置常用工具权限，解决默认权限不足问题
 * 
 * 使用方法:
 *   node setup-openclaw-permissions.js
 * 
 * 执行后需要重启 OpenClaw:
 *   openclaw gateway restart
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 默认配置路径
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

// 权限配置
const PERMISSIONS_CONFIG = {
  profile: 'full',
  allow: [
    'group:runtime',
    'group:fs',
    'group:web',
    'group:sessions',
    'group:ui',
    'group:automation',
    'group:messaging',
    'group:openclaw',
    'group:nodes',
    'feishu_doc',
    'feishu_chat',
    'feishu_wiki',
    'feishu_drive',
    'feishu_bitable'
  ],
  exec: {
    security: 'allowlist',
    ask: 'on-miss'
  }
};

function getConfigPath() {
  return process.env.OPENCLAW_CONFIG || DEFAULT_CONFIG_PATH;
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.error('❌ 未找到 OpenClaw 配置文件:', configPath);
    console.log('\n请先安装并初始化 OpenClaw:');
    console.log('  npm i -g openclaw');
    console.log('  openclaw onboard');
    process.exit(1);
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('❌ 读取配置文件失败:', err.message);
    process.exit(1);
  }
}

function backupConfig(configPath) {
  if (!fs.existsSync(configPath)) return;
  
  const backupPath = `${configPath}.backup-perms-${Date.now()}`;
  try {
    fs.copyFileSync(configPath, backupPath);
    console.log(`📦 已备份原配置: ${backupPath}`);
  } catch (err) {
    console.warn('⚠️  备份失败:', err.message);
  }
}

function mergePermissions(config) {
  if (!config.tools) {
    config.tools = {};
  }
  
  // 设置 profile
  const oldProfile = config.tools.profile;
  config.tools.profile = PERMISSIONS_CONFIG.profile;
  console.log(`\n🔧 profile: ${oldProfile || '(未设置)'} → ${config.tools.profile}`);
  
  // 设置 allow 列表（合并去重）
  const oldAllow = config.tools.allow || [];
  const newAllow = [...new Set([...oldAllow, ...PERMISSIONS_CONFIG.allow])];
  config.tools.allow = newAllow;
  console.log(`🔧 allow: ${oldAllow.length} 项 → ${newAllow.length} 项`);
  console.log('   新增:', PERMISSIONS_CONFIG.allow.filter(x => !oldAllow.includes(x)).join(', ') || '(无)');
  
  // 设置 exec
  const oldExec = JSON.stringify(config.tools.exec);
  config.tools.exec = { ...PERMISSIONS_CONFIG.exec, ...config.tools.exec };
  console.log(`🔧 exec.security: ${config.tools.exec.security}`);
  console.log(`🔧 exec.ask: ${config.tools.exec.ask}`);
  
  return config;
}

function saveConfig(configPath, config) {
  try {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
    console.log(`\n✅ 配置已保存: ${configPath}`);
  } catch (err) {
    console.error('❌ 保存配置失败:', err.message);
    process.exit(1);
  }
}

function printSummary() {
  console.log('\n📋 权限配置摘要:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('已启用以下权限组:');
  PERMISSIONS_CONFIG.allow.forEach(item => {
    console.log(`  • ${item}`);
  });
  console.log('\n🚀 使用方法:');
  console.log('  1. 重启 OpenClaw:');
  console.log('     openclaw gateway restart');
  console.log('\n  2. 验证权限:');
  console.log('     openclaw status');
  console.log('\n⚠️  安全提示:');
  console.log('   当前配置启用了完整权限');
  console.log('   生产环境建议根据实际需要精简 allow 列表');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

function main() {
  console.log('🔧 OpenClaw 3.x 权限恢复工具\n');
  
  const configPath = getConfigPath();
  console.log(`📁 配置文件路径: ${configPath}`);
  
  const config = loadConfig(configPath);
  backupConfig(configPath);
  
  const newConfig = mergePermissions(config);
  saveConfig(configPath, newConfig);
  
  printSummary();
}

main();
