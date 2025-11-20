#!/usr/bin/env bash
set -euo pipefail

# Single script to: install deps, fetch ptau, compile circuits, setup zkeys,
# generate sample inputs, prove, verify, and export calldata for all circuits.
#
# Usage:
#   circuits/scripts/all-in-one.sh
#
# Outputs go under circuits/build/<circuit>/

# Colors
if [[ -t 1 ]]; then
  GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; BLUE="\033[0;34m"; NC="\033[0m"
else
  GREEN=""; YELLOW=""; RED=""; BLUE=""; NC=""
fi

CIRCUITS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "${CIRCUITS_DIR}/.." && pwd)"
PTAU_DIR="${CIRCUITS_DIR}/ptau"
BUILD_BASE="${CIRCUITS_DIR}/build"
INPUT_DIR="${CIRCUITS_DIR}/inputs"
PTAU_FILE="${PTAU_DIR}/powersOfTau28_hez_final_14.ptau"
HERMEZ_URL="https://hermez.s3.eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau"
FALLBACK_URL="https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau"

echo -e "${BLUE}🚀 zkDataVault: Full Circuits Build + Prove${NC}"
echo -e "${BLUE}Circuits dir:${NC} ${CIRCUITS_DIR}"
echo -e "${BLUE}Project root:${NC} ${PROJECT_ROOT}"

# Prereqs
command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js is required.${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}npm is required.${NC}"; exit 1; }
command -v circom >/dev/null 2>&1 || true

# Prefer cargo-installed circom 2.x
CIRCOM_BIN="circom"
if [[ -x "$HOME/.cargo/bin/circom" ]]; then
  if "$HOME/.cargo/bin/circom" --version 2>/dev/null | grep -Eq '2\.[0-9]'; then
    CIRCOM_BIN="$HOME/.cargo/bin/circom"
    export PATH="$HOME/.cargo/bin:$PATH"
    echo -e "${YELLOW}==> Using Circom from cargo: $(${CIRCOM_BIN} --version)${NC}"
  fi
fi
if ! ${CIRCOM_BIN} --version 2>/dev/null | grep -Eq '2\.[0-9]'; then
  echo -e "${RED}Circom 2.x required. Current: $(${CIRCOM_BIN} --version 2>/dev/null || echo unknown)${NC}"
  echo -e "${YELLOW}Install via cargo: cargo install --git https://github.com/iden3/circom.git --tag v2.1.6 circom${NC}"
  exit 1
fi

mkdir -p "${PTAU_DIR}" "${BUILD_BASE}" "${INPUT_DIR}"

echo -e "${BLUE}📦 Installing circomlib, snarkjs, circomlibjs, big-integer${NC}"
pushd "${PROJECT_ROOT}" >/dev/null
npm install --no-save circomlib@^2.0.5 snarkjs@^0.7.3 circomlibjs@^0.0.8 big-integer >/dev/null
popd >/dev/null

if [[ ! -f "${PTAU_FILE}" ]]; then
  echo -e "${BLUE}⚡ Downloading Powers of Tau (14)${NC}"
  if curl -L --fail -o "${PTAU_FILE}.tmp" "${HERMEZ_URL}" 2>/dev/null; then
    mv "${PTAU_FILE}.tmp" "${PTAU_FILE}"; echo -e "${GREEN}✓ Downloaded from Hermez${NC}"
  elif curl -L --fail -o "${PTAU_FILE}.tmp" "${FALLBACK_URL}" 2>/dev/null; then
    mv "${PTAU_FILE}.tmp" "${PTAU_FILE}"; echo -e "${GREEN}✓ Downloaded from fallback${NC}"
  else
    echo -e "${YELLOW}! Download failed; trying snarkjs to generate...${NC}"
    npx -y snarkjs powersoftau new bn128 14 "${PTAU_FILE}.tmp" -v
    mv "${PTAU_FILE}.tmp" "${PTAU_FILE}"
  fi
else
  echo -e "${YELLOW}⚡ Using cached ptau:${NC} ${PTAU_FILE}"
fi

