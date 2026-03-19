#!/usr/bin/env bash
set -euo pipefail

CLIENT="${CLIENT:-python3 scripts/tlv_client.py}"

wait_for_node() {
  local host="$1"
  local port="$2"
  for _ in $(seq 1 40); do
    if ${CLIENT} --host "${host}" --port "${port}" ping >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "node ${host}:${port} did not become ready in time" >&2
  return 1
}

wait_for_node 127.0.0.1 7379
wait_for_node 127.0.0.1 7380
wait_for_node 127.0.0.1 7381

KEY="demo:quorum:key"
VALUE="vaultkv-replicated-$(date +%s)"

${CLIENT} --host 127.0.0.1 --port 7379 set "${KEY}" "${VALUE}"

L=$(${CLIENT} --raw --host 127.0.0.1 --port 7379 get "${KEY}")
F2=$(${CLIENT} --raw --host 127.0.0.1 --port 7380 get "${KEY}")
F3=$(${CLIENT} --raw --host 127.0.0.1 --port 7381 get "${KEY}")

if [[ "${L}" != "${VALUE}" || "${F2}" != "${VALUE}" || "${F3}" != "${VALUE}" ]]; then
  echo "quorum demo failed"
  echo "leader=${L}"
  echo "follower2=${F2}"
  echo "follower3=${F3}"
  exit 1
fi

echo "quorum demo success"
echo "key=${KEY}"
echo "value=${VALUE}"

