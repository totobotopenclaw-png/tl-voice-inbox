#!/usr/bin/env node
// CLI script for LLM model management
// Usage: npm run llm:download <model-url> [name]

import { llmManager } from '../src/llm/manager.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'download') {
    const url = args[1];
    const name = args[2];

    console.log('[LLM CLI] Downloading model...');
    
    try {
      const info = await llmManager.downloadModel(url, name, (downloaded, total) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        const totalMb = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
        process.stdout.write(`\r[LLM CLI] Progress: ${percent}% (${mb}MB / ${totalMb}MB)`);
      });
      process.stdout.write('\n');

      console.log('[LLM CLI] Download complete:');
      console.log(`  Name: ${info.name}`);
      console.log(`  Path: ${info.path}`);
      console.log(`  Size: ${(info.size / 1024 / 1024).toFixed(1)}MB`);
    } catch (err) {
      console.error('[LLM CLI] Download failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else if (command === 'check') {
    const info = llmManager.checkModel();
    console.log('[LLM CLI] Model status:');
    console.log(`  Name: ${info.name}`);
    console.log(`  Path: ${info.path}`);
    console.log(`  Exists: ${info.exists}`);
    if (info.exists) {
      console.log(`  Size: ${(info.size / 1024 / 1024).toFixed(1)}MB`);
      console.log(`  Valid: ${info.isValid}`);
    }
  } else if (command === 'ensure') {
    console.log('[LLM CLI] Ensuring model is available...');
    try {
      const path = await llmManager.ensureModel();
      console.log(`[LLM CLI] Model ready: ${path}`);
    } catch (err) {
      console.error('[LLM CLI] Failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  npm run llm:download [url] [name]  - Download a model');
    console.log('  npm run llm:check                  - Check model status');
    console.log('  npm run llm:ensure                 - Ensure model exists (download if needed)');
    console.log('');
    console.log('Environment variables:');
    console.log('  LLM_MODELS_DIR - Directory for models (default: ./data/models)');
    process.exit(1);
  }
}

main();
