#!/usr/bin/env bash
set -euo pipefail

# Colors
if [[ -t 1 ]]; then
  GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BLUE="\033[0;34m"; NC="\033[0m"
else
  GREEN=""; YELLOW=""; RED=""; BLUE=""; NC=""
fi

usage() {
  cat <<EOF
${YELLOW}Usage:${NC}
  scripts/prove.sh <circuit_name> [input_file]

${YELLOW}Description:${NC}
  - Generates witness from WASM and input
  - Produces Groth16 proof and public signals
  - Verifies the proof
  - Exports Solidity calldata for on-chain verification

${YELLOW}Inputs/Outputs:${NC}
  - Inputs:  inputs/<circuit_name>.json (default) or custom [input_file]
  - Outputs: build/<circuit_name>/{<circuit>.wtns,proof.json,public.json,calldata.txt}
EOF
}

if [[ $# -lt 1 ]]; then
  usage; exit 1
fi

CIRCUITS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="$1"
INPUT_FILE="${2:-${CIRCUITS_DIR}/inputs/${NAME}.json}"
OUT_DIR="${CIRCUITS_DIR}/build/${NAME}"
JS_DIR="${OUT_DIR}/${NAME}_js"
WASM="${JS_DIR}/${NAME}.wasm"
GEN_WITNESS="${JS_DIR}/generate_witness.js"
WTNS="${OUT_DIR}/${NAME}.wtns"
ZKEY="${OUT_DIR}/${NAME}_final.zkey"
VK_JSON="${OUT_DIR}/verification_key.json"
PROOF_JSON="${OUT_DIR}/proof.json"
PUBLIC_JSON="${OUT_DIR}/public.json"
CALLDATA_TXT="${OUT_DIR}/calldata.txt"

echo -e "${BLUE}🔐 Generating ZK Proof for ${NAME}${NC}"

# Sanity checks
[[ -f "${WASM}" ]] || { echo -e "${RED}Missing WASM: ${WASM}${NC}. Build first: ./scripts/setup.sh"; exit 1; }
[[ -f "${GEN_WITNESS}" ]] || { echo -e "${RED}Missing generator: ${GEN_WITNESS}${NC}. Build first: ./scripts/setup.sh"; exit 1; }
[[ -f "${ZKEY}" ]] || { echo -e "${RED}Missing zkey: ${ZKEY}${NC}. Run setup to create zkey."; exit 1; }
[[ -f "${VK_JSON}" ]] || { echo -e "${RED}Missing verification key: ${VK_JSON}${NC}. Run setup to export VK."; exit 1; }
[[ -f "${INPUT_FILE}" ]] || { echo -e "${RED}Input file not found: ${INPUT_FILE}${NC}"; exit 1; }

echo -e "${BLUE}📊 Generating witness...${NC}"
node "${GEN_WITNESS}" "${WASM}" "${INPUT_FILE}" "${WTNS}" >/dev/null
echo -e "${GREEN}✅ Witness generated${NC}"

echo -e "${BLUE}🔑 Generating proof (this may take a minute)...${NC}"
START_S="$(date +%s || true)"
npx -y snarkjs groth16 prove "${ZKEY}" "${WTNS}" "${PROOF_JSON}" "${PUBLIC_JSON}" >/dev/null
END_S="$(date +%s || true)"
if [[ -n "${START_S}" && -n "${END_S}" ]]; then
  D_S=$((END_S - START_S))
  echo -e "${GREEN}✅ Proof generated in ${D_S}s${NC}"
else
  echo -e "${GREEN}✅ Proof generated${NC}"
fi
echo -e "${GREEN}Files:${NC} ${PROOF_JSON}, ${PUBLIC_JSON}"

echo -e "${BLUE}🔍 Verifying proof...${NC}"
npx -y snarkjs groth16 verify "${VK_JSON}" "${PUBLIC_JSON}" "${PROOF_JSON}" >/dev/null
echo -e "${GREEN}✅ Proof verified successfully!${NC}"

echo -e "${BLUE}📦 Exporting Solidity calldata${NC}"
if npx -y snarkjs zkey export soliditycalldata "${PUBLIC_JSON}" "${PROOF_JSON}" > "${CALLDATA_TXT}" 2>/dev/null; then
  :
elif npx -y snarkjs generatecall "${WTNS}" > "${CALLDATA_TXT}" 2>/dev/null; then
  :
else
  echo -e "${YELLOW}! Could not export calldata with known commands. Please update snarkjs.${NC}"
  > "${CALLDATA_TXT}"
fi
echo -e "${GREEN}✅ Calldata written:${NC} ${CALLDATA_TXT}"

echo -e "${GREEN}🎉 Done.${NC}"


