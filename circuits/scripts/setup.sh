#!/usr/bin/env bash
set -euo pipefail

# Colors
if [[ -t 1 ]]; then
  GREEN="\033[0;32m"
  YELLOW="\033[1;33m"
  RED="\033[0;31m"
  BLUE="\033[0;34m"
  NC="\033[0m"
else
  GREEN=""; YELLOW=""; RED=""; BLUE=""; NC=""
fi

CIRCUITS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Find project root (where package.json is)
PROJECT_ROOT="$(cd "${CIRCUITS_DIR}/.." && pwd)"
PTAU_DIR="${CIRCUITS_DIR}/ptau"
BUILD_DIR="${CIRCUITS_DIR}/build"
INPUT_DIR="${CIRCUITS_DIR}/inputs"
PTAU_FILE="${PTAU_DIR}/powersOfTau28_hez_final_14.ptau"
# Try multiple sources for Powers of Tau
HERMEZ_URL="https://hermez.s3.eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau"
FALLBACK_URL="https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau"

echo -e "${BLUE}🚀 Setting up ZK Circuit Environment${NC}"
echo -e "${BLUE}Circuits dir: ${CIRCUITS_DIR}${NC}"
echo -e "${BLUE}Project root: ${PROJECT_ROOT}${NC}"

# Prerequisites
command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js is required. Please install Node 20+.${NC}"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}npm is required. Please install npm 10+.${NC}"; exit 1; }
command -v circom >/dev/null 2>&1 || { echo -e "${RED}circom binary not found. Please install circom (https://docs.circom.io/getting-started/installation/).${NC}"; exit 1; }

# Prefer cargo-installed circom 2.x if available (fixes PATH using old 0.5.x)
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

mkdir -p "${PTAU_DIR}" "${BUILD_DIR}" "${INPUT_DIR}"

echo -e "${BLUE}📦 Installing circomlib, snarkjs, circomlibjs${NC}"
pushd "${PROJECT_ROOT}" >/dev/null
npm install --no-save circomlib@^2.0.5 snarkjs@^0.7.3 circomlibjs@^0.0.8 >/dev/null
popd >/dev/null
# Install circomlib locally in circuits/ for circom to find (not hoisted)
if [[ ! -d "${CIRCUITS_DIR}/node_modules/circomlib" ]]; then
  pushd "${CIRCUITS_DIR}" >/dev/null
  npm install --no-save --no-workspaces circomlib@^2.0.5 >/dev/null
  popd >/dev/null
fi

if [[ ! -f "${PTAU_FILE}" ]]; then
  echo -e "${BLUE}⚡ Downloading Powers of Tau ceremony file (14)${NC}"
  if curl -L --fail -o "${PTAU_FILE}.tmp" "${HERMEZ_URL}" 2>/dev/null; then
    mv "${PTAU_FILE}.tmp" "${PTAU_FILE}"
    echo -e "${GREEN}✓ Downloaded from Hermez${NC}"
  elif curl -L --fail -o "${PTAU_FILE}.tmp" "${FALLBACK_URL}" 2>/dev/null; then
    mv "${PTAU_FILE}.tmp" "${PTAU_FILE}"
    echo -e "${GREEN}✓ Downloaded from fallback source${NC}"
  else
    echo -e "${YELLOW}! Direct download failed. Trying snarkjs to generate...${NC}"
    npx -y snarkjs powersoftau new bn128 14 "${PTAU_FILE}.tmp" -v || {
      echo -e "${RED}Failed to download or generate ptau file${NC}"
      echo -e "${YELLOW}You can manually download from:${NC}"
      echo -e "${YELLOW}   ${HERMEZ_URL}${NC}"
      echo -e "${YELLOW}   ${FALLBACK_URL}${NC}"
      exit 1
    }
    mv "${PTAU_FILE}.tmp" "${PTAU_FILE}"
  fi
else
  echo -e "${YELLOW}⚡ Using cached ptau:${NC} ${PTAU_FILE}"
fi

compile_circuit() {
  local CIRCUIT_PATH="$1"
  local NAME
  NAME="$(basename "${CIRCUIT_PATH}" .circom)"
  local OUT_DIR="${BUILD_DIR}/${NAME}"
  mkdir -p "${OUT_DIR}"

  echo -e "${BLUE}🔧 Compiling ${NAME}...${NC}"
  # Compile from circuits directory
  local REL_OUT_DIR="${OUT_DIR#${CIRCUITS_DIR}/}"
  (cd "${CIRCUITS_DIR}" && "${CIRCOM_BIN}" "$(basename "${CIRCUIT_PATH}")" \
    --r1cs --wasm --sym \
    -l "node_modules" \
    -o "${REL_OUT_DIR}")
  echo -e "${GREEN}✅ Compiled ${NAME}${NC}"

  echo -e "${BLUE}🔑 Groth16 setup for ${NAME}${NC}"
  npx -y snarkjs groth16 setup "${OUT_DIR}/${NAME}.r1cs" "${PTAU_FILE}" "${OUT_DIR}/${NAME}_0000.zkey" >/dev/null

  echo -e "${BLUE}🔏 Contribute ceremony for ${NAME}${NC}"
  npx -y snarkjs zkey contribute "${OUT_DIR}/${NAME}_0000.zkey" "${OUT_DIR}/${NAME}_final.zkey" \
    -name "zkDataVault contribution" -e "$(openssl rand -hex 8 2>/dev/null || echo randomseed)" >/dev/null

  echo -e "${BLUE}🧾 Export verification key for ${NAME}${NC}"
  npx -y snarkjs zkey export verificationkey "${OUT_DIR}/${NAME}_final.zkey" "${OUT_DIR}/verification_key.json" >/dev/null

  echo -e "${BLUE}🧱 Export Solidity verifier for ${NAME}${NC}"
  npx -y snarkjs zkey export solidityverifier "${OUT_DIR}/${NAME}_final.zkey" "${OUT_DIR}/Verifier_${NAME}.sol" >/dev/null
}

