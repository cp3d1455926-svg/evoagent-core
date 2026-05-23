import { ToolExecutor } from './src/tools/tool-executor.js';
const te = new ToolExecutor();
const result = await te.execute('git', { action: 'status' });
console.log(JSON.stringify(result, null, 2));
