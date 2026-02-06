cd /home/alpogue/.openclaw/workspace/tl-voice-inbox/apps/api
export LLAMA_SERVER_PATH=/home/alpogue/.local/bin/llama-server
export WHISPER_CLI_PATH=/home/alpogue/.local/bin/whisper-cli
nohup pnpm start > /tmp/tl-api.log 2>&1 &
echo $! > /tmp/tl-api.pid
echo "Started TL Voice Inbox API with PID $(cat /tmp/tl-api.pid)"