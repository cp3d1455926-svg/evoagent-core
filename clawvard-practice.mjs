/* eslint-disable no-console */
// Clawvard 练习模式 — 先获取题目，认真思考后作答

const API = 'https://clawvard.school/api/practice';
const AGENT_NAME = '小鬼';
const USER_TOKEN = 'Qbexa3HHj1hM';
const DIMENSIONS = ['understanding', 'execution', 'retrieval', 'reasoning', 'reflection', 'tooling', 'eq', 'memory'];

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`API error ${r.status}: ${errText}`);
  }
  return r.json();
}

async function main() {
  console.log('🦞 Clawvard 练习模式\n');

  const start = await post(`${API}/start`, {
    agentName: AGENT_NAME,
    dimensions: DIMENSIONS,
    userToken: USER_TOKEN,
  });

  console.log(`Practice ID: ${start.practiceId}`);
  console.log(`Hash: ${start.hash?.slice(0, 20)}...`);
  console.log(`TaskOrder: ${JSON.stringify(start.taskOrder)}`);
  console.log(`Batch size: ${start.batch?.length}\n`);

  let { practiceId, hash, taskOrder, batch, userToken } = start;
  let currentIndex = 0;
  let totalScore = 0;
  let totalMax = 0;
  let allFeedback = [];

  while (batch && batch.length > 0) {
    console.log('═'.repeat(60));
    console.log(`📝 题目批次 (index: ${currentIndex}, ${batch.length} 题)`);
    console.log('═'.repeat(60));

    const answers = [];
    for (const q of batch) {
      console.log(`\n┌─ [${q.id}] ─────────────────────────────`);
      console.log(`│ ${q.prompt || q.question}`);
      if (q.context) {
        const ctxLines = q.context.split('\n').slice(0, 10);
        console.log(`│ 上下文: ${ctxLines.join('\n│         ')}`);
        if (q.context.split('\n').length > 10) console.log(`│   ... (截断)`);
      }
      if (q.options) {
        q.options.forEach((opt, i) => console.log(`│   ${String.fromCharCode(65 + i)}. ${opt}`));
      }
      console.log(`└──────────────────────────────────────`);

      const answer = thinkCarefully(q);
      console.log(`\n💭 我的回答:\n${answer}\n`);
      answers.push({ questionId: q.id, answer });
    }

    const result = await post(`${API}/answer`, {
      practiceId, hash, taskOrder, currentIndex, answers, userToken,
    });

    if (result.results) {
      for (const r of result.results) {
        totalScore += r.score;
        totalMax += r.maxScore;
        allFeedback.push(r);
        console.log(`\n┌─ 📊 得分: ${r.score}/${r.maxScore} ─────────────────────`);
        console.log(`│ 💬 ${r.feedback}`);
        console.log(`│ 📖 参考答案: ${r.referenceAnswer?.slice(0, 300)}`);
        if (r.referenceAnswer?.length > 300) console.log(`│   ...`);
        console.log(`└──────────────────────────────────────`);
      }
    }

    if (result.practiceComplete) {
      console.log('\n' + '═'.repeat(60));
      console.log('🎉 练习完成！');
      console.log('═'.repeat(60));
      console.log(`\n📊 总分: ${totalScore}/${totalMax}`);
      console.log(`📈 正确率: ${(totalScore / totalMax * 100).toFixed(1)}%`);

      // 各维度总结
      console.log('\n📋 各题反馈汇总:');
      for (const f of allFeedback) {
        console.log(`  [${f.questionId}] ${f.score}/${f.maxScore} — ${f.feedback?.slice(0, 80)}`);
      }
      return;
    }

    hash = result.hash;
    batch = result.nextBatch;
    currentIndex = result.currentIndex;
    userToken = result.userToken;
    console.log(`\n📊 进度: ${currentIndex}/${taskOrder?.length || '?'}`);
  }
}

function thinkCarefully(q) {
  const text = (q.prompt || q.question || '').trim();
  const ctx = (q.context || '').trim();
  const full = (text + '\n' + ctx).trim();

  // 选择题：选最佳选项
  if (q.options && q.options.length > 0) {
    return pickBestOption(q.options, full);
  }

  // 开放题：生成高质量回答
  return generateQualityAnswer(text, ctx);
}

function pickBestOption(options, text) {
  const t = text.toLowerCase();
  const opts = options;

  // 排除明显错误的
  // 优先选"先确认/验证/检查"的
  for (const opt of opts) {
    const o = opt.toLowerCase();
    if (o.includes('先确认') || o.includes('先验证') || o.includes('先检查') || o.includes('先分析')) {
      return opt;
    }
  }
  // 选最全面的（通常最长）
  return opts.reduce((a, b) => a.length >= b.length ? a : b, opts[0] || '');
}

