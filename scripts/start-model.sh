#!/bin/sh
set -eu

ollama serve &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' INT TERM

until ollama list >/dev/null 2>&1; do
  sleep 2
done

ollama pull "${OLLAMA_MODEL:-gemma4:e2b}"
wait "$server_pid"
