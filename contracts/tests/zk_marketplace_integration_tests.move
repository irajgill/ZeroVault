module zk_data_vault::zk_marketplace_integration_tests {
    use sui::test_scenario;

    use zk_data_vault::dataset;
    use zk_data_vault::marketplace;
    use zk_data_vault::zk_verifier;
    use zk_data_vault::zk_marketplace_integration;

    /// Create and take shared Marketplace
    fun take_marketplace(s: &mut test_scenario::Scenario, addr: address): marketplace::Marketplace {
        marketplace::create_marketplace(test_scenario::ctx(s));
        test_scenario::next_tx(s, addr);
        test_scenario::take_shared<marketplace::Marketplace>(s)
    }

    /// Create and take shared ProofRegistry
    fun take_registry(s: &mut test_scenario::Scenario, addr: address): zk_verifier::ProofRegistry {
        zk_verifier::create_registry(test_scenario::ctx(s));
        test_scenario::next_tx(s, addr);
        test_scenario::take_shared<zk_verifier::ProofRegistry>(s)
    }

    #[test, expected_failure]
    public fun test_list_with_unverified_proof_aborts() {
        let mut s = test_scenario::begin(@0xD1);
        let creator = @0xD2;
        test_scenario::next_tx(&mut s, creator);

        // Setup marketplace and registry
        let mut mp = take_marketplace(&mut s, creator);
        let reg = take_registry(&mut s, creator);

        // Mint dataset and attempt to list with unverified proof
        let ds = dataset::mint_dataset_for_testing(
            std::string::utf8(b"DS"),
            std::string::utf8(b"Desc"),
            b"blob",
            sui::object::id_from_address(@0xE1),
            80,
            1000,
            /*created_at*/ 1700000000,
            test_scenario::ctx(&mut s)
        );
        let dataset_id = dataset::id(&ds);

        // No proof verification performed; use dummy proof key
        let proof_key = b"dummy_proof_key";

        // Aborts with E_PROOF_NOT_VERIFIED
        // Create a test clock and pass by immutable ref; destroy after (unreachable on abort).
        let clk = sui::clock::create_for_testing(test_scenario::ctx(&mut s));
        zk_marketplace_integration::list_dataset_with_zk_proof(
            &reg,
            &mut mp,
            proof_key,
            dataset_id,
            10_000,
            b"blob_walrus_id",
            sui::object::id_from_address(@0xF1),
            /*quality*/ 90,
            /*min_quality*/ 50,
            /*clock (unused)*/ &clk,
            test_scenario::ctx(&mut s)
        );

        // Unreachable: should abort before
        sui::clock::destroy_for_testing(clk);
        test_scenario::return_shared(reg);
        test_scenario::return_shared(mp);
        dataset::transfer_dataset(ds, creator, test_scenario::ctx(&mut s));
        test_scenario::end(s);
    }

    #[test, expected_failure]
    public fun test_purchase_with_unverified_proof_aborts() {
        let mut s = test_scenario::begin(@0xE2);
        let creator = @0xE3;
        let buyer = @0xE4;
        let platform = @0xE5;

        // Tx1: creator sets up marketplace and lists dataset (without zk integration)
        test_scenario::next_tx(&mut s, creator);
        let mut mp = take_marketplace(&mut s, creator);
        let ds = dataset::mint_dataset_for_testing(
            std::string::utf8(b"DS2"),
            std::string::utf8(b"Desc2"),
            b"blob2",
            sui::object::id_from_address(@0xE6),
            85,
            2000,
            1700000001,
            test_scenario::ctx(&mut s)
        );
        let dataset_id = dataset::id(&ds);
        marketplace::list_dataset(&mut mp, dataset_id, 12_000, b"blob", dataset_id, 85, test_scenario::ctx(&mut s));
        test_scenario::return_shared(mp);
        sui::transfer::public_transfer(ds, creator);

        // Tx2: buyer tries to purchase with zk verification gate using unverified proof
        test_scenario::next_tx(&mut s, buyer);
        let mut mp2 = test_scenario::take_shared<marketplace::Marketplace>(&mut s);
        let reg = take_registry(&mut s, buyer);
        let payment = sui::coin::mint_for_testing<sui::sui::SUI>(12_000, test_scenario::ctx(&mut s));
        let proof_key = b"dummy_key_2";

        // Aborts with E_PROOF_NOT_VERIFIED
        zk_marketplace_integration::purchase_with_zk_verification(
            &reg,
            &mut mp2,
            proof_key,
            dataset_id,
            payment,
            platform,
            test_scenario::ctx(&mut s)
        );

        // Unreachable
        test_scenario::return_shared(reg);
        test_scenario::return_shared(mp2);
        test_scenario::end(s);
    }
}


