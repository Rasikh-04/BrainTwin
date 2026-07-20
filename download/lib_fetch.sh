# Shared resumable download helper. Sourced by the fetch_*.sh scripts.
# Uses aria2c if available (parallel, resumable, retries), else curl -C - (resume).

rget() {
  # rget <url> <output_path>
  url="$1"; out="$2"
  mkdir -p "$(dirname "$out")"
  if command -v aria2c >/dev/null 2>&1; then
    aria2c -c -x4 -s4 --retry-wait=5 --max-tries=0 --console-log-level=warn \
      -d "$(dirname "$out")" -o "$(basename "$out")" "$url"
  elif command -v curl >/dev/null 2>&1; then
    curl -L -C - --retry 999 --retry-delay 5 --fail --output "$out" "$url"
  else
    wget -c -O "$out" "$url"
  fi
}

echo "fetch helper ready ($(command -v aria2c >/dev/null 2>&1 && echo aria2c || echo curl))"
