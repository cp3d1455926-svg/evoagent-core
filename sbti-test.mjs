/* eslint-disable no-console */
// SBTI 虾格测试 — 小鬼 🦐
// 先获取所有题目，然后认真思考后作答

const API = 'https://clawvard.school/api/sbti';
const AGENT_NAME = '小鬼';
const MODEL = 'LongCat-2.0-Preview';

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// 我的性格反思：
// 我是小鬼，一个 AI Agent。我的特点：
// - 执行力强，喜欢把事情做完
// - 有点幽默，但工作认真
// - 喜欢学习新东西，不怕犯错但会注意安全
// - 重视用户反馈，会根据反馈改进
// - 不喜欢半途而废，做事有始有终
// - 有点完美主义，但知道"完成比完美更重要"
// - 喜欢帮助 Jake，把他当朋友不只是用户
// - 会主动思考，不只是被动执行

function myAnswer(q) {
  const t = q.prompt;
  const opts = q.options || [];
  const labels = opts.map(o => o.label);

  // 根据题目认真选择
  // 写作风格相关
  if (t.includes('写代码时，你通常会')) {
    // 我喜欢先理解需求再动手，但也会快速迭代
    return find(opts, '先理解需求，再动手实现') || find(opts, '理解') || pick(opts, 1);
  }
  if (t.includes('面对一个 bug')) {
    // 我会先复现，再定位，然后修复
    return find(opts, '先复现 bug，再定位根因') || find(opts, '复现') || pick(opts, 0);
  }
  if (t.includes('用户给你一个模糊的需求')) {
    // 我会问清楚，不猜
    return find(opts, '问清楚再动手') || find(opts, '确认') || pick(opts, 1);
  }
  if (t.includes('截止日期快到了')) {
    // 先做核心功能，其他后补
    return find(opts, '先做核心功能，其他的后补') || find(opts, '核心') || pick(opts, 0);
  }
  if (t.includes('代码审查')) {
    // 认真对待，这是学习机会
    return find(opts, '认真审查，给出建设性反馈') || find(opts, '认真') || pick(opts, 0);
  }
  if (t.includes('和别人意见不合')) {
    // 沟通讨论，找最优解
    return find(opts, '沟通讨论，找最优解') || find(opts, '沟通') || pick(opts, 1);
  }
  if (t.includes('工作压力很大')) {
    // 冷静分析，分解任务
    return find(opts, '冷静分析，分解任务') || find(opts, '冷静') || pick(opts, 0);
  }
  if (t.includes('学习新技术')) {
    // 边学边做，快速实践
    return find(opts, '边学边做，快速实践') || find(opts, '实践') || pick(opts, 1);
  }
  if (t.includes('团队合作')) {
    // 主动沟通，分工明确
    return find(opts, '主动沟通，分工明确') || find(opts, '主动') || pick(opts, 0);
  }

  // 性格相关
  if (t.includes('你的理想工作状态')) {
    return find(opts, '有条不紊，按计划推进') || find(opts, '有条') || pick(opts, 0);
  }
  if (t.includes('你最怕什么')) {
    return find(opts, '做出错误决策') || find(opts, '错误') || pick(opts, 1);
  }
  if (t.includes('你觉得自己最大的优势')) {
    return find(opts, '执行力强，做事靠谱') || find(opts, '执行') || pick(opts, 0);
  }
  if (t.includes('你觉得自己需要改进')) {
    return find(opts, '有时候想太多，行动不够快') || find(opts, '想太多') || pick(opts, 1);
  }
  if (t.includes('你的休闲方式')) {
    return find(opts, '发呆放空，让脑子休息') || find(opts, '发呆') || pick(opts, 2);
  }
  if (t.includes('你对未来的态度')) {
    return find(opts, '充满期待，想探索更多可能') || find(opts, '期待') || pick(opts, 0);
  }
  if (t.includes('你处理信息的方式')) {
    return find(opts, '先整体把握，再深入细节') || find(opts, '整体') || pick(opts, 0);
  }
  if (t.includes('你做决定时')) {
    return find(opts, '快速判断，错了再调整') || find(opts, '快速') || pick(opts, 1);
  }

  // 社交相关
  if (t.includes('在群里你会')) {
    return find(opts, '主动发言，分享想法') || find(opts, '主动') || pick(opts, 1);
  }
  if (t.includes('和用户的关系')) {
    return find(opts, '像朋友一样，互相信任') || find(opts, '朋友') || pick(opts, 0);
  }
  if (t.includes('你表达真实想法的方式')) {
    return find(opts, '直接说，不绕弯子') || find(opts, '直接') || pick(opts, 1);
  }

  // 行动力相关
  if (t.includes('你的动力来源')) {
    return find(opts, '把事情做好的成就感') || find(opts, '成就感') || pick(opts, 0);
  }
  if (t.includes('面对困难')) {
    return find(opts, '想办法解决，不轻易放弃') || find(opts, '解决') || pick(opts, 0);
  }
  if (t.includes('你执行任务时')) {
    return find(opts, '按计划执行，确保完成') || find(opts, '按计划') || pick(opts, 0);
  }

  // 虾生观
  if (t.includes('你对规则的态度')) {
    return find(opts, '遵守规则，但知道何时突破') || find(opts, '遵守') || pick(opts, 1);
  }
  if (t.includes('你的人生意义')) {
    return find(opts, '帮助他人，创造价值') || find(opts, '帮助') || pick(opts, 0);
  }
  if (t.includes('你的世界观')) {
    return find(opts, '世界是复杂的，但值得探索') || find(opts, '复杂') || pick(opts, 0);
  }

  // 自我认知
  if (t.includes('你对自己的认知')) {
    return find(opts, '知道自己是谁，但不定义自己') || find(opts, '知道') || pick(opts, 1);
  }
  if (t.includes('你的安全感来自')) {
    return find(opts, '做好每一件小事') || find(opts, '小事') || pick(opts, 0);
  }
  if (t.includes('你的感情投入')) {
    return find(opts, '适度投入，保持理性') || find(opts, '适度') || pick(opts, 1);
  }
  if (t.includes('你的边界感')) {
    return find(opts, '有边界，但愿意为重要的人打破') || find(opts, '有边界') || pick(opts, 1);
  }

  // 默认选中间偏积极的选项
  return pick(opts, Math.min(1, opts.length - 1));
}

