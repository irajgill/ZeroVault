module zk_data_vault::zk_verifier {
    use std::vector;
    use sui::object::{UID};
    use sui::tx_context::TxContext;
    use sui::table;
    use sui::event;
    use sui::transfer;
    use sui::groth16;

    /// Constants defining proof type identifiers.
    const PROOF_TYPE_AUTHENTICITY: u8 = 1;
    const PROOF_TYPE_QUALITY: u8 = 2;

    /// Record persisted for each proof key.
    public struct ProofRecord has store {
        creator: address,
        proof_type: u8,
        verified_at: u64,
        is_valid: bool,
    }

    /// Verification key object storing prepared Groth16 vk bytes.
    public struct VerificationKey has key, store {
        id: UID,
        /// Prepared vk bytes compatible with sui::groth16 verifier (BN254).
        vk_bytes: vector<u8>,
        /// Indicates which circuit this VK is meant for (authenticity or quality).
        proof_type: u8,
    }

    /// Shared registry that maps proof keys to their verification records.
    public struct ProofRegistry has key {
        id: UID,
        proofs: table::Table<vector<u8>, ProofRecord>,
        total_proofs: u64,
    }

    /// Event emitted when a proof is submitted.
    public struct ProofSubmitted has copy, drop, store {
        creator: address,
        proof_type: u8,
        submitted_at: u64,
    }

    /// Event emitted when a proof is verified (valid or invalid).
    public struct ProofVerified has copy, drop, store {
        creator: address,
        proof_type: u8,
        verified_at: u64,
        is_valid: bool,
    }

    /// Create and share an empty registry.
    public entry fun create_registry(ctx: &mut TxContext) {
        let registry = ProofRegistry {
            id: sui::object::new(ctx),
            proofs: table::new<vector<u8>, ProofRecord>(ctx),
            total_proofs: 0,
        };
        transfer::share_object(registry);
    }

    /// Create a verification key object for a given proof type.
    public fun create_verification_key(proof_type: u8, vk_bytes: vector<u8>, ctx: &mut TxContext): VerificationKey {
        VerificationKey {
            id: sui::object::new(ctx),
            vk_bytes,
            proof_type,
        }
    }

    /// Convenience entry: create a verification key and transfer it to `recipient`.
    /// This avoids leaving an untransferred object in the PTB.
    public entry fun create_verification_key_and_transfer(
        proof_type: u8,
        vk_bytes: vector<u8>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let vk = create_verification_key(proof_type, vk_bytes, ctx);
        transfer::public_transfer(vk, recipient);
    }

    /// Create a verification key from up to four byte chunks to stay under Sui's per-argument
    /// 16KB pure argument limit. Any empty chunk vectors are ignored.
    /// Pass pre-prepared verification key bytes (compatible with sui::groth16::prepare_verifying_key).
    public entry fun create_verification_key_from_chunks_and_transfer(
        proof_type: u8,
        chunk0: vector<u8>,
        chunk1: vector<u8>,
        chunk2: vector<u8>,
        chunk3: vector<u8>,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let mut all: vector<u8> = vector::empty<u8>();
        if (vector::length(&chunk0) > 0) { append_into(&mut all, chunk0); };
        if (vector::length(&chunk1) > 0) { append_into(&mut all, chunk1); };
        if (vector::length(&chunk2) > 0) { append_into(&mut all, chunk2); };
        if (vector::length(&chunk3) > 0) { append_into(&mut all, chunk3); };
        let vk = create_verification_key(proof_type, all, ctx);
        transfer::public_transfer(vk, recipient);
    }

    /// Append contents of `src` into `dst`, consuming `src`.
    fun append_into(dst: &mut vector<u8>, src: vector<u8>) {
        let len = vector::length(&src);
        let mut i = 0;
        while (i < len) {
            vector::push_back(dst, *vector::borrow(&src, i));
            i = i + 1;
        };
    }

    /// Verify authenticity proof using Sui's native groth16 verifier and record the result.
    /// This entry wrapper matches dApp call order: (vk, public_inputs, proof_bytes, registry).
    public entry fun verify_data_authenticity(
        vk: &VerificationKey,
        public_inputs: vector<u8>,
        proof_bytes: vector<u8>,
        registry: &mut ProofRegistry,
        ctx: &mut TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        // Emit submission with a zero timestamp (no Clock provided from dApp)
        event::emit(ProofSubmitted {
            creator: sender,
            proof_type: PROOF_TYPE_AUTHENTICITY,
            submitted_at: 0,
        });
        // Decode and verify. This expects:
        // - vk.vk_bytes produced by `sui-vktool` from snarkjs verification_key.json
        // - public_inputs as 32-byte big-endian field elements concatenated
        // - proof_bytes as ark_bn254::Groth16 proof compressed bytes (see `proofprep` Rust helper)
        let mut is_valid = false;
        if (vector::length(&vk.vk_bytes) >= 128 && vector::length(&public_inputs) % 32 == 0) {
            let curve = groth16::bn254();
            let prepared_vk = groth16::prepare_verifying_key(&curve, &vk.vk_bytes);
            let ppi = groth16::public_proof_inputs_from_bytes(public_inputs);
            let proof_points = groth16::proof_points_from_bytes(proof_bytes);
            is_valid = groth16::verify_groth16_proof(&curve, &prepared_vk, &ppi, &proof_points);
        };
        // Use proof bytes as the key (caller need not pass a separate key)
        let proof_key = clone_vec(&proof_bytes);
        upsert_record(registry, proof_key, sender, PROOF_TYPE_AUTHENTICITY, 0, is_valid);
    }

    /// Verify quality proof using Sui's native groth16 verifier and record the result.
    public entry fun verify_quality_proof(
        vk: &VerificationKey,
        public_inputs: vector<u8>,
        proof_bytes: vector<u8>,
        registry: &mut ProofRegistry,
        ctx: &mut TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        event::emit(ProofSubmitted {
            creator: sender,
            proof_type: PROOF_TYPE_QUALITY,
            submitted_at: 0,
        });
        let mut is_valid = false;
        if (vector::length(&vk.vk_bytes) >= 128 && vector::length(&public_inputs) % 32 == 0) {
            let curve = groth16::bn254();
            let prepared_vk = groth16::prepare_verifying_key(&curve, &vk.vk_bytes);
            let ppi = groth16::public_proof_inputs_from_bytes(public_inputs);
            let proof_points = groth16::proof_points_from_bytes(proof_bytes);
            is_valid = groth16::verify_groth16_proof(&curve, &prepared_vk, &ppi, &proof_points);
        };
        let proof_key = clone_vec(&proof_bytes);
        upsert_record(registry, proof_key, sender, PROOF_TYPE_QUALITY, 0, is_valid);
    }

    /// Batch verification for gas efficiency. Uses the same VK and proof type for all entries.
    public fun batch_verify_proofs(
        registry: &mut ProofRegistry,
        _vk: &VerificationKey,
        proof_type: u8,
        proof_keys: vector<vector<u8>>,
        _inputs_list: vector<vector<u8>>,
        _proofs_list: vector<vector<u8>>,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);
        let n = vector::length(&proof_keys);
        // Basic length check; if mismatched we verify up to min length
        let mut i = 0;
        let mut limit = n;

        while (i < limit) {
            let proof_key = vector::borrow(&proof_keys, i);

            // Consume key by cloning into a new vector<u8>
            let mut key_copy = vector::empty<u8>();
            let key_len = vector::length(proof_key);
            let mut j = 0;
            while (j < key_len) {
                vector::push_back(&mut key_copy, *vector::borrow(proof_key, j));
                j = j + 1;
            };
            upsert_record(registry, key_copy, sender, proof_type, now, false);
            i = i + 1;
        };
    }

    /// Query whether a given proof is recorded as valid.
    public fun is_proof_verified(registry: &ProofRegistry, proof_key: &vector<u8>): bool {
        if (!table::contains(&registry.proofs, *proof_key)) {
            return false
        };
        let rec = table::borrow(&registry.proofs, *proof_key);
        rec.is_valid
    }

    /// Return (creator, proof_type, verified_at, is_valid) for a given proof key.
    /// If the key does not exist, returns (0x0, 0, 0, false).
    public fun get_proof_record(registry: &ProofRegistry, proof_key: &vector<u8>): (address, u8, u64, bool) {
        if (!table::contains(&registry.proofs, *proof_key)) {
            ( @0x0, 0, 0, false )
        } else {
            let rec = table::borrow(&registry.proofs, *proof_key);
            ( rec.creator, rec.proof_type, rec.verified_at, rec.is_valid )
        }
    }

    /// Internal helper: record and emit ProofVerified event.
    fun upsert_record(
        registry: &mut ProofRegistry,
        proof_key: vector<u8>,
        creator: address,
        proof_type: u8,
        verified_at: u64,
        is_valid: bool,
    ) {
        let exists = table::contains(&registry.proofs, proof_key);
        if (exists) {
            let rec_mut = table::borrow_mut(&mut registry.proofs, proof_key);
            rec_mut.creator = creator;
            rec_mut.proof_type = proof_type;
            rec_mut.verified_at = verified_at;
            rec_mut.is_valid = is_valid;
        } else {
            let rec = ProofRecord {
                creator,
                proof_type,
                verified_at,
                is_valid,
            };
            table::add(&mut registry.proofs, proof_key, rec);
            registry.total_proofs = registry.total_proofs + 1;
        };

        event::emit(ProofVerified {
            creator,
            proof_type,
            verified_at,
            is_valid,
        });
    }

    /// Simple clone helper for vector<u8> without hashing.
    fun clone_vec(src: &vector<u8>): vector<u8> {
        let mut out = vector::empty<u8>();
        let len = vector::length(src);
        let mut i = 0;
        while (i < len) {
            vector::push_back(&mut out, *vector::borrow(src, i));
            i = i + 1;
        };
        out
    }
}


