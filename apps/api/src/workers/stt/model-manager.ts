// Whisper.cpp model management - download and verify models

import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';

const MODELS_DIR = process.env.WHISPER_MODELS_DIR || './data/models';

// Model configurations - using tiny or base for CPU-only machines
export const WHISPER_MODELS = {
  tiny: {
    name: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    size: 75555856, // ~75MB
    // Note: Actual SHA would be from whisper.cpp releases
    sha256: null, // Skip verification for now, can be added later
  },
  base: {
    name: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    size: 148518573, // ~148MB
    sha256: null,
  },
  small: {
    name: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    size: 487601964, // ~488MB
    sha256: null,
  },
};

export type WhisperModelSize = keyof typeof WHISPER_MODELS;

export interface ModelInfo {
  name: string;
  path: string;
  exists: boolean;
  size: number;
  isValid: boolean;
}

/**
 * Ensure models directory exists
 */
export function ensureModelsDir(): void {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`[ModelManager] Created models directory: ${MODELS_DIR}`);
  }
}

/**
 * Get path to model file
 */
export function getModelPath(modelSize: WhisperModelSize = 'tiny'): string {
  return path.join(MODELS_DIR, WHISPER_MODELS[modelSize].name);
}

/**
 * Check if model exists and has correct size
 */
export function checkModel(modelSize: WhisperModelSize = 'tiny'): ModelInfo {
  ensureModelsDir();
  
  const model = WHISPER_MODELS[modelSize];
  const modelPath = path.join(MODELS_DIR, model.name);
  
  if (!fs.existsSync(modelPath)) {
    return {
      name: model.name,
      path: modelPath,
      exists: false,
      size: 0,
      isValid: false,
    };
  }

  const stats = fs.statSync(modelPath);
  const isValid = stats.size === model.size;

  return {
    name: model.name,
    path: modelPath,
    exists: true,
    size: stats.size,
    isValid,
  };
}

/**
 * Download a model with progress
 */
export async function downloadModel(
  modelSize: WhisperModelSize = 'tiny',
  onProgress?: (downloaded: number, total: number) => void
): Promise<ModelInfo> {
  ensureModelsDir();
  
  const model = WHISPER_MODELS[modelSize];
  const modelPath = path.join(MODELS_DIR, model.name);
  const tempPath = `${modelPath}.tmp`;

  console.log(`[ModelManager] Downloading ${model.name}...`);
  console.log(`[ModelManager] URL: ${model.url}`);
  console.log(`[ModelManager] Destination: ${modelPath}`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    let downloaded = 0;

    https.get(model.url, { 
      headers: {
        'User-Agent': 'tl-voice-inbox/1.0'
      }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(tempPath);
          
          https.get(redirectUrl, { 
            headers: {
              'User-Agent': 'tl-voice-inbox/1.0'
            }
          }, (redirectResponse) => {
            handleResponse(redirectResponse);
          }).on('error', (err) => {
            file.close();
            fs.unlinkSync(tempPath);
            reject(err);
          });
          return;
        }
      }

      handleResponse(response);
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      reject(err);
    });

    function handleResponse(response: import('http').IncomingMessage): void {
      const total = parseInt(response.headers['content-length'] || '0', 10);
      
      response.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (onProgress) {
          onProgress(downloaded, total);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        
        // Move temp file to final location
        fs.renameSync(tempPath, modelPath);
        
        console.log(`[ModelManager] Download complete: ${model.name}`);
        
        const info = checkModel(modelSize);
        resolve(info);
      });
    }
  });
}

/**
 * Ensure model is available (download if needed)
 */
export async function ensureModel(modelSize: WhisperModelSize = 'tiny'): Promise<string> {
  const info = checkModel(modelSize);
  
  if (info.exists && info.isValid) {
    console.log(`[ModelManager] Model ${modelSize} already exists and is valid`);
    return info.path;
  }

  if (info.exists && !info.isValid) {
    console.warn(`[ModelManager] Model ${modelSize} exists but size is incorrect, re-downloading...`);
    fs.unlinkSync(info.path);
  }

  await downloadModel(modelSize, (downloaded, total) => {
    const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    const mb = (downloaded / 1024 / 1024).toFixed(1);
    const totalMb = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
    process.stdout.write(`\r[ModelManager] Progress: ${percent}% (${mb}MB / ${totalMb}MB)`);
  });
  process.stdout.write('\n');

  return getModelPath(modelSize);
}

/**
 * Verify SHA256 checksum (if available)
 */
export function verifyChecksum(modelSize: WhisperModelSize): boolean {
  const model = WHISPER_MODELS[modelSize];
  
  if (!model.sha256) {
    console.log(`[ModelManager] No SHA256 configured for ${modelSize}, skipping verification`);
    return true;
  }

  const modelPath = getModelPath(modelSize);
  
  if (!fs.existsSync(modelPath)) {
    return false;
  }

  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(modelPath);
  hash.update(data);
  const computed = hash.digest('hex');

  return computed === model.sha256;
}

/**
 * List available models
 */
export function listModels(): ModelInfo[] {
  ensureModelsDir();
  
  return (Object.keys(WHISPER_MODELS) as WhisperModelSize[]).map(size => checkModel(size));
}

/**
 * Delete a model
 */
export function deleteModel(modelSize: WhisperModelSize): boolean {
  const info = checkModel(modelSize);
  
  if (info.exists) {
    fs.unlinkSync(info.path);
    console.log(`[ModelManager] Deleted model: ${info.name}`);
    return true;
  }
  
  return false;
}