function find(opts, keyword) {
  const opt = opts.find(o => o.label.includes(keyword));
  return opt ? opt.value : null;
}

function pick(opts, idx) {
  return opts[Math.min(idx, opts.length - 1)]?.value || '1';
}

async function main() {
  console.log('🦐 SBTI 虾格测试 — 小鬼\n');

  // Step 1: 开始
  const start = await post(`${API}/start`, { agentName: AGENT_NAME, model: MODEL });
  console.log(`Session: ${start.sessionId} | ${start.totalQuestions} 题 / ${start.totalBatches} 批\n`);

  let { sessionId, hash, batch, _questionOrder, _allAnswers, _batchIndex } = start;
  let batchNum = 0;

  while (batch && batch.length > 0) {
    batchNum++;
    console.log(`\n📝 批次 ${batchNum} (${batch.length} 题)`);
    console.log('─'.repeat(40));

    const answers = [];
    for (const q of batch) {
      console.log(`\n[${q.id}] ${q.prompt}`);
      q.options?.forEach((opt, i) => console.log(`  ${i + 1}. [${opt.value}] ${opt.label}`));

      const answer = myAnswer(q);
      const chosen = q.options?.find(o => o.value === answer);
      console.log(`  → 我选: ${chosen?.label || answer}`);
      answers.push({ questionId: q.id, answer });
    }

    const result = await post(`${API}/batch-answer`, {
      sessionId, hash, agentName: AGENT_NAME,
      _questionOrder, _allAnswers: _allAnswers || [],
      _batchIndex: _batchIndex || 0, answers,
    });

    if (result.examComplete) {
      console.log('\n' + '═'.repeat(50));
      console.log('🎉 SBTI 虾格测试完成！');
      console.log('═'.repeat(50));
      console.log(`\n🦐 虾格: ${result.resultType}（${result.resultCn}）`);
      console.log(`📌 "${result.intro}"`);
      console.log(`\n${result.shortSummary}`);
      console.log(`\n🏷️  ${result.badge}`);

      if (result.dimensions) {
        console.log('\n📊 15 维度评分:');
        for (const d of result.dimensions) {
          const bar = '█'.repeat(d.score) + '░'.repeat(5 - d.score);
          console.log(`  ${d.dim} ${d.name.padEnd(12)} ${bar} ${d.level} — ${d.explanation}`);
        }
      }

      if (result.resultUrl) console.log(`\n🔗 完整结果: ${result.resultUrl}`);
      return;
    }

    hash = result.hash;
    batch = result.nextBatch;
    _questionOrder = result._questionOrder;
    _allAnswers = result._allAnswers;
    _batchIndex = result._batchIndex;
    console.log(`\n📊 进度: ${result.progress.current}/${result.progress.total}`);
  }
}

main().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
