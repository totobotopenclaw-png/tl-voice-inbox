// LLM Runtime Manager - Handles llama-server subprocess
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';

const DATA_DIR = process.env.DATA_DIR || './data';
const LLM_MODELS_DIR = process.env.LLM_MODELS_DIR || path.join(DATA_DIR, 'models');

// Default model configuration - using Q4_K_M quantized model for CPU
export const DEFAULT_LLM_MODEL = {
  name: 'qwen2.5-7b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
  size: 4368438944, // ~4.4GB
  sha256: null, // Can be added later for verification
  contextSize: 8192,
};

export interface LLMModelConfig {
  name: string;
  path: string;
  url: string;
  size: number;
  sha256: string | null;
  contextSize: number;
}

export interface LLMServerConfig {
  modelPath: string;
  port: number;
  contextSize: number;
  threads: number;
  batchSize: number;
  gpuLayers: number; // 0 for CPU-only
}

export interface LLMServerStatus {
  isRunning: boolean;
  pid: number | null;
  port: number;
  config: LLMServerConfig | null;
  uptimeMs: number | null;
  lastError: string | null;
}

export interface ModelInfo {
  name: string;
  path: string;
  exists: boolean;
  size: number;
  isValid: boolean;
  downloadUrl?: string;
}

class LLMManager {
  private process: ChildProcess | null = null;
  private startTime: number | null = null;
  private config: LLMServerConfig | null = null;
  private lastError: string | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = false;

  // Find llama-server binary
  private findBinary(): string {
    // Check common locations
    const candidates = [
      process.env.LLAMA_SERVER_PATH,
      './llama-server',
      './llama.cpp/llama-server',
      '/usr/local/bin/llama-server',
      '/usr/bin/llama-server',
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      'llama-server binary not found. Please install llama.cpp and ensure llama-server is in PATH, ' +
      'or set LLAMA_SERVER_PATH environment variable.'
    );
  }

  // Ensure models directory exists
  private ensureModelsDir(): void {
    if (!fs.existsSync(LLM_MODELS_DIR)) {
      fs.mkdirSync(LLM_MODELS_DIR, { recursive: true });
    }
  }

  // Get path to model file
  getModelPath(modelName: string = DEFAULT_LLM_MODEL.name): string {
    return path.join(LLM_MODELS_DIR, modelName);
  }

  // Check if model exists and has correct size
  checkModel(modelName: string = DEFAULT_LLM_MODEL.name): ModelInfo {
    this.ensureModelsDir();
    
    const modelPath = this.getModelPath(modelName);
    
    if (!fs.existsSync(modelPath)) {
      return {
        name: modelName,
        path: modelPath,
        exists: false,
        size: 0,
        isValid: false,
      };
    }

    const stats = fs.statSync(modelPath);
    // For GGUF files, we just check if file exists and has reasonable size (> 1MB)
    const isValid = stats.size > 1024 * 1024;

    return {
      name: modelName,
      path: modelPath,
      exists: true,
      size: stats.size,
      isValid,
    };
  }

