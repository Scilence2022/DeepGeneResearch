/**
 * Smart Polling Example for DeepGeneResearch MCP Server
 * 
 * Problem: LLMs are expensive. Polling a long-running task with LLM calls
 * to check "is it done yet?" wastes money and latency.
 * 
 * Solution: Separate cheap HTTP status checks from expensive LLM processing.
 * - Status polling: simple HTTP → negligible cost
 * - Result processing: LLM only when status = "completed"
 * 
 * This version uses the optimized `deep-gene-research` tool directly,
 * wrapped in an async task queue with smart polling.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MCP_SERVER = 'http://localhost:3000/api/mcp';

// ─── Task Queue (In-Memory for Demo) ───────────────────────────────────────
const taskQueue = new Map();

// ─── 1. SUBMIT TASK (no LLM needed) ───────────────────────────────────────
async function submitResearchTask(geneSymbol, organism, options = {}) {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  console.log(`[${taskId}] 📋 Submitting research task: ${geneSymbol} in ${organism}`);
  
  taskQueue.set(taskId, {
    id: taskId,
    status: 'pending',
    geneSymbol,
    organism,
    options,
    submittedAt: Date.now(),
    completedAt: null,
    result: null,
    error: null,
    progress: 0,
    step: 'Queued'
  });

  // Fire-and-forget: start the async research in background
  executeResearchAsync(taskId, geneSymbol, organism, options);
  
  return { taskId, status: 'pending' };
}

// ─── 2. Background Research Executor ──────────────────────────────────────
async function executeResearchAsync(taskId, geneSymbol, organism, options) {
  try {
    updateTaskStatus(taskId, 'running', { progress: 5, step: 'Starting deep gene research...' });
    
    // Call the optimized single tool - runs the full workflow internally
    // This still takes 2-5 minutes, but we're tracking progress
    updateTaskStatus(taskId, 'running', { progress: 10, step: 'Researching gene function, pathways, regulation...' });
    
    const result = await mcpToolCall('deep-gene-research', {
      geneSymbol,
      organism,
      researchFocus: options.researchFocus || [
        'molecular_function',
        'metabolic_pathways',
        'protein_structure',
        'regulation'
      ],
      language: options.language || 'en-US',
      maxResult: options.maxResult || 10,
      enableCitationImage: true,
      enableReferences: true
    });
    
    updateTaskStatus(taskId, 'running', { progress: 90, step: 'Formatting final report...' });
    
    taskQueue.set(taskId, {
      ...taskQueue.get(taskId),
      status: 'completed',
      completedAt: Date.now(),
      progress: 100,
      step: 'Completed',
      result: {
        report: result.finalReport || result.report?.content,
        sources: result.sources || [],
        qualityMetrics: result.qualityMetrics || {},
        metadata: result.metadata || {}
      }
    });
    
    const task = taskQueue.get(taskId);
    console.log(`[${taskId}] ✅ Research completed in ${((task.completedAt - task.submittedAt) / 1000).toFixed(1)}s`);
    
  } catch (error) {
    taskQueue.set(taskId, {
      ...taskQueue.get(taskId),
      status: 'failed',
      completedAt: Date.now(),
      error: error.message
    });
    console.error(`[${taskId}] ❌ Error: ${error.message}`);
  }
}

// ─── 3. POLL STATUS (cheap HTTP, no LLM) ───────────────────────────────────
async function pollTaskStatus(taskId) {
  const task = taskQueue.get(taskId);
  if (!task) {
    return { error: 'Task not found', taskId };
  }
  
  return {
    taskId: task.id,
    status: task.status,
    progress: task.progress || 0,
    step: task.step || '',
    submittedAt: task.submittedAt,
    completedAt: task.completedAt,
    ...(task.status === 'completed' && { result: task.result }),
    ...(task.status === 'failed' && { error: task.error })
  };
}

// ─── 4. Smart Waiter ───────────────────────────────────────────────────────
// Uses smarter adaptive polling that starts slow and speeds up near completion
async function waitForCompletion(taskId, options = {}) {
  const {
    initialInterval = 10000,  // Start with 10 seconds
    maxInterval = 60000,      // Cap at 60 seconds  
    maxWait = 3600000,        // 60 minute max
    onProgress = null
  } = options;
  
  let interval = initialInterval;
  const startTime = Date.now();
  let lastProgress = 0;
  
  while (Date.now() - startTime < maxWait) {
    const status = await pollTaskStatus(taskId);
    
    if (status.status === 'completed') {
      return { success: true, result: status.result };
    }
    
    if (status.status === 'failed') {
      return { success: false, error: status.error };
    }
    
    if (onProgress && status.step) {
      onProgress({ taskId, ...status });
    }
    
    // Smart adjustment: if progress is accelerating, poll more frequently
    if (status.progress > lastProgress) {
      // Progress being made - could stay at current interval
      lastProgress = status.progress;
    }
    
    console.log(`[${taskId}] ⏳ ${status.step} (${status.progress}% complete) — next check in ${(interval/1000).toFixed(0)}s`);
    await sleep(interval);
    
    // Adaptive: gradually increase interval but cap it
    // When near completion (>80%), check more frequently
    if (status.progress > 80) {
      interval = Math.min(interval * 1.2, maxInterval);
    } else {
      interval = Math.min(interval * 1.5, maxInterval);
    }
  }
  
  return { success: false, error: 'Timeout waiting for task completion' };
}

// ─── MCP Tool Caller ───────────────────────────────────────────────────────
function mcpToolCall(toolName, arguments_) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: arguments_ }
    });

    const url = new URL(MCP_SERVER);
    const postData = Buffer.from(body);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
        'Accept': 'application/json'
      },
      timeout: 600000 // 10 minute timeout per tool call
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else if (parsed.result && parsed.result.content && parsed.result.content[0]) {
            const text = parsed.result.content[0].text;
            try {
              resolve(JSON.parse(text));
            } catch {
              resolve({ raw: text });
            }
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}. Data: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// ─── Utility ───────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateTaskStatus(taskId, status, extra = {}) {
  const task = taskQueue.get(taskId);
  if (task) {
    taskQueue.set(taskId, { ...task, status, ...extra });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧬 DeepGeneResearch with Smart Polling\n');
  console.log('='.repeat(60));
  console.log('Key Insight: Status polling uses simple HTTP (~$0), not LLM');
  console.log('LLM is only used for the actual research tool call\n');
  console.log('='.repeat(60) + '\n');

  // Step 1: Submit task (instant return, no LLM)
  console.log('Step 1: Submitting research task...');
  const { taskId } = await submitResearchTask('lysC', 'Escherichia coli', {
    language: 'en-US',
    maxResult: 10,
    researchFocus: [
      'molecular_function',
      'metabolic_pathways',
      'protein_structure',
      'regulation'
    ]
  });
  console.log(`✅ Task submitted: ${taskId}\n`);

  // Step 2: Wait with smart polling
  console.log('Step 2: Waiting for completion (polling with adaptive intervals)...\n');
  const waitResult = await waitForCompletion(taskId, {
    initialInterval: 10000,
    maxInterval: 60000,
    maxWait: 3600000,
    onProgress: ({ progress, step }) => {
      // Just console output - no LLM involved!
    }
  });

  if (!waitResult.success) {
    console.error(`❌ Research failed or timed out: ${waitResult.error}`);
    
    // Try to get partial result if available
    const partial = await pollTaskStatus(taskId);
    if (partial.progress > 0) {
      console.log(`Partial progress: ${partial.progress}% - ${partial.step}`);
    }
    process.exit(1);
  }

  // Step 3: Save result
  console.log('\n✅ Task completed! Saving report...\n');
  
  const reportContent = waitResult.result.report;
  const outputPath = path.join(__dirname, 'E_coli_lysC_smart_polling_report.md');
  fs.writeFileSync(outputPath, reportContent, 'utf-8');
  
  const task = taskQueue.get(taskId);
  console.log(`📄 Report saved to: ${outputPath}`);
  console.log(`📊 Quality: ${JSON.stringify(waitResult.result.qualityMetrics)}`);
  console.log(`📚 Sources: ${waitResult.result.sources?.length || 0} references`);
  console.log(`⏱️  Total time: ${((task.completedAt - task.submittedAt) / 1000).toFixed(1)}s`);
  console.log(`\n💡 LLM cost model: 1 deep-gene-research call + status polling via HTTP (~$0)`);
}

main().catch(console.error);
