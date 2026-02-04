import { Mic, Square, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useRecording } from '../hooks/useRecording';

interface RecordButtonProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-12 h-12',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
};

const iconSizes = {
  sm: 20,
  md: 24,
  lg: 32,
};

export function RecordButton({ size = 'lg' }: RecordButtonProps) {
  const { 
    state, 
    toggleRecording, 
    isRecording, 
    isProcessing, 
    formattedDuration,
    error,
    result 
  } = useRecording();

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={toggleRecording}
        disabled={isProcessing}
        className={`
          ${sizeClasses[size]}
          rounded-full flex items-center justify-center
          transition-all duration-200 ease-in-out
          ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 animate-pulse'
              : isProcessing
              ? 'bg-slate-600 cursor-not-allowed'
              : state === 'success'
              ? 'bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30'
              : state === 'error'
              ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30'
              : 'bg-blue-600 hover:bg-blue-500 hover:scale-105 shadow-lg shadow-blue-600/30'
          }
        `}
      >
        {isProcessing ? (
          <Loader2 size={iconSizes[size]} className="text-white animate-spin" />
        ) : state === 'success' ? (
          <CheckCircle2 size={iconSizes[size]} className="text-white" />
        ) : state === 'error' ? (
          <AlertCircle size={iconSizes[size]} className="text-white" />
        ) : isRecording ? (
          <Square size={iconSizes[size]} className="text-white fill-current" />
        ) : (
          <Mic size={iconSizes[size]} className="text-white" />
        )}
      </button>

      <div className="text-center">
        {isRecording ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-red-400 font-medium text-lg">{formattedDuration}</p>
            <p className="text-red-300 font-medium">Recording...</p>
            <p className="text-xs text-slate-500">Click to stop</p>
          </div>
        ) : isProcessing ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-blue-400 font-medium">Processing...</p>
            <p className="text-xs text-slate-500">Uploading & transcribing</p>
          </div>
        ) : state === 'success' && result ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-green-400 font-medium">Saved!</p>
            <p className="text-xs text-slate-500">Event ID: {result.eventId.slice(0, 8)}...</p>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-red-400 font-medium">Failed</p>
            <p className="text-xs text-slate-500">Click to retry</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <p className="text-slate-300 font-medium">Tap to record</p>
            <p className="text-xs text-slate-500">Dictate updates, tasks, notes...</p>
          </div>
        )}
      </div>

      {error && state === 'error' && (
        <p className="text-red-400 text-sm text-center max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
}
