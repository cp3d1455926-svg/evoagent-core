#!/usr/bin/env node
/**
 * EvoAgent — Skill 市场 CLI
 *
 * 浏览、搜索、安装 ClawHub 社区 Skill
 *
 * 用法:
 *   evoagent skills search <query>         搜索 Skill
 *   evoagent skills list                    列出所有可安装 Skill
 *   evoagent skills install <slug>          安装 Skill
 *   evoagent skills uninstall <slug>        卸载 Skill
 *   evoagent skills list-installed          列出已安装 Skill
 *   evoagent skills info <slug>             查看 Skill 详情
 *   evoagent skills browse [category]       浏览（热门/最新/高星）
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';

const SKILLS_DIR = path.resolve(process.env.USERPROFILE || process.env.HOME || '.', '.evoagent', 'skills');
const LOCAL_SKILLS_DIR = path.resolve(process.cwd(), 'skills');

async function getLocalLoader() {
  const { SkillLoader } = await import('../core/skill-loader.js');
  const loader = new SkillLoader(LOCAL_SKILLS_DIR);
  return loader;
}

async function getMarket(): Promise<any> {
  const { SkillMarket } = await import('../core/skill-market.js');
  return new SkillMarket(SKILLS_DIR);
}

function printSkill(skill: any, installed = false) {
  const stars = '★'.repeat(Math.min(skill.stars ?? 0, 5));
  console.log(`  ${installed ? '✅' : '  '} ${skill.displayName || skill.name} ${stars}`);
  if (installed) console.log(`     📂 ${skill.path}`);
  else console.log(`     ⬇️  ${skill.downloads?.toLocaleString() ?? 0} downloads`);
  console.log(`     ${skill.description || skill.summary || ''}`);
  if (skill.tags?.length) console.log(`     🏷️  ${skill.tags.join(', ')}`);
  console.log('');
}

async function cmdSearch(query: string, opts: any) {
  const market = await getMarket();
  const results = await market.search(query, { limit: parseInt(opts.limit) || 15 });

  console.log(`🔍 搜索 "${query}": ${results.total} 个结果\n`);
  for (const skill of results.items) {
    printSkill(skill, market.isInstalled(skill.slug));
  }
}

async function cmdList(opts: any) {
  const market = await getMarket();
  const limit = parseInt(opts.limit) || 20;

  if (opts.category === 'popular' || opts.category === 'hot') {
    const skills = await market.getPopular(limit);
    console.log(`🔥 热门 Skill\n`);
    for (const s of skills) printSkill(s, market.isInstalled(s.slug));
  } else if (opts.category === 'latest' || opts.category === 'new') {
    const skills = await market.getLatest(limit);
    console.log(`🆕 最新 Skill\n`);
    for (const s of skills) printSkill(s, market.isInstalled(s.slug));
  } else if (opts.category === 'top' || opts.category === 'rated') {
    const skills = await market.getTopRated(limit);
    console.log(`⭐ 高评分 Skill\n`);
    for (const s of skills) printSkill(s, market.isInstalled(s.slug));
  } else {
    const all = await market.search('', { limit: 100 });
    console.log(`📦 ClawHub Skill 市场 — ${all.total} 个可用\n`);
    for (const s of all.items) printSkill(s, market.isInstalled(s.slug));
  }
}

async function cmdInstall(slug: string, opts: any) {
  const market = await getMarket();

  if (!slug) { console.error('❌ 请提供 Skill slug，如: evoagent skills install weather'); process.exit(1); }

  console.log(`⬇️  安装 ${slug}...`);
  const result = await market.install(slug);

  if (result.success) {
    console.log(`✅ ${slug} 安装成功！`);
    console.log(`   Skills 目录: ${SKILLS_DIR}`);
    // 刷新本地 loader
    try { const loader = await getLocalLoader(); await loader.loadAll(); } catch { }
  } else {
    console.error(`❌ 安装失败: ${result.error}`);
    process.exit(1);
  }
}

async function cmdUninstall(slug: string, opts: any) {
  const market = await getMarket();

  if (!slug) { console.error('❌ 请提供 Skill slug'); process.exit(1); }

  console.log(`🗑️  卸载 ${slug}...`);
  const result = await market.uninstall(slug);

  if (result.success) {
    console.log(`✅ ${slug} 已卸载`);
    try { const loader = await getLocalLoader(); await loader.loadAll(); } catch { }
  } else {
    console.error(`❌ 卸载失败: ${result.error}`);
    process.exit(1);
  }
}

async function cmdListInstalled() {
  const loader = await getLocalLoader();
  await loader.loadAll();
  const skills = loader.getAll();

  console.log(`📦 已安装 Skill (${skills.length})\n`);
  for (const skill of skills) {
    printSkill(skill, true);
  }
}

async function cmdInfo(slug: string, opts: any) {
  const market = await getMarket();

  if (!slug) { console.error('❌ 请提供 Skill slug'); process.exit(1); }

  const skill = await market.getSkill(slug);
  if (!skill) { console.error(`❌ Skill "${slug}" 未找到`); process.exit(1); }

  console.log(`\n📋 ${skill.displayName} ${'★'.repeat(Math.min(skill.stars, 5))}\n`);
  console.log(`  版本: ${skill.version}`);
  console.log(`  作者: ${skill.author} (@${skill.authorHandle})`);
  console.log(`  下载: ${skill.downloads?.toLocaleString() ?? 0}`);
  console.log(`  安装: ${skill.installsAllTime?.toLocaleString() ?? 0} (当前 ${skill.installsCurrent ?? 0})`);
  console.log(`  Slug: ${skill.slug}`);
  console.log(`  描述: ${skill.summary}`);
  if (skill.tags?.length) console.log(`  标签: ${skill.tags.join(', ')}`);
  if (skill.changelog) { console.log(`\n  更新日志:\n  ${skill.changelog.split('\n').join('\n  ')}`); }
  console.log('');
  console.log(`  ${market.isInstalled(slug) ? '✅ 已安装' : '⬇️  未安装 — evoagent skills install ' + slug}\n`);
}

// ─── 导出供 CLI 注册 ────────────────────────────────────
export function registerSkillCommands(program: Command) {
  const skills = program.command('skills').description('Skill 市场管理');

  skills
    .command('search <query>')
    .description('搜索 Skill')
    .option('-l, --limit <n>', '结果数量', '15')
    .action(cmdSearch);

  skills
    .command('list')
    .description('列出所有 Skill')
    .option('-c, --category <cat>', '分类: popular / latest / top')
    .option('-l, --limit <n>', '结果数量', '20')
    .action(cmdList);

  skills
    .command('install <slug>')
    .description('从 ClawHub 安装 Skill')
    .action(cmdInstall);

  skills
    .command('uninstall <slug>')
    .description('卸载 Skill')
    .action(cmdUninstall);

  skills
    .command('list-installed')
    .description('列出已安装 Skill')
    .action(cmdListInstalled);

  skills
    .command('info <slug>')
    .description('查看 Skill 详情')
    .action(cmdInfo);

  skills
    .command('browse [category]')
    .description('浏览 Skill 市场')
    .option('-l, --limit <n>', '结果数量', '20')
    .action((category: string, opts: any) => cmdList({ ...opts, args: [category || ''] }));
}

