module zk_data_vault::zk_marketplace_integration {
    use sui::object::{ID};
    use sui::tx_context::TxContext;
    use sui::coin::{Coin};
    use sui::sui::SUI;
    use sui::event;

    use zk_data_vault::zk_verifier;
    use zk_data_vault::marketplace;

    /// Error codes
    const E_PROOF_NOT_VERIFIED: u64 = 1;
    const E_CREATOR_MISMATCH: u64 = 2;
    const E_QUALITY_TOO_LOW: u64 = 3;

    /// Event emitted when a dataset is ZK-verified and listed.
    public struct DatasetVerifiedAndListed has copy, drop, store {
        dataset_id: ID,
        creator: address,
        proof_type: u8,
        verified_at: u64,
        quality_score: u8,
    }

    /// Helper: assert the provided quality meets a minimum threshold.
    public fun verify_minimum_quality(quality_score: u8, min_quality: u8) {
        assert!(quality_score >= min_quality, E_QUALITY_TOO_LOW);
    }

    /// List a dataset only if a corresponding ZK proof has already been verified on-chain.
    /// Steps:
    /// 1) Check zk_verifier::is_proof_verified(registry, &proof_key)
    /// 2) Assert proof is valid and creator matches tx sender
    /// 3) Enforce minimum quality threshold
    /// 4) Delegate to marketplace::list_dataset
    public entry fun list_dataset_with_zk_proof(
        registry: &zk_verifier::ProofRegistry,
        marketplace_obj: &mut marketplace::Marketplace,
        proof_key: vector<u8>,
        dataset_id: ID,
        price: u64,
        walrus_blob_id: vector<u8>,
        seal_policy_id: ID,
        quality_score: u8,
        min_quality: u8,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        let sender = sui::tx_context::sender(ctx);
        let ok = zk_verifier::is_proof_verified(registry, &proof_key);
        assert!(ok, E_PROOF_NOT_VERIFIED);

        let (proof_creator, proof_type, verified_at, is_valid) = zk_verifier::get_proof_record(registry, &proof_key);
        assert!(is_valid, E_PROOF_NOT_VERIFIED);
        assert!(proof_creator == sender, E_CREATOR_MISMATCH);
        verify_minimum_quality(quality_score, min_quality);

        marketplace::list_dataset(
            marketplace_obj,
            dataset_id,
            price,
            walrus_blob_id,
            seal_policy_id,
            quality_score,
            ctx
        );

        event::emit(DatasetVerifiedAndListed {
            dataset_id,
            creator: sender,
            proof_type,
            verified_at,
            quality_score,
        });
    }

    /// Purchase flow that enforces a verified ZK proof before allowing payment to settle.
    /// This is useful when gating purchases on an authenticity or quality proof.
    public entry fun purchase_with_zk_verification(
        registry: &zk_verifier::ProofRegistry,
        marketplace_obj: &mut marketplace::Marketplace,
        proof_key: vector<u8>,
        dataset_id: ID,
        payment: Coin<SUI>,
        platform_treasury: address,
        ctx: &mut TxContext,
    ) {
        let ok = zk_verifier::is_proof_verified(registry, &proof_key);
        assert!(ok, E_PROOF_NOT_VERIFIED);
        let (_, _, _, is_valid) = zk_verifier::get_proof_record(registry, &proof_key);
        assert!(is_valid, E_PROOF_NOT_VERIFIED);

        marketplace::purchase_dataset(
            marketplace_obj,
            dataset_id,
            payment,
            platform_treasury,
            ctx
        );
    }
}