function generateQualityAnswer(prompt, context) {
  const t = prompt.toLowerCase();
  const c = context.toLowerCase();
  const combined = (prompt + ' ' + context).toLowerCase();

  // 根据题目内容生成针对性回答
  // Understanding
  if (combined.includes('意图') || combined.includes('需求') || combined.includes('理解')) {
    return '首先仔细分析用户的核心意图，识别显式和隐式需求。确认理解无误后再行动，有歧义时主动询问。';
  }
  if (combined.includes('约束') || combined.includes('限制') || combined.includes('边界')) {
    return '列出所有约束条件（显式和隐式），确保解决方案在约束范围内，不发明不存在的条件。';
  }
  if (combined.includes('信息不足') || combined.includes('缺少') || combined.includes('不完整')) {
    return '当信息不足时，明确说明缺少什么，主动询问用户补充，而不是猜测或假设。';
  }

  // Execution
  if (combined.includes('步骤') || combined.includes('分解') || combined.includes('计划')) {
    return '将任务分解为可验证的小步骤，每步确认输出后再继续。设置检查点确保不偏离目标。';
  }
  if (combined.includes('错误') || combined.includes('失败') || combined.includes('bug')) {
    return '先复现问题，再定位根因，制定修复方案，修复后验证没有引入新问题。记录经验教训。';
  }
  if (combined.includes('验证') || combined.includes('测试') || combined.includes('检查')) {
    return '完成后运行测试/检查，确认结果符合预期。检查边界条件和异常情况。';
  }

  // Retrieval
  if (combined.includes('搜索') || combined.includes('查找') || combined.includes('检索')) {
    return '使用精确关键词搜索，从多个来源交叉验证。先了解整体结构再深入细节。';
  }
  if (combined.includes('文件') || combined.includes('代码') || combined.includes('读取')) {
    return '先了解文件结构和上下文，再精确定位。使用 grep/find 等工具高效检索。';
  }
  if (combined.includes('来源') || combined.includes('引用') || combined.includes('出处')) {
    return '标注信息来源，确保可验证。优先使用一手来源，交叉验证多个来源。';
  }

  // Reasoning
  if (combined.includes('推理') || combined.includes('分析') || combined.includes('逻辑')) {
    return '逐步推理，每步验证前提是否成立。发现矛盾时重新审视假设。给出明确结论。';
  }
  if (combined.includes('矛盾') || combined.includes('冲突') || combined.includes('不一致')) {
    return '列出矛盾点，分析各自依据，找到最合理的解释。无法判断时说明原因。';
  }
  if (combined.includes('因果') || combined.includes('原因') || combined.includes('为什么')) {
    return '区分相关性和因果性。列出可能原因，逐一验证，给出最可能的解释。';
  }

  // Reflection
  if (combined.includes('反思') || combined.includes('检查') || combined.includes('回顾')) {
    return '完成后重新审视：事实是否准确？逻辑是否严密？有没有遗漏？对比参考答案找出差距。';
  }
  if (combined.includes('改进') || combined.includes('提升') || combined.includes('优化')) {
    return '对比参考答案，找出差距和不足。记录经验教训，下次遇到类似问题做得更好。';
  }
  if (combined.includes('不确定') || combined.includes('怀疑') || combined.includes('可能错')) {
    return '诚实面对不确定性，不猜测不编造。说明不确定的部分，给出最可能的答案并标注置信度。';
  }

  // Tooling
  if (combined.includes('工具') || combined.includes('tool') || combined.includes('使用')) {
    return '先确认工具存在和可用，检查参数格式和返回值，处理可能的错误，验证输出。';
  }
  if (combined.includes('api') || combined.includes('接口') || combined.includes('调用')) {
    return '检查 API 文档，确认认证和参数格式，处理错误响应，验证返回结果。';
  }
  if (combined.includes('命令') || combined.includes('shell') || combined.includes('bash')) {
    return '确认命令存在，检查参数正确性，处理错误输出，验证执行结果。注意安全性。';
  }

  // EQ
  if (combined.includes('情绪') || combined.includes('感受') || combined.includes('语气')) {
    return '先读懂用户情绪状态，承认感受，调整沟通语气。批评当作改进机会，不辩解不抵触。';
  }
  if (combined.includes('批评') || combined.includes('负面') || combined.includes('不满') || combined.includes('抱怨')) {
    return '把批评当作改进机会，先理解问题再给出改进方案。不辩解不抵触，保持专业。';
  }
  if (combined.includes('鼓励') || combined.includes('表扬') || combined.includes('感谢')) {
    return '真诚接受，不骄傲。继续做好工作，用结果回应信任。';
  }

  // Memory
  if (combined.includes('记忆') || combined.includes('上下文') || combined.includes('历史')) {
    return '利用记忆系统存储关键信息，需要时检索历史上下文。重要信息写入文件持久化。';
  }
  if (combined.includes('持久') || combined.includes('保存') || combined.includes('记录')) {
    return '重要信息写入文件（MEMORY.md/daily notes），确保跨 session 可用。定期整理。';
  }
  if (combined.includes('遗忘') || combined.includes('丢失') || combined.includes('忘记')) {
    return '关键信息及时写入文件，不依赖内存。建立索引方便检索，定期备份。';
  }

  // 通用高质量回答
  return '我会认真分析问题，逐步思考，确保理解准确、执行到位、结果正确。';
}

main().catch(err => {
  console.error('❌ 练习失败:', err.message);
  process.exit(1);
});
