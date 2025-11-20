#!/usr/bin/env bash
set -euo pipefail

# Test real Groth16 verification on-chain for the data_authenticity circuit.
# - Uses circuits/build/data_authenticity/{verification_key.json,vk.bin,proof.json,proof.bin,public.json}
# - Uses sui-vktool + proofprep formats (already run by circuits/scripts/all-in-one.sh + vktool invocations)
# - Publishes the Move package, creates a ProofRegistry + VerificationKey, and calls
#   zk_verifier::verify_data_authenticity with real proof/public inputs.
# - Reports whether ProofVerified.is_valid == true in the resulting transaction.
#
# Requirements:
# - Sui CLI configured (sui client active-address set to testnet/devnet/localnet)
# - WALLET funded for gas (publishing + a few calls)
# - Circuits already built: circuits/scripts/all-in-one.sh
# - vk.bin and proof.bin already generated via:
#     ./sui-vktool/target/release/sui-vktool circuits/build/data_authenticity/verification_key.json circuits/build/data_authenticity/vk.bin
#     ./sui-vktool/target/release/proofprep circuits/build/data_authenticity/proof.json circuits/build/data_authenticity/proof.bin
#
# Usage:
#   ./scripts/test-real-zk.sh
#

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

WALLET="${WALLET:-$(sui client active-address || true)}"
if [[ -z "${WALLET}" ]]; then
  echo "❌ WALLET not set and no active-address. Run 'sui client active-address' or export WALLET."
  exit 1
fi

# Optional: reuse an already-published package by setting PACKAGE_ID in the environment.
PACKAGE_ID="${PACKAGE_ID:-}"

DA_DIR="${ROOT_DIR}/circuits/build/data_authenticity"
VK_BIN="${DA_DIR}/vk.bin"
PROOF_BIN="${DA_DIR}/proof.bin"
PUBLIC_JSON="${DA_DIR}/public.json"

if [[ ! -f "${VK_BIN}" || ! -f "${PROOF_BIN}" || ! -f "${PUBLIC_JSON}" ]]; then
  echo "❌ Missing vk.bin, proof.bin or public.json under ${DA_DIR}"
  echo "   Make sure you have run circuits/scripts/all-in-one.sh and vktool/proofprep steps."
  exit 1
fi

echo "🔎 Using wallet: ${WALLET}"
echo "📂 Using data_authenticity artifacts from: ${DA_DIR}"

if [[ -z "${PACKAGE_ID}" ]]; then
  echo "📦 Publishing Move package..."
  # Publish from the contracts/ directory where Move.toml lives
  PUBLISH_JSON="$(cd "${ROOT_DIR}/contracts" && sui client publish --gas-budget 200000000 --json 2>/dev/null || true)"
  PACKAGE_ID="$(echo "${PUBLISH_JSON}" | jq -r '.effects.created[]?.reference.objectId' | head -n1)"
  if [[ -z "${PACKAGE_ID}" || "${PACKAGE_ID}" == "null" ]]; then
    echo "❌ Failed to parse PACKAGE_ID from publish output."
    echo "${PUBLISH_JSON}"
    exit 1
  fi
  echo "✅ Published package: ${PACKAGE_ID}"
else
  echo "📦 Using existing package: ${PACKAGE_ID}"
fi

echo "🗂️  Creating ProofRegistry..."
CREATE_REG_JSON="$(sui client call \
  --package "${PACKAGE_ID}" \
  --module zk_verifier \
  --function create_registry \
  --gas-budget 100000000 \
  --json 2>/dev/null)"
REGISTRY_ID="$(echo "${CREATE_REG_JSON}" | jq -r '.effects.created[]?.reference.objectId' | head -n1)"
if [[ -z "${REGISTRY_ID}" || "${REGISTRY_ID}" == "null" ]]; then
  echo "❌ Failed to parse REGISTRY_ID."
  echo "${CREATE_REG_JSON}"
  exit 1
fi
echo "✅ ProofRegistry created: ${REGISTRY_ID}"

echo "🔐 Preparing verification key bytes from vk.bin..."
VK_HEX="$(xxd -p -c 100000 "${VK_BIN}" | tr -d '\n')"
if [[ -z "${VK_HEX}" ]]; then
  echo "❌ Failed to read vk.bin as hex."
  exit 1