  // Download a model with progress
  async downloadModel(
    url: string = DEFAULT_LLM_MODEL.url,
    modelName?: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<ModelInfo> {
    this.ensureModelsDir();
    
    const name = modelName || path.basename(url);
    const modelPath = this.getModelPath(name);
    const tempPath = `${modelPath}.tmp`;

    console.log(`[LLMManager] Downloading ${name}...`);
    console.log(`[LLMManager] URL: ${url}`);
    console.log(`[LLMManager] Destination: ${modelPath}`);

    return new Promise((resolve, reject) => {
      let downloaded = 0;
      let file: fs.WriteStream | null = null;

      function doDownload(downloadUrl: string): void {
        file = fs.createWriteStream(tempPath);
        downloaded = 0;

        https.get(downloadUrl, {
          headers: {
            'User-Agent': 'tl-voice-inbox/1.0'
          }
        }, (response) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              file?.close();
              if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
              }
              doDownload(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            file?.close();
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          const total = parseInt(response.headers['content-length'] || '0', 10);

          response.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            if (onProgress) {
              onProgress(downloaded, total);
            }
          });

          response.pipe(file!);

          file!.on('finish', () => {
            file?.close();

            // Move temp file to final location
            fs.renameSync(tempPath, modelPath);

            console.log(`[LLMManager] Download complete: ${name}`);

            const info = {
              name,
              path: modelPath,
              exists: true,
              size: downloaded,
              isValid: true,
            };
            resolve(info);
          });

          file!.on('error', (err) => {
            file?.close();
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
            reject(err);
          });
        }).on('error', (err) => {
          file?.close();
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          reject(err);
        });
      }

      doDownload(url);
    });
  }

  // Ensure default model is available
  async ensureModel(): Promise<string> {
    const modelPath = this.getModelPath();
    
    if (fs.existsSync(modelPath)) {
      const stats = fs.statSync(modelPath);
      if (stats.size > 1024 * 1024) {
        console.log(`[LLMManager] Model already exists: ${modelPath}`);
        return modelPath;
      }
    }

    console.log(`[LLMManager] Model not found, downloading...`);
    const info = await this.downloadModel(DEFAULT_LLM_MODEL.url, undefined, (downloaded, total) => {
      const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
      const mb = (downloaded / 1024 / 1024).toFixed(0);
      const totalMb = total > 0 ? (total / 1024 / 1024).toFixed(0) : '?';
      process.stdout.write(`\r[LLMManager] Progress: ${percent}% (${mb}MB / ${totalMb}MB)`);
    });
    process.stdout.write('\n');
    return info.path;
  }

  // Start llama-server
  async start(config?: Partial<LLMServerConfig>): Promise<void> {
    if (this.process) {
      console.log('[LLMManager] Server already running');
      return;
    }

    try {
      // Ensure model exists
      const modelPath = await this.ensureModel();

      const binary = this.findBinary();
      
      this.config = {
        modelPath,
        port: config?.port || parseInt(process.env.LLM_PORT || '8080', 10),
        contextSize: config?.contextSize || parseInt(process.env.LLM_CONTEXT_SIZE || '8192', 10),
        threads: config?.threads || parseInt(process.env.LLM_THREADS || '4', 10),
        batchSize: config?.batchSize || parseInt(process.env.LLM_BATCH_SIZE || '512', 10),
        gpuLayers: config?.gpuLayers || parseInt(process.env.LLM_GPU_LAYERS || '0', 10),
      };

      const args = [
        '--model', this.config.modelPath,
        '--port', this.config.port.toString(),
        '--ctx-size', this.config.contextSize.toString(),
        '--threads', this.config.threads.toString(),
        '--batch-size', this.config.batchSize.toString(),
        '--n-gpu-layers', this.config.gpuLayers.toString(),
        '--log-disable', // Reduce noise
      ];

      console.log(`[LLMManager] Starting llama-server with args:`, args.join(' '));

      this.process = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.startTime = Date.now();
      this.isHealthy = false;

      // Handle process events
      this.process.on('error', (err) => {
        console.error('[LLMManager] Process error:', err);
        this.lastError = err.message;
        this.cleanup();
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[LLMManager] Process exited with code ${code}, signal ${signal}`);
        this.cleanup();
      });

      this.process.stdout?.on('data', (data) => {
        const output = data.toString();
        if (process.env.LLM_DEBUG) {
          console.log('[llama-server]', output.trim());
        }
        // Check for startup completion
        if (output.includes('HTTP server listening')) {
          console.log('[LLMManager] Server is ready');
          this.isHealthy = true;
        }
      });

      this.process.stderr?.on('data', (data) => {
        const output = data.toString();
        if (process.env.LLM_DEBUG) {
          console.error('[llama-server stderr]', output.trim());
        }
      });

      // Wait for server to be ready
      await this.waitForReady(60000); // 60 second timeout

      // Start health check
      this.startHealthCheck();

      console.log(`[LLMManager] Server started on port ${this.config.port}`);

    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  // Wait for server to be ready
  private async waitForReady(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const port = this.config?.port || 8080;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        if (response.ok) {
          this.isHealthy = true;
          return;
        }
      } catch {
        // Not ready yet, wait and retry
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error('Timeout waiting for llama-server to be ready');
  }

  // Start periodic health check
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, 30000); // Check every 30 seconds
  }

  // Check health
  async checkHealth(): Promise<boolean> {
    if (!this.process || !this.config) {
      this.isHealthy = false;
      return false;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${this.config.port}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      this.isHealthy = response.ok;
      return this.isHealthy;
    } catch {
      this.isHealthy = false;
      return false;
    }
  }

  // Stop llama-server
  async stop(): Promise<void> {
    if (!this.process) {
      console.log('[LLMManager] Server not running');
      return;
    }

    console.log('[LLMManager] Stopping server...');

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Try graceful shutdown first
    this.process.kill('SIGTERM');

    // Wait up to 5 seconds for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Force kill if still running
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }

    this.cleanup();
    console.log('[LLMManager] Server stopped');
  }

  // Restart server
  async restart(config?: Partial<LLMServerConfig>): Promise<void> {
    console.log('[LLMManager] Restarting server...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start(config);
  }

  // Cleanup internal state
  private cleanup(): void {
    this.process = null;
    this.startTime = null;
    this.isHealthy = false;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Get current status
  getStatus(): LLMServerStatus {
    return {
      isRunning: this.process !== null && !this.process.killed,
      pid: this.process?.pid || null,
      port: this.config?.port || 0,
      config: this.config,
      uptimeMs: this.startTime ? Date.now() - this.startTime : null,
      lastError: this.lastError,
    };
  }

  // Check if server is healthy
  isServerHealthy(): boolean {
    return this.isHealthy && this.process !== null && !this.process.killed;
  }

  // Get server URL
  getServerUrl(): string {
    const port = this.config?.port || 8080;
    return `http://127.0.0.1:${port}`;
  }

  // Call chat completions API
  async chatCompletions(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: string };
    } = {}
  ): Promise<unknown> {
    if (!this.isServerHealthy()) {
      throw new Error('LLM server is not healthy');
    }

    const url = `${this.getServerUrl()}/v1/chat/completions`;
    
    const body = {
      messages,
      temperature: options.temperature ?? 0.1, // Low temperature for structured output
      max_tokens: options.maxTokens ?? 4096,
      ...(options.responseFormat && { response_format: options.responseFormat }),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const llmManager = new LLMManager();
