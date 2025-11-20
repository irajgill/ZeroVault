module zk_data_vault::dataset {
    use std::vector;
    use sui::object::{UID, ID};
    use std::string::String;
    use sui::tx_context::TxContext;
    use sui::transfer;
    use sui::event;

    /// Error codes
    const E_EMPTY_BLOB_ID: u64 = 1;
    const E_INVALID_PRICE: u64 = 2;

    /// Emitted when a dataset is minted.
    public struct DatasetMinted has copy, drop, store {
        dataset_id: ID,
        creator: address,
        price: u64,
        created_at: u64,
    }

    /// Emitted when a dataset is transferred.
    public struct DatasetTransferred has copy, drop, store {
        dataset_id: ID,
        from: address,
        to: address,
    }

    /// Emitted when a dataset is burned.
    public struct DatasetBurned has copy, drop, store {
        dataset_id: ID,
        owner: address,
    }

    /// Dataset represents an NFT-like object for a data asset stored on Walrus.
    /// Fields:
    /// - `id`: unique object identifier
    /// - `name`: human-readable dataset name
    /// - `description`: dataset description/summary
    /// - `creator`: original creator address
    /// - `blob_id`: Walrus blob identifier (opaque bytes)
    /// - `seal_policy_id`: policy ID associated with decryption rights
    /// - `quality_score`: quality score (0-255)
    /// - `price`: default listing price in SUI (informational; marketplace governs sales)
    /// - `created_at`: unix epoch time in milliseconds when minted
    public struct Dataset has key, store {
        id: UID,
        name: String,
        description: String,
        creator: address,
        blob_id: vector<u8>,
        seal_policy_id: ID,
        quality_score: u8,
        price: u64,
        created_at: u64,
    }

    /// Mint a new `Dataset` object.
    /// Requirements:
    /// - `blob_id` must be non-empty
    /// - `price` must be > 0
    /// Effects:
    /// - Creates and returns a new `Dataset` owned by the caller
    /// - Emits `DatasetMinted` event
    ///
    /// Note: `created_at` is set from the on-chain Clock in milliseconds.
    public fun mint_dataset(
        name: String,
        description: String,
        blob_id: vector<u8>,
        seal_policy_id: ID,
        quality_score: u8,
        price: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Dataset {
        assert!(vector::length(&blob_id) > 0, E_EMPTY_BLOB_ID);
        assert!(price > 0, E_INVALID_PRICE);

        let creator = sui::tx_context::sender(ctx);
        let created_at = sui::clock::timestamp_ms(clock);

        // Create UID first so we can capture the ID in the event
        let uid = sui::object::new(ctx);
        let dataset_id = sui::object::uid_to_inner(&uid);

        let dataset = Dataset {
            id: uid,
            name,
            description,
            creator,
            blob_id,
            seal_policy_id,
            quality_score,
            price,
            created_at,
        };

        event::emit(DatasetMinted {
            dataset_id,
            creator,
            price,
            created_at,
        });

        dataset
    }

    /// Test-only mint that allows passing a custom timestamp without requiring Clock.
    public fun mint_dataset_for_testing(
        name: String,
        description: String,
        blob_id: vector<u8>,
        seal_policy_id: ID,
        quality_score: u8,
        price: u64,
        created_at: u64,
        ctx: &mut TxContext,
    ): Dataset {
        assert!(vector::length(&blob_id) > 0, E_EMPTY_BLOB_ID);
        assert!(price > 0, E_INVALID_PRICE);
        let creator = sui::tx_context::sender(ctx);
        let uid = sui::object::new(ctx);
        let dataset_id = sui::object::uid_to_inner(&uid);
        let dataset = Dataset {
            id: uid,
            name,
            description,
            creator,
            blob_id,
            seal_policy_id,
            quality_score,
            price,
            created_at,
        };
        event::emit(DatasetMinted {
            dataset_id,
            creator,
            price,
            created_at,
        });
        dataset
    }

    /// Get dataset metadata.
    /// Returns read-only references to string/blob data plus primitive copies.
    /// Tuple:
    /// - name: &String
    /// - description: &String
    /// - creator: address
    /// - price: u64
    /// - blob_id: &vector<u8>
    /// - created_at: u64
    public fun get_dataset_info(
        dataset: &Dataset
    ): (&String, &String, address, u64, &vector<u8>, u64) {
        (
            &dataset.name,
            &dataset.description,
            dataset.creator,
            dataset.price,
            &dataset.blob_id,
            dataset.created_at,
        )
    }

    /// Return the object ID of the dataset.
    public fun id(dataset: &Dataset): ID {
        sui::object::uid_to_inner(&dataset.id)
    }

    /// Transfer the dataset to a new owner.
    /// Emits `DatasetTransferred` event.
    public fun transfer_dataset(
        dataset: Dataset,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let from = sui::tx_context::sender(ctx);
        let dataset_id = sui::object::uid_to_inner(&dataset.id);
        event::emit(DatasetTransferred {
            dataset_id,
            from,
            to: recipient,
        });
        transfer::public_transfer(dataset, recipient);
    }

    /// Permanently destroy the dataset.
    /// Only callable by the current owner (enforced by ownership of the object).
    /// Emits `DatasetBurned` event.
    public entry fun burn_dataset(dataset: Dataset, ctx: &mut TxContext) {
        let owner = sui::tx_context::sender(ctx);
        let Dataset { id, name: _, description: _, creator: _, blob_id: _, seal_policy_id: _, quality_score: _, price: _, created_at: _ } = dataset;
        let dataset_id = sui::object::uid_to_inner(&id);
        event::emit(DatasetBurned { dataset_id, owner });
        sui::object::delete(id);
    }
}


