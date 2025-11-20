module zk_data_vault::marketplace {
    use sui::object::{UID, ID};
    use sui::tx_context::{TxContext};
    use sui::table;
    use sui::coin::{Coin, value, split};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::event;

    /// Error codes
    const E_ALREADY_LISTED: u64 = 1;
    const E_NOT_AVAILABLE: u64 = 2;
    const E_NOT_FOUND: u64 = 3;
    const E_INSUFFICIENT_PAYMENT: u64 = 4;
    const E_INVALID_PRICE: u64 = 5;

    /// Event emitted when a dataset is listed on the marketplace.
    public struct DatasetListed has copy, drop, store {
        dataset_id: ID,
        seller: address,
        price: u64,
        quality_score: u8,
    }

    /// Event emitted when a dataset is purchased from the marketplace.
    public struct DatasetPurchased has copy, drop, store {
        dataset_id: ID,
        buyer: address,
        amount: u64,
        platform_fee: u64,
        creator_royalty: u64,
    }

    /// Event to signal granted decryption access via Seal policy.
    /// Downstream off-chain services should consume this to grant access.
    public struct DecryptionGranted has copy, drop, store {
        dataset_id: ID,
        buyer: address,
        seal_policy_id: ID,
    }

    /// Dataset listing metadata stored in the marketplace.
    /// - `dataset_id`: the ID of the dataset (e.g., NFT or object representing it)
    /// - `original_creator`: the address of the original dataset creator
    /// - `seller`: the address of the current owner listing the dataset
    /// - `price`: listing price in SUI
    /// - `walrus_blob_id`: Walrus blob identifier (opaque bytes)
    /// - `seal_policy_id`: Seal policy object ID that controls decryption access
    /// - `quality_score`: a TEE-verified score (0-255)
    /// - `is_available`: whether the dataset can be purchased
    public struct DatasetListing has store {
        dataset_id: ID,
        original_creator: address,
        seller: address,
        price: u64,
        walrus_blob_id: vector<u8>,
        seal_policy_id: ID,
        quality_score: u8,
        is_available: bool,
    }

    /// Shared marketplace object that holds all listings and fee configuration.
    /// - `platform_fee_percent`: percentage fee taken by the platform (e.g., 3)
    public struct Marketplace has key {
        id: UID,
        datasets: table::Table<ID, DatasetListing>,
        total_datasets: u64,
        platform_fee_percent: u64,
    }

    /// Helper to construct a new marketplace object with default configuration.
    fun new_marketplace(ctx: &mut TxContext): Marketplace {
        Marketplace {
            id: sui::object::new(ctx),
            datasets: table::new<ID, DatasetListing>(ctx),
            total_datasets: 0,
            platform_fee_percent: 3,
        }
    }

    /// Internal initializer invoked at publish-time. Creates and shares the marketplace with a 3% platform fee.
    fun init(ctx: &mut TxContext) {
        let marketplace = new_marketplace(ctx);
        transfer::share_object(marketplace);
    }

    /// Helper to create the marketplace in environments/tests where module 'init' is not invoked.
    public entry fun create_marketplace(ctx: &mut TxContext) {
        let marketplace = new_marketplace(ctx);
        transfer::share_object(marketplace);
    }

    /// List a dataset for sale.
    /// Aborts if:
    /// - price is zero
    /// - dataset is already listed
    public entry fun list_dataset(
        marketplace: &mut Marketplace,
        dataset_id: ID,
        price: u64,
        walrus_blob_id: vector<u8>,
        seal_policy_id: ID,
        quality_score: u8,
        ctx: &mut TxContext,
    ) {
        assert!(price > 0, E_INVALID_PRICE);
        assert!(!table::contains(&marketplace.datasets, dataset_id), E_ALREADY_LISTED);

        let seller = sui::tx_context::sender(ctx);
        let original_creator = seller;
        let listing = DatasetListing {
            dataset_id,
            original_creator,
            seller,
            price,
            walrus_blob_id,
            seal_policy_id,
            quality_score,
            is_available: true,
        };

        table::add(&mut marketplace.datasets, dataset_id, listing);
        marketplace.total_datasets = marketplace.total_datasets + 1;

        event::emit(DatasetListed {
            dataset_id,
            seller,
            price,
            quality_score,
        });
    }

    /// Purchase a dataset.
    /// Splits payment into:
    /// - platform fee: 3%
    /// - creator royalty: 10%
    /// - seller proceeds: remainder
    /// Transfers funds using `transfer::public_transfer`.
    /// Emits `DatasetPurchased` and a `DecryptionGranted` signal event.
    ///
    /// Notes:
    /// - `platform_treasury` should be provided by the caller (platform's address).
    /// - If `payment` exceeds `price`, the difference is refunded to the buyer.
    public entry fun purchase_dataset(
        marketplace: &mut Marketplace,
        dataset_id: ID,
        mut payment: Coin<SUI>,
        platform_treasury: address,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&marketplace.datasets, dataset_id), E_NOT_FOUND);
        let listing = table::borrow_mut(&mut marketplace.datasets, dataset_id);
        assert!(listing.is_available, E_NOT_AVAILABLE);

        let buyer = sui::tx_context::sender(ctx);
        let price = listing.price;
        let paid = value(&payment);
        assert!(paid >= price, E_INSUFFICIENT_PAYMENT);

        // Refund any excess payment to the buyer.
        let refund = paid - price;
        if (refund > 0) {
            let refund_coin = split(&mut payment, refund, ctx);
            transfer::public_transfer(refund_coin, buyer);
        };

        // Split 3% platform, remainder to original creator (97%)
        let platform_fee = price * marketplace.platform_fee_percent / 100;
        if (platform_fee > 0) {
            let p = split(&mut payment, platform_fee, ctx);
            transfer::public_transfer(p, platform_treasury);
        };
        transfer::public_transfer(payment, listing.original_creator);

        // Mark listing unavailable after purchase.
        listing.is_available = false;

        let creator_royalty = price - platform_fee;
        event::emit(DatasetPurchased {
            dataset_id,
            buyer,
            amount: price,
            platform_fee,
            creator_royalty,
        });

        event::emit(DecryptionGranted {
            dataset_id,
            buyer,
            seal_policy_id: listing.seal_policy_id,
        });
    }
}