fi
# Convert hex string into JSON array of byte literals, e.g. [0x12, 0x34, ...]
VK_JSON_ARR="[$(echo "${VK_HEX}" | sed 's/../0x& /g' | sed 's/ /, /g' | sed 's/, $//')]"

echo "🔑 Creating VerificationKey object (proof_type=1 authenticity)..."
VK_JSON="$(sui client call \
  --package "${PACKAGE_ID}" \
  --module zk_verifier \
  --function create_verification_key_and_transfer \
  --args 1 "${VK_JSON_ARR}" "${WALLET}" \
  --gas-budget 100000000 \
  --json 2>/dev/null || true)"
VK_ID="$(echo "${VK_JSON}" | jq -r '.effects.created[]?.reference.objectId' | head -n1)"
if [[ -z "${VK_ID}" || "${VK_ID}" == "null" ]]; then
  echo "❌ Failed to create VerificationKey."
  echo "${VK_JSON}"
  exit 1
fi
echo "✅ VerificationKey created and transferred: ${VK_ID}"

echo "🔏 Preparing proof and public inputs bytes..."
PROOF_HEX="$(xxd -p -c 100000 "${PROOF_BIN}" | tr -d '\n')"
if [[ -z "${PROOF_HEX}" ]]; then
  echo "❌ Failed to read proof.bin as hex."
  exit 1
fi

# For this sample, public.json is like: ["1"]
# We will encode each field element as 32-byte big-endian, consistent with backend formatPublicSignalsForSui.
PUBLIC_HEX="$(node - << 'EOF'
const fs = require("fs");
const path = require("path");
const daDir = path.join(process.cwd(), "circuits", "build", "data_authenticity");
const publicJson = JSON.parse(fs.readFileSync(path.join(daDir, "public.json"), "utf8"));
if (!Array.isArray(publicJson) || publicJson.length === 0) {
  throw new Error("public.json is empty or not an array");
}
const signals = publicJson.map((v) => BigInt(v.toString()));
function feTo32le(bi) {
  let hex = bi.toString(16);
  if (hex.length > 64) hex = hex.slice(hex.length - 64);
  hex = hex.padStart(64, "0");
  const be = Buffer.from(hex, "hex");
  const le = Buffer.from(Array.from(be).reverse());
  return le.toString("hex");
}
const hex = signals.map(feTo32le).join("");
process.stdout.write(hex);
EOF
)"
if [[ -z "${PUBLIC_HEX}" ]]; then
  echo "❌ Failed to derive public input hex from public.json."
  exit 1
fi

echo "🧪 Calling zk_verifier::verify_data_authenticity with real proof..."
VERIFY_JSON="$(sui client call \
  --package "${PACKAGE_ID}" \
  --module zk_verifier \
  --function verify_data_authenticity \
  --args "${VK_ID}" "0x${PUBLIC_HEX}" "0x${PROOF_HEX}" "${REGISTRY_ID}" \
  --gas-budget 100000000 \
  --json 2>/dev/null || true)"

STATUS="$(echo "${VERIFY_JSON}" | jq -r '.effects.status.status // empty')"
if [[ "${STATUS}" != "success" ]]; then
  echo "❌ Transaction did not succeed. Full JSON:"
  echo "${VERIFY_JSON}"
  exit 1
fi

TX_DIGEST="$(echo "${VERIFY_JSON}" | jq -r '.digest')"
IS_VALID="$(echo "${VERIFY_JSON}" | jq -r '.events[]? | select(.type | contains("::zk_verifier::ProofVerified")) | .parsedJson.is_valid // empty' | head -n1)"

echo "🔍 Tx digest: ${TX_DIGEST}"
echo "🔍 ProofVerified.is_valid: ${IS_VALID}"

if [[ "${IS_VALID}" == "true" ]]; then
  echo "🎉 Real on-chain Groth16 verification for data_authenticity returned is_valid=true."
  exit 0
fi

echo "⚠️  Groth16 verification ran but is_valid != true. Inspect the transaction above for details."
exit 1


