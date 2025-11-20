#!/usr/bin/env bash
set -euo pipefail

# zkDataVault deploy script
# - Publishes the Move package
# - Creates ProofRegistry shared object
# - (Optional) Creates VerificationKey objects for each circuit with provided vk bytes (hex or bcs)
#
# Requirements:
# - Sui CLI configured (sui client active-address, env set to testnet/devnet/localnet)
# - WALLET address funded for gas
#
# Usage:
#   ./scripts/deploy-with-zk.sh [-n NETWORK] [-w WALLET_ADDR] [--vk-auth HEX] [--vk-quality HEX]
# Example:
#   ./scripts/deploy-with-zk.sh -n testnet -w 0xYOURADDR --vk-auth 0x... --vk-quality 0x...

NETWORK="${NETWORK:-testnet}"
WALLET="${WALLET:-$(sui client active-address || true)}"
VK_AUTH="${VK_AUTH:-}"
VK_QUALITY="${VK_QUALITY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--network)
      NETWORK="$2"
      shift 2
      ;;
    -w|--wallet)
      WALLET="$2"
      shift 2
      ;;
    --vk-auth)
      VK_AUTH="$2"
      shift 2
      ;;
    --vk-quality)
      VK_QUALITY="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "${WALLET}" ]]; then
  echo "Error: WALLET address not set. Pass -w or set Sui CLI active address."
  exit 1
fi

echo "📦 Publishing Move package (network=${NETWORK}, sender=${WALLET})..."
PUBLISH_JSON="$(sui client publish --gas-budget 200000000 --json 2>/dev/null)"
PACKAGE_ID="$(echo "${PUBLISH_JSON}" | jq -r '.effects.created[]?.reference.objectId' | head -n1)"
if [[ -z "${PACKAGE_ID}" || "${PACKAGE_ID}" == "null" ]]; then
  echo "❌ Failed to parse PACKAGE_ID from publish output."
  echo "${PUBLISH_JSON}"
  exit 1
fi
echo "✅ Published package: ${PACKAGE_ID}"

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

create_vk() {
  local PROOF_TYPE="$1"   # 1 = authenticity, 2 = quality
  local VK_HEX="$2"
  local LABEL="$3"

  if [[ -z "${VK_HEX}" ]]; then
    echo "ℹ️  Skipping ${LABEL} VK creation (no bytes provided)."
    return
  fi

  echo "🔑 Creating VerificationKey for ${LABEL} (proof_type=${PROOF_TYPE})..."
  # Pass as vector<u8> arg; Sui CLI expects JSON arrays for pure types.
  # Convert hex (0x...) to JSON array
  local CLEAN="${VK_HEX#0x}"
  # Create a JSON array of bytes
  local JSON_ARR="[$(echo "${CLEAN}" | sed 's/../0x& /g' | sed 's/ /, /g' | sed 's/, $//')]"

  VK_JSON="$(sui client call \
    --package "${PACKAGE_ID}" \
    --module zk_verifier \
    --function create_verification_key \
    --args "${PROOF_TYPE}" "${JSON_ARR}" \
    --gas-budget 100000000 \
    --json 2>/dev/null)"
  VK_ID="$(echo "${VK_JSON}" | jq -r '.effects.created[]?.reference.objectId' | head -n1)"
  if [[ -z "${VK_ID}" || "${VK_ID}" == "null" ]]; then
    echo "❌ Failed to create ${LABEL} VK."
    echo "${VK_JSON}"
    exit 1
  fi
  echo "✅ ${LABEL} VK created: ${VK_ID}"
}

# Optional: create VK objects if provided
create_vk 1 "${VK_AUTH}" "Authenticity"
create_vk 2 "${VK_QUALITY}" "Quality"

echo ""
echo "🎉 Deployment complete."
echo "Package ID:      ${PACKAGE_ID}"
echo "ProofRegistry:   ${REGISTRY_ID}"
echo "Note: Save these IDs for frontend/backend integration."
























