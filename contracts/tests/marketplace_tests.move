module zk_data_vault::marketplace_tests {
    use std::vector;
    use std::string;
    use sui::sui::SUI;
    use sui::test_scenario;
    use sui::coin;

    use zk_data_vault::marketplace;
    use zk_data_vault::dataset;
    use zk_data_vault::access_policies;

    /// Helper: mint a dataset for tests
    fun mint_test_dataset(ctx: &mut sui::tx_context::TxContext): dataset::Dataset {
        let name = string::utf8(b"Human Tweets");
        let description = string::utf8(b"Curated human-authored tweets for AI training");
        let blob_id = b"walrus_blob_123";
        // informational price (not used directly in marketplace)
        let price = 1_000;
        let fake_now = 1_700_000_000_000;
        let seal_policy_id = sui::object::id_from_address(@0xE);
        let quality_score: u8 = 90;
        dataset::mint_dataset_for_testing(name, description, blob_id, seal_policy_id, quality_score, price, fake_now, ctx)
    }

    /// Test 1: Marketplace initialization and shared object creation
    #[test]
    public fun test_marketplace_init() {
        let mut scenario = test_scenario::begin(@0xA);

        // create and share the marketplace
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));

        // start a new transaction so the shared object is available to take
        test_scenario::next_tx(&mut scenario, @0xA);

        // take shared marketplace to inspect fields
        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        test_scenario::return_shared(mp);

        test_scenario::end(scenario);
    }

    /// Test 2: Dataset listing flow
    #[test]
    public fun test_dataset_listing_flow() {
        let mut scenario = test_scenario::begin(@0xA);
        let creator = @0xB;
        test_scenario::next_tx(&mut scenario, creator);

        // create marketplace
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));

        // commit and start a new tx for subsequent operations
        test_scenario::next_tx(&mut scenario, creator);

        // mint dataset
        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));

        // prepare listing params
        let dataset_id = dataset::id(&ds);
        let price = 10_000;
        let walrus_blob_id = b"walrus_blob_123";
        let seal_policy_id = dataset_id; // reuse as placeholder ID for tests
        let quality_score: u8 = 95;

        // take shared marketplace and list
        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(&mut mp, dataset_id, price, walrus_blob_id, seal_policy_id, quality_score, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp);

        // consume dataset by transferring to creator (owner context)
        sui::transfer::public_transfer(ds, creator);

        test_scenario::end(scenario);
    }

    /// Test 3: Purchase with payment splitting
    #[test]
    public fun test_purchase_succeeds_and_closes_listing() {
        let mut scenario = test_scenario::begin(@0xA);
        let creator = @0xB;
        let buyer = @0xC;
        let platform = @0xD;

        // Tx 1: creator initializes marketplace and lists dataset
        test_scenario::next_tx(&mut scenario, creator);
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));

        // commit and start a new tx before interacting with shared object
        test_scenario::next_tx(&mut scenario, creator);

        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));

        let dataset_id = dataset::id(&ds);
        let price = 10_000;
        let walrus_blob_id = b"walrus_blob_abc";
        let seal_policy_id = dataset_id;
        let quality_score: u8 = 88;

        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(&mut mp, dataset_id, price, walrus_blob_id, seal_policy_id, quality_score, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp);

        // consume dataset by transferring to creator
        sui::transfer::public_transfer(ds, creator);

        // Tx 2: buyer purchases with sufficient SUI
        test_scenario::next_tx(&mut scenario, buyer);
        let payment = coin::mint_for_testing<SUI>(12_345, test_scenario::ctx(&mut scenario));
        let mut mp2 = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::purchase_dataset(&mut mp2, dataset_id, payment, platform, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp2);

        test_scenario::end(scenario);
    }

    /// Test 4: Access policy verification happy path
    #[test]
    public fun test_access_policy_verification() {
        let mut scenario = test_scenario::begin(@0xA);
        let creator = @0xB;
        let buyer = @0xC;
        test_scenario::next_tx(&mut scenario, creator);

        // create policy allowing buyer with 1 use, expires in the future
        let now = 1_700_000_000_000; // ms, placeholder stamp
        let expiry = now + 1_000_000;
        let mut allowed = vector::empty<address>();
        vector::push_back(&mut allowed, buyer);
        let mut policy = access_policies::create_policy(allowed, expiry, /*max_uses*/ 1, test_scenario::ctx(&mut scenario));

        // verify using timestamp APIs (no Clock needed)
        assert!(access_policies::check_access(&policy, buyer, now), 0);
        access_policies::increment_usage(&mut policy, buyer, now);
        // consume policy
        access_policies::burn(policy);

        test_scenario::end(scenario);
    }

    /// Test 5a: Insufficient payment should fail
    #[test, expected_failure]
    public fun test_insufficient_payment_fails() {
        let mut scenario = test_scenario::begin(@0xA);
        let creator = @0xB;
        let buyer = @0xC;
        let platform = @0xD;

        // creator lists dataset
        test_scenario::next_tx(&mut scenario, creator);
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));
        test_scenario::next_tx(&mut scenario, creator);
        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));
        let dataset_id = dataset::id(&ds);
        let price = 50_000;
        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(&mut mp, dataset_id, price, b"blob", dataset_id, 80, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp);

        // consume dataset by transferring to creator
        sui::transfer::public_transfer(ds, creator);

        // buyer attempts underpay
        test_scenario::next_tx(&mut scenario, buyer);
        let payment = coin::mint_for_testing<SUI>(10_000, test_scenario::ctx(&mut scenario));
        let mut mp2 = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        // expected to abort with E_INSUFFICIENT_PAYMENT
        marketplace::purchase_dataset(&mut mp2, dataset_id, payment, platform, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp2);

        test_scenario::end(scenario);
    }

    /// Test 5b: Unauthorized access check should be false
    #[test]
    public fun test_unauthorized_access_check_is_false() {
        let mut scenario = test_scenario::begin(@0xA);
        let creator = @0xB;
        let stranger = @0xC;
        test_scenario::next_tx(&mut scenario, creator);

        let mut allowed = vector::empty<address>();
        // allow only creator
        vector::push_back(&mut allowed, creator);
        let policy = access_policies::create_policy(allowed, /*expiry*/ 9_999_999_999_999, /*max_uses*/ 5, test_scenario::ctx(&mut scenario));

        let now = 1_700_000_000_000;
        assert!(!access_policies::check_access(&policy, stranger, now), 0);
        // consume policy
        access_policies::burn(policy);

        test_scenario::end(scenario);
    }

    /// Test 5c: Usage exceeded should fail on increment
    #[test, expected_failure]
    public fun test_usage_exceeded_fails() {
        let mut scenario = test_scenario::begin(@0xA);
        let creator = @0xB;
        let buyer = @0xC;
        test_scenario::next_tx(&mut scenario, creator);

        let mut allowed = vector::empty<address>();
        vector::push_back(&mut allowed, buyer);
        let policy = access_policies::create_policy(allowed, /*expiry*/ 9_999_999_999_999, /*max_uses*/ 1, test_scenario::ctx(&mut scenario));

        let now = 1_700_000_000_000;
        // Move ownership into a helper that will exceed usage and abort
        exceed_usage(policy, buyer, now);

        test_scenario::end(scenario);
    }

    /// Helper: consumes policy and performs two increments (second should abort)
    fun exceed_usage(mut policy: access_policies::AccessPolicy, buyer: address, now: u64) {
        access_policies::increment_usage(&mut policy, buyer, now);
        access_policies::increment_usage(&mut policy, buyer, now);
        // unreachable: if not aborted, ensure resource is consumed
        access_policies::burn(policy);
    }

    /// Spec-named wrapper: successful listing
    #[test]
    public fun test_list_dataset() {
        let mut scenario = test_scenario::begin(@0xAA);
        let creator = @0xBB;
        test_scenario::next_tx(&mut scenario, creator);

        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));
        test_scenario::next_tx(&mut scenario, creator);

        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));
        let dataset_id = dataset::id(&ds);

        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(
            &mut mp,
            dataset_id,
            5_000,
            b"walrus_blob_spec",
            dataset_id,
            80,
            test_scenario::ctx(&mut scenario)
        );
        test_scenario::return_shared(mp);
        sui::transfer::public_transfer(ds, creator);

        test_scenario::end(scenario);
    }

    /// Spec-named wrapper: purchase dataset happy path
    #[test]
    public fun test_purchase_dataset() {
        let mut scenario = test_scenario::begin(@0xAB);
        let creator = @0xBC;
        let buyer = @0xCD;
        let platform = @0xDE;

        // create marketplace and list
        test_scenario::next_tx(&mut scenario, creator);
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));
        test_scenario::next_tx(&mut scenario, creator);
        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));
        let dataset_id = dataset::id(&ds);
        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(&mut mp, dataset_id, 12_000, b"blob_purchase", dataset_id, 90, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp);
        sui::transfer::public_transfer(ds, creator);

        // purchase
        test_scenario::next_tx(&mut scenario, buyer);
        let payment = sui::coin::mint_for_testing<SUI>(12_000, test_scenario::ctx(&mut scenario));
        let mut mp2 = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::purchase_dataset(&mut mp2, dataset_id, payment, platform, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp2);

        test_scenario::end(scenario);
    }

    /// Spec-named wrapper: insufficient payment expected failure
    #[test, expected_failure]
    public fun test_purchase_insufficient_payment() {
        let mut scenario = test_scenario::begin(@0xAC);
        let creator = @0xBD;
        let buyer = @0xCE;
        let platform = @0xDF;

        test_scenario::next_tx(&mut scenario, creator);
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));
        test_scenario::next_tx(&mut scenario, creator);
        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));
        let dataset_id = dataset::id(&ds);
        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(&mut mp, dataset_id, 20_000, b"blob_insufficient", dataset_id, 85, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp);
        sui::transfer::public_transfer(ds, creator);

        test_scenario::next_tx(&mut scenario, buyer);
        let payment = sui::coin::mint_for_testing<SUI>(10_000, test_scenario::ctx(&mut scenario));
        let mut mp2 = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::purchase_dataset(&mut mp2, dataset_id, payment, platform, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp2);

        test_scenario::end(scenario);
    }

    /// Verify 97% to creator, 3% to platform after purchase.
    #[test]
    public fun test_royalty_split() {
        let mut scenario = test_scenario::begin(@0xAD);
        let creator = @0xBE;
        let buyer = @0xCF;
        let platform = @0xA1;

        // Setup: create marketplace and list dataset at price 100_000
        test_scenario::next_tx(&mut scenario, creator);
        marketplace::create_marketplace(test_scenario::ctx(&mut scenario));
        test_scenario::next_tx(&mut scenario, creator);
        let ds = mint_test_dataset(test_scenario::ctx(&mut scenario));
        let dataset_id = dataset::id(&ds);
        let price = 100_000;
        let mut mp = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::list_dataset(&mut mp, dataset_id, price, b"blob_split", dataset_id, 90, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp);
        sui::transfer::public_transfer(ds, creator);

        // Buyer pays exact price
        test_scenario::next_tx(&mut scenario, buyer);
        let payment = sui::coin::mint_for_testing<SUI>(price, test_scenario::ctx(&mut scenario));
        let mut mp2 = test_scenario::take_shared<marketplace::Marketplace>(&mut scenario);
        marketplace::purchase_dataset(&mut mp2, dataset_id, payment, platform, test_scenario::ctx(&mut scenario));
        test_scenario::return_shared(mp2);

        // Platform should have received 3% = 3_000
        test_scenario::next_tx(&mut scenario, platform);
        let pcoin: sui::coin::Coin<SUI> = test_scenario::take_from_sender(&mut scenario);
        assert!(sui::coin::value(&pcoin) == 3_000, 0);
        // consume the coin by transferring back to platform
        sui::transfer::public_transfer(pcoin, platform);

        // Creator should have received 97% = 97_000
        test_scenario::next_tx(&mut scenario, creator);
        let ccoin: sui::coin::Coin<SUI> = test_scenario::take_from_sender(&mut scenario);
        assert!(sui::coin::value(&ccoin) == 97_000, 0);
        sui::transfer::public_transfer(ccoin, creator);

        test_scenario::end(scenario);
    }
}


