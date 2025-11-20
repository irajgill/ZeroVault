module zk_data_vault::zk_verifier_tests {
    use sui::test_scenario;
    use zk_data_vault::zk_verifier;
    use sui::transfer;

    /// Helper to make a dummy verification key object.
    fun make_vk(ctx: &mut sui::tx_context::TxContext, proof_type: u8): zk_verifier::VerificationKey {
        let vk_bytes = b"dummy_vk_bytes";
        zk_verifier::create_verification_key(proof_type, vk_bytes, ctx)
    }

    #[test]
    public fun test_verify_authenticity_records_invalid() {
        let mut s = test_scenario::begin(@0xA1);
        let sender = @0xA2;

        // tx 1: create and take registry
        test_scenario::next_tx(&mut s, sender);
        zk_verifier::create_registry(test_scenario::ctx(&mut s));
        test_scenario::next_tx(&mut s, sender);
        let mut reg = test_scenario::take_shared<zk_verifier::ProofRegistry>(&mut s);

        // tx 2: verify authenticity with dummy bytes (will be invalid)
        let mut vk = make_vk(test_scenario::ctx(&mut s), /*proof_type*/ 1);
        let inputs = b"dummy_inputs";
        let proof = b"dummy_proof";
        zk_verifier::verify_data_authenticity(&vk, inputs, proof, &mut reg, test_scenario::ctx(&mut s));
        // park the vk under sender to avoid resource leak
        transfer::public_transfer(vk, sender);

        // Check record is present and invalid
        let ok = zk_verifier::is_proof_verified(&reg, &proof);
        assert!(!ok, 0);
        let (creator, ptype, _ts, is_valid) = zk_verifier::get_proof_record(&reg, &proof);
        assert!(creator == sender, 0);
        assert!(ptype == 1, 0);
        assert!(!is_valid, 0);

        test_scenario::return_shared(reg);
        test_scenario::end(s);
    }

    #[test]
    public fun test_verify_quality_records_invalid() {
        let mut s = test_scenario::begin(@0xB1);
        let sender = @0xB2;

        // tx 1: create and take registry
        test_scenario::next_tx(&mut s, sender);
        zk_verifier::create_registry(test_scenario::ctx(&mut s));
        test_scenario::next_tx(&mut s, sender);
        let mut reg = test_scenario::take_shared<zk_verifier::ProofRegistry>(&mut s);

        // verify quality with dummy bytes (will be invalid)
        let mut vk = make_vk(test_scenario::ctx(&mut s), /*proof_type*/ 2);
        let inputs = b"dummy_inputs_q";
        let proof = b"dummy_proof_q";
        zk_verifier::verify_quality_proof(&vk, inputs, proof, &mut reg, test_scenario::ctx(&mut s));
        transfer::public_transfer(vk, sender);

        // Check record is present and invalid
        let ok = zk_verifier::is_proof_verified(&reg, &proof);
        assert!(!ok, 0);
        let (creator, ptype, _ts, is_valid) = zk_verifier::get_proof_record(&reg, &proof);
        assert!(creator == sender, 0);
        assert!(ptype == 2, 0);
        assert!(!is_valid, 0);

        test_scenario::return_shared(reg);
        test_scenario::end(s);
    }

    #[test]
    public fun test_missing_key_returns_false() {
        let mut s = test_scenario::begin(@0xC1);
        let sender = @0xC2;

        test_scenario::next_tx(&mut s, sender);
        zk_verifier::create_registry(test_scenario::ctx(&mut s));
        test_scenario::next_tx(&mut s, sender);
        let reg = test_scenario::take_shared<zk_verifier::ProofRegistry>(&mut s);

        let missing = b"not_present";
        let ok = zk_verifier::is_proof_verified(&reg, &missing);
        assert!(!ok, 0);

        test_scenario::return_shared(reg);
        test_scenario::end(s);
    }
}


