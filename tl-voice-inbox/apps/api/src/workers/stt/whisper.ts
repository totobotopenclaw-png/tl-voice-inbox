// Whisper.cpp CLI wrapper for transcription

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface TranscriptionOptions {
  language?: string;
  translate?: boolean;
  threads?: number;
  processors?: number;
  maxLen?: number;
}

export interface TranscriptionResult {
  success: boolean;
  text: string;
  language?: string;
  duration?: number;
  error?: string;
}

// Default whisper.cpp CLI path - can be overridden via env
const WHISPER_CLI_PATH = process.env.WHISPER_CLI_PATH || 'whisper-cli';

/**
 * Check if whisper-cli is available
 */
export async function checkWhisperCli(): Promise<{ available: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(WHISPER_CLI_PATH, ['--help'], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0 || stdout.includes('whisper') || stderr.includes('whisper')) {
        // Extract version if available
        const versionMatch = stdout.match(/version\s*v?(\d+\.\d+\.?\d*)/i) || 
                             stderr.match(/version\s*v?(\d+\.\d+\.?\d*)/i);
        resolve({
          available: true,
          version: versionMatch?.[1] || 'unknown',
        });
      } else {
        resolve({
          available: false,
          error: `whisper-cli not found at ${WHISPER_CLI_PATH}. Please install whisper.cpp or set WHISPER_CLI_PATH`,
        });
      }
    });
    
    proc.on('error', (err) => {
      resolve({
        available: false,
        error: `Failed to run whisper-cli: ${err.message}`,
      });
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve({
        available: false,
        error: 'Timeout checking whisper-cli',
      });
    }, 5000);
  });
}

/**
 * Transcribe audio file using whisper.cpp CLI
 */
export async function transcribe(
  audioPath: string,
  modelPath: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  // Verify audio file exists
  if (!fs.existsSync(audioPath)) {
    return {
      success: false,
      text: '',
      error: `Audio file not found: ${audioPath}`,
    };
  }

  // Verify model exists
  if (!fs.existsSync(modelPath)) {
    return {
      success: false,
      text: '',
      error: `Model file not found: ${modelPath}`,
    };
  }

  const args: string[] = [
    '-f', audioPath,           // Input file
    '-m', modelPath,           // Model file
    '-l', options.language || 'es',  // Language (default Spanish)
    '-otxt',                   // Output to text file
    '-of', audioPath,          // Output file base name (whisper adds .txt)
    '--no-timestamps',         // No timestamps in output
  ];

  // Add optional arguments
  if (options.translate) {
    args.push('--translate');
  }

  if (options.threads) {
    args.push('-t', options.threads.toString());
  }

  if (options.processors) {
    args.push('-p', options.processors.toString());
  }

  return new Promise((resolve) => {
    console.log(`[Whisper] Starting transcription: ${audioPath}`);
    console.log(`[Whisper] Model: ${path.basename(modelPath)}`);
    console.log(`[Whisper] Language: ${options.language || 'es'}`);

    const startTime = Date.now();
    const proc = spawn(WHISPER_CLI_PATH, args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Log progress
      if (chunk.includes('%') || chunk.includes('loading')) {
        process.stdout.write(`\r[Whisper] ${chunk.trim()}`);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      process.stdout.write('\n');

      if (code !== 0) {
        console.error(`[Whisper] Process exited with code ${code}`);
        console.error(`[Whisper] stderr: ${stderr}`);
        
        resolve({
          success: false,
          text: '',
          error: `whisper-cli failed with code ${code}: ${stderr}`,
        });
        return;
      }

      // Read the output text file
      const outputPath = `${audioPath}.txt`;
      
      try {
        if (!fs.existsSync(outputPath)) {
          // Try to extract from stdout as fallback
          const text = extractTextFromOutput(stdout, stderr);
          
          if (text) {
            console.log(`[Whisper] Transcription completed in ${duration}ms`);
            resolve({
              success: true,
              text: text.trim(),
              duration: duration / 1000,
            });
          } else {
            resolve({
              success: false,
              text: '',
              error: 'Output file not created and no text extracted from stdout',
            });
          }
          return;
        }

        const text = fs.readFileSync(outputPath, 'utf-8');
        
        // Clean up the output file
        try {
          fs.unlinkSync(outputPath);
        } catch {
          // Ignore cleanup errors
        }

        console.log(`[Whisper] Transcription completed in ${duration}ms`);
        console.log(`[Whisper] Text length: ${text.length} chars`);

        resolve({
          success: true,
          text: text.trim(),
          duration: duration / 1000,
        });
      } catch (err) {
        resolve({
          success: false,
          text: '',
          error: `Failed to read output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        text: '',
        error: `Failed to spawn whisper-cli: ${err.message}`,
      });
    });

    // Timeout after 5 minutes (transcription can be slow on CPU)
    setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
      
      resolve({
        success: false,
        text: '',
        error: 'Transcription timeout (5 minutes)',
      });
    }, 5 * 60 * 1000);
  });
}

/**
 * Extract transcription text from whisper output
 * Used as fallback when output file is not created
 */
function extractTextFromOutput(stdout: string, stderr: string): string {
  // Try to find text in stdout/stderr
  // whisper.cpp outputs the transcription after processing
  
  const lines = (stdout + '\n' + stderr).split('\n');
  const textLines: string[] = [];
  let inTranscription = false;
  
  for (const line of lines) {
    // Skip empty lines and progress indicators
    if (!line.trim() || line.includes('%') || line.includes('loading')) {
      continue;
    }
    
    // Skip timing and metadata lines
    if (line.match(/^\[\d+:\d+/)) {
      inTranscription = true;
      // Extract text after timestamp
      const match = line.match(/^\[\d+:\d+[^\]]*\]\s*(.+)/);
      if (match) {
        textLines.push(match[1].trim());
      }
      continue;
    }
    
    // If we see regular text after processing, collect it
    if (inTranscription && line.trim() && !line.startsWith('whisper_')) {
      textLines.push(line.trim());
    }
  }
  
  return textLines.join(' ');
}

/**
 * Convert audio file to WAV format if needed
 * whisper.cpp works best with 16kHz mono WAV
 */
export async function convertToWav(
  inputPath: string,
  outputPath?: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  // For now, assume input is already in a compatible format
  // In production, could use ffmpeg here
  
  const outPath = outputPath || inputPath.replace(/\.[^/.]+$/, '.wav');
  
  // If it's already a wav, just return it
  if (inputPath.endsWith('.wav')) {
    return { success: true, path: inputPath };
  }
  
  // Check if ffmpeg is available
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',      // 16kHz sample rate
      '-ac', '1',          // Mono
      '-c:a', 'pcm_s16le', // 16-bit PCM
      '-y',                // Overwrite output
      outPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, path: outPath });
      } else {
        resolve({ 
          success: false, 
          error: `ffmpeg failed: ${stderr}` 
        });
      }
    });
    
    ffmpeg.on('error', (err) => {
      resolve({ 
        success: false, 
        error: `ffmpeg not available: ${err.message}. Please install ffmpeg or provide WAV files.` 
      });
    });
  });
}