# Compile, setup, export artifacts for one circuit
compile_and_setup() {
  local CIRCUIT_FILE="$1"
  local NAME; NAME="$(basename "${CIRCUIT_FILE}" .circom)"
  local OUT_DIR="${BUILD_BASE}/${NAME}"
  mkdir -p "${OUT_DIR}"

  echo -e "${BLUE}🔧 Compiling ${NAME}...${NC}"
  (cd "${CIRCUITS_DIR}" && "${CIRCOM_BIN}" "$(basename "${CIRCUIT_FILE}")" \
    --r1cs --wasm --sym \
    -l "${PROJECT_ROOT}" \
    -l "${PROJECT_ROOT}/node_modules" \
    -o "build/${NAME}")
  echo -e "${GREEN}✅ Compiled ${NAME}${NC}"

  echo -e "${BLUE}🔑 Groth16 setup for ${NAME}${NC}"
  if ! npx -y snarkjs groth16 setup "${OUT_DIR}/${NAME}.r1cs" "${PTAU_FILE}" "${OUT_DIR}/${NAME}_0000.zkey" 2>&1 | grep -v "ExperimentalWarning"; then
    echo -e "${RED}❌ Groth16 setup failed for ${NAME}${NC}" >&2
    return 1
  fi

  echo -e "${BLUE}🔏 Contribute ceremony for ${NAME} (this may take a minute)...${NC}"
  local ENTROPY
  ENTROPY="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32 2>/dev/null || echo "$(date +%s)$RANDOM")"
  # snarkjs zkey contribute reads entropy from stdin, then optionally a name
  # Provide both to make it fully non-interactive
  if ! (printf "%s\nzkDataVault contribution\n" "$ENTROPY" | npx -y snarkjs zkey contribute "${OUT_DIR}/${NAME}_0000.zkey" "${OUT_DIR}/${NAME}_final.zkey" 2>&1 | grep -v "ExperimentalWarning"); then
    echo -e "${RED}❌ Contribution failed for ${NAME}${NC}" >&2
    return 1
  fi
  echo -e "${GREEN}✅ Contribution complete for ${NAME}${NC}"

  echo -e "${BLUE}🧾 Export verification key for ${NAME}${NC}"
  if ! npx -y snarkjs zkey export verificationkey "${OUT_DIR}/${NAME}_final.zkey" "${OUT_DIR}/verification_key.json" 2>&1 | grep -v "ExperimentalWarning"; then
    echo -e "${RED}❌ Failed to export verification key for ${NAME}${NC}" >&2
    return 1
  fi

  echo -e "${BLUE}🧱 Export Solidity verifier for ${NAME}${NC}"
  if ! npx -y snarkjs zkey export solidityverifier "${OUT_DIR}/${NAME}_final.zkey" "${OUT_DIR}/Verifier_${NAME}.sol" 2>&1 | grep -v "ExperimentalWarning"; then
    echo -e "${RED}❌ Failed to export Solidity verifier for ${NAME}${NC}" >&2
    return 1
  fi
}

generate_inputs_data_authenticity() {
  local OUT="${INPUT_DIR}/data_authenticity.json"
  echo -e "${BLUE}🧪 Generating sample input for data_authenticity${NC}"
  (cd "${PROJECT_ROOT}" && node - <<'NODE' "${OUT}"
const fs = require('fs');
const circomlibjs = require('circomlibjs');
const poseidon = circomlibjs.poseidon;
const creatorPrivateKey = 123456789n;
const dataHash = 987654321n;
const creationTimestamp = 1700000000000n;
const currentTimestamp = 1700000005000n;
// Poseidon hash single input (returns BigInt directly)
const publicKeyHash = poseidon([creatorPrivateKey]);
const commitmentHash = poseidon([dataHash]);
const out = {
  creatorPrivateKey: creatorPrivateKey.toString(),
  dataHash: dataHash.toString(),
  creationTimestamp: creationTimestamp.toString(),
  publicKeyHash: publicKeyHash.toString(),
  commitmentHash: commitmentHash.toString(),
  currentTimestamp: currentTimestamp.toString()
};
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
NODE
  )
  # convenience copy to circuits/input.json
  cp -f "${OUT}" "${CIRCUITS_DIR}/input.json"
}

generate_inputs_quality_proof() {
  local OUT="${INPUT_DIR}/quality_proof.json"
  echo -e "${BLUE}🧪 Generating sample input for quality_proof${NC}"
  (cd "${PROJECT_ROOT}" && node - <<'NODE' "${OUT}"
const fs = require('fs');
const circomlibjs = require('circomlibjs');
const poseidon = circomlibjs.poseidon;
const metrics = Array.from({ length: 10 }, (_, i) => BigInt(80 + i));
const minThreshold = 50n; const maxThreshold = 100n;
// Poseidon hash returns BigInt directly
const expectedHash = poseidon(metrics);
const out = {
  qualityMetrics: metrics.map(x => x.toString()),
  minThreshold: minThreshold.toString(),
  maxThreshold: maxThreshold.toString(),
  expectedHash: expectedHash.toString()
};
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
NODE
  )
}