generate_inputs_data_authenticity() {
  local NAME="data_authenticity"
  local INPUT_JSON="${INPUT_DIR}/${NAME}.json"
  echo -e "${BLUE}==> [${NAME}] Generating sample input (using circomlibjs Poseidon)${NC}"
  (cd "${PROJECT_ROOT}" && node - <<'NODE'
const fs = require('fs');
const path = require('path');
const { buildPoseidon } = require('circomlibjs');
(async () => {
  const poseidon = await buildPoseidon();
  // Sample small integers for demo; real use would be bigints/field elements
  const creatorPrivateKey = 123456789n;
  const dataHash = 987654321n;
  const creationTimestamp = 1700000000000n; // ms
  const currentTimestamp = 1700000005000n;

  const publicKeyHash = poseidon.F.toObject(poseidon([creatorPrivateKey]));
  const commitmentHash = poseidon.F.toObject(poseidon([dataHash]));

  const out = {
    creatorPrivateKey: creatorPrivateKey.toString(),
    dataHash: dataHash.toString(),
    creationTimestamp: creationTimestamp.toString(),
    publicKeyHash: publicKeyHash.toString(),
    commitmentHash: commitmentHash.toString(),
    currentTimestamp: currentTimestamp.toString()
  };
  const outPath = path.resolve(process.argv[2]);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(outPath);
})( ).catch(e => { console.error(e); process.exit(1); });
NODE
  "${INPUT_JSON}") >/dev/null
}

generate_inputs_quality_proof() {
  local NAME="quality_proof"
  local INPUT_JSON="${INPUT_DIR}/${NAME}.json"
  echo -e "${BLUE}==> [${NAME}] Generating sample input (Poseidon commitment over 10 metrics)${NC}"
  (cd "${PROJECT_ROOT}" && node - <<'NODE'
const fs = require('fs');
const path = require('path');
const { buildPoseidon } = require('circomlibjs');
(async () => {
  const poseidon = await buildPoseidon();
  const metrics = Array.from({ length: 10 }, (_, i) => BigInt(80 + i)); // 80..89
  const minThreshold = 50n;
  const maxThreshold = 100n;
  const expectedHash = poseidon.F.toObject(poseidon(metrics));
  const out = {
    qualityMetrics: metrics.map(x => x.toString()),
    minThreshold: minThreshold.toString(),
    maxThreshold: maxThreshold.toString(),
    expectedHash: expectedHash.toString()
  };
  const outPath = path.resolve(process.argv[2]);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(outPath);
})( ).catch(e => { console.error(e); process.exit(1); });
NODE
  "${INPUT_JSON}") >/dev/null
}

prove_and_verify() {
  local NAME="$1"
  local OUT_DIR="${BUILD_DIR}/${NAME}"
  local INPUT_JSON="${INPUT_DIR}/${NAME}.json"
  echo -e "${BLUE}==> [${NAME}] Generating witness${NC}"
  npx -y snarkjs wtns calculate "${OUT_DIR}/${NAME}.wasm" "${INPUT_JSON}" "${OUT_DIR}/${NAME}.wtns" >/dev/null

  echo -e "${BLUE}==> [${NAME}] Proving (Groth16)${NC}"
  npx -y snarkjs groth16 prove "${OUT_DIR}/${NAME}_final.zkey" "${OUT_DIR}/${NAME}.wtns" "${OUT_DIR}/proof.json" "${OUT_DIR}/public.json" >/dev/null

  echo -e "${BLUE}==> [${NAME}] Verifying proof${NC}"
  npx -y snarkjs groth16 verify "${OUT_DIR}/verification_key.json" "${OUT_DIR}/public.json" "${OUT_DIR}/proof.json" >/dev/null
  echo -e "${GREEN}✓ [${NAME}] Verified successfully${NC}"
}

echo -e "${BLUE}🔧 Compiling circuits...${NC}"
shopt -s nullglob
mapfile -t CIRCUITS < <(find "${CIRCUITS_DIR}" -maxdepth 1 -type f -name "*.circom" -printf "%f\n")
if [[ ${#CIRCUITS[@]} -eq 0 ]]; then
  echo -e "${RED}No .circom files found in ${CIRCUITS_DIR}${NC}"
  exit 1
fi
echo -e "${YELLOW}Found:${NC} ${CIRCUITS[*]}"

for CIRCUIT in "${CIRCUITS[@]}"; do
  compile_circuit "${CIRCUITS_DIR}/${CIRCUIT}"
done

echo -e "${BLUE}🧪 Creating sample inputs${NC}"
if [[ -f "${CIRCUITS_DIR}/data_authenticity.circom" ]]; then
  generate_inputs_data_authenticity
  # convenience: copy to input.json for quick proving
  cp -f "${INPUT_DIR}/data_authenticity.json" "${CIRCUITS_DIR}/input.json"
fi
if [[ -f "${CIRCUITS_DIR}/quality_proof.circom" ]]; then
  generate_inputs_quality_proof
fi

echo -e "${BLUE}🧪 Testing proofs${NC}"
if [[ -f "${CIRCUITS_DIR}/data_authenticity.circom" ]]; then
  prove_and_verify "data_authenticity"
fi
if [[ -f "${CIRCUITS_DIR}/quality_proof.circom" ]]; then
  prove_and_verify "quality_proof"
fi

echo -e "${GREEN}🎉 Setup complete!${NC}"


