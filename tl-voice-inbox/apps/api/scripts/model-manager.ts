#!/usr/bin/env node
// CLI script for model management

import { 
  listModels, 
  ensureModel, 
  deleteModel, 
  checkModel,
  type WhisperModelSize 
} from '../src/workers/stt/model-manager.js';

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  switch (command) {
    case 'list':
      console.log('Available models:');
      const models = listModels();
      for (const model of models) {
        const status = model.exists 
          ? (model.isValid ? '✓ ready' : '✗ invalid size')
          : '✗ not downloaded';
        const size = model.exists ? `(${(model.size / 1024 / 1024).toFixed(1)} MB)` : '';
        console.log(`  ${model.name} ${size} - ${status}`);
      }
      break;

    case 'download':
      const size = (arg as WhisperModelSize) || 'tiny';
      console.log(`Downloading ${size} model...`);
      try {
        const path = await ensureModel(size);
        console.log(`Model downloaded to: ${path}`);
      } catch (err) {
        console.error('Download failed:', err);
        process.exit(1);
      }
      break;

    case 'delete':
      if (!arg) {
        console.error('Usage: model-manager.ts delete <size>');
        process.exit(1);
      }
      const deleted = deleteModel(arg as WhisperModelSize);
      if (deleted) {
        console.log(`Model ${arg} deleted`);
      } else {
        console.log(`Model ${arg} not found`);
      }
      break;

    case 'check':
      const modelSize = (arg as WhisperModelSize) || 'tiny';
      const info = checkModel(modelSize);
      console.log(`Model: ${info.name}`);
      console.log(`Path: ${info.path}`);
      console.log(`Exists: ${info.exists}`);
      console.log(`Size: ${(info.size / 1024 / 1024).toFixed(1)} MB`);
      console.log(`Valid: ${info.isValid}`);
      break;

    default:
      console.log('Usage: model-manager.ts <command> [args]');
      console.log('');
      console.log('Commands:');
      console.log('  list              List all models');
      console.log('  download [size]   Download a model (tiny, base, small)');
      console.log('  delete <size>     Delete a model');
      console.log('  check [size]      Check model status');
      console.log('');
      console.log('Examples:');
      console.log('  model-manager.ts download tiny');
      console.log('  model-manager.ts check base');
      process.exit(1);
  }
}

main();