prove_and_verify() {
  local NAME="$1"
  local INPUT_FILE="$2"
  local OUT_DIR="${BUILD_BASE}/${NAME}"
  local JS_DIR="${OUT_DIR}/${NAME}_js"
  local WASM="${JS_DIR}/${NAME}.wasm"
  local GEN_WITNESS="${JS_DIR}/generate_witness.js"
  local WTNS="${OUT_DIR}/${NAME}.wtns"
  local ZKEY="${OUT_DIR}/${NAME}_final.zkey"
  local VK_JSON="${OUT_DIR}/verification_key.json"
  local PROOF_JSON="${OUT_DIR}/proof.json"
  local PUBLIC_JSON="${OUT_DIR}/public.json"
  local CALLDATA_TXT="${OUT_DIR}/calldata.txt"

  echo -e "${BLUE}🔐 Generating ZK Proof for ${NAME}${NC}"
  [[ -f "${WASM}" && -f "${GEN_WITNESS}" ]] || { echo -e "${RED}Missing compiled WASM/JS for ${NAME}.${NC}"; exit 1; }
  [[ -f "${ZKEY}" && -f "${VK_JSON}" ]] || { echo -e "${RED}Missing zkey/VK for ${NAME}.${NC}"; exit 1; }
  [[ -f "${INPUT_FILE}" ]] || { echo -e "${RED}Input not found: ${INPUT_FILE}${NC}"; exit 1; }

  echo -e "${BLUE}📊 Generating witness...${NC}"
  node "${GEN_WITNESS}" "${WASM}" "${INPUT_FILE}" "${WTNS}" >/dev/null
  echo -e "${GREEN}✅ Witness generated${NC}"

  echo -e "${BLUE}🔑 Generating proof (this may take a minute)...${NC}"
  local START_S; START_S="$(date +%s || true)"
  npx -y snarkjs groth16 prove "${ZKEY}" "${WTNS}" "${PROOF_JSON}" "${PUBLIC_JSON}" >/dev/null
  local END_S; END_S="$(date +%s || true)"
  if [[ -n "${START_S}" && -n "${END_S}" ]]; then
    echo -e "${GREEN}✅ Proof generated in $((END_S - START_S))s${NC}"
  else
    echo -e "${GREEN}✅ Proof generated${NC}"
  fi

  echo -e "${BLUE}🔍 Verifying proof...${NC}"
  npx -y snarkjs groth16 verify "${VK_JSON}" "${PUBLIC_JSON}" "${PROOF_JSON}" >/dev/null
  echo -e "${GREEN}✅ Proof verified successfully!${NC}"

  echo -e "${BLUE}📦 Exporting Solidity calldata${NC}"
  if npx -y snarkjs zkey export soliditycalldata "${PUBLIC_JSON}" "${PROOF_JSON}" > "${CALLDATA_TXT}" 2>/dev/null; then
    :
  elif npx -y snarkjs generatecall "${WTNS}" > "${CALLDATA_TXT}" 2>/dev/null; then
    :
  else
    echo -e "${YELLOW}! Could not export calldata with current snarkjs; output left empty.${NC}"
    > "${CALLDATA_TXT}"
  fi
  echo -e "${GREEN}✅ Calldata written:${NC} ${CALLDATA_TXT}"
}

echo -e "${BLUE}🔧 Compiling circuits...${NC}"
shopt -s nullglob
mapfile -t CIRCUIT_FILES < <(find "${CIRCUITS_DIR}" -maxdepth 1 -type f -name "*.circom" | sort)
[[ ${#CIRCUIT_FILES[@]} -gt 0 ]] || { echo -e "${RED}No .circom files found.${NC}"; exit 1; }
echo -e "${YELLOW}Found:${NC} $(for f in "${CIRCUIT_FILES[@]}"; do basename "$f"; done)"

for f in "${CIRCUIT_FILES[@]}"; do
  compile_and_setup "${f}"
done

echo -e "${BLUE}🧪 Generating sample inputs${NC}"
if [[ -f "${CIRCUITS_DIR}/data_authenticity.circom" ]]; then
  generate_inputs_data_authenticity
fi
if [[ -f "${CIRCUITS_DIR}/quality_proof.circom" ]]; then
  generate_inputs_quality_proof
fi

echo -e "${BLUE}🧪 Proving and verifying all circuits${NC}"
if [[ -f "${CIRCUITS_DIR}/data_authenticity.circom" ]]; then
  prove_and_verify "data_authenticity" "${INPUT_DIR}/data_authenticity.json"
fi
if [[ -f "${CIRCUITS_DIR}/quality_proof.circom" ]]; then
  prove_and_verify "quality_proof" "${INPUT_DIR}/quality_proof.json"
fi

echo -e "${GREEN}🎉 All circuits compiled, keys generated, proofs verified.${NC}"


