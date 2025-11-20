module zk_data_vault::access_policies {
    use std::vector;
    use sui::object::{UID, ID};
    use sui::tx_context::TxContext;
    use sui::event;
    use sui::vec_set::{Self as vecset, VecSet};

    /// Error codes
    const E_ZERO_MAX_USES: u64 = 1;
    const E_USAGE_EXCEEDED: u64 = 2;
    const E_EXPIRED: u64 = 3;
    const E_ADDRESS_NOT_FOUND: u64 = 4;
    const E_NOT_CREATOR: u64 = 5;

    /// Emitted when a new access policy is created.
    public struct PolicyCreated has copy, drop, store {
        policy_id: ID,
        creator: address,
        expiry_timestamp: u64,
        max_uses: u64,
    }

    /// Emitted when access is granted/used.
    public struct AccessGranted has copy, drop, store {
        policy_id: ID,
        accessor: address,
        current_uses: u64,
    }

    /// AccessPolicy governs who can decrypt a dataset under Seal,
    /// with time-based and usage-based restrictions.
    ///
    /// Notes:
    /// - `allowed_addresses` contains addresses allowed to decrypt (VecSet).
    /// - `expiry_timestamp` is in milliseconds since Unix epoch.
    /// - `max_uses` is the maximum total successful decryptions allowed.
    /// - `current_uses` tracks how many uses have occurred so far.
    /// - `is_active` indicates if policy is active.
    /// - `creator` is the policy owner allowed to revoke.
    public struct AccessPolicy has key, store {
        id: UID,
        allowed_addresses: VecSet<address>,
        expiry_timestamp: u64,
        max_uses: u64,
        current_uses: u64,
        is_active: bool,
        creator: address,
    }

    /// Create a new access policy object.
    /// Requirements:
    /// - `max_uses` must be greater than zero
    /// Effects:
    /// - Returns an owned `AccessPolicy` to the caller (creator/owner)
    /// - Emits `PolicyCreated`
    public fun create_policy(
        allowed_addresses: vector<address>,
        expiry_timestamp: u64,
        max_uses: u64,
        ctx: &mut TxContext,
    ): AccessPolicy {
        assert!(max_uses > 0, E_ZERO_MAX_USES);

        let uid = sui::object::new(ctx);
        let policy_id = sui::object::uid_to_inner(&uid);
        let creator = sui::tx_context::sender(ctx);

        let mut set = vecset::empty<address>();
        let len = vector::length(&allowed_addresses);
        let mut i = 0;
        while (i < len) {
            vecset::insert(&mut set, *vector::borrow(&allowed_addresses, i));
            i = i + 1;
        };

        let policy = AccessPolicy {
            id: uid,
            allowed_addresses: set,
            expiry_timestamp,
            max_uses,
            current_uses: 0,
            is_active: true,
            creator,
        };

        event::emit(PolicyCreated {
            policy_id,
            creator,
            expiry_timestamp,
            max_uses,
        });

        policy
    }

    /// Check whether `addr` currently has access under `policy`.
    /// Returns true only if:
    /// - current time is before or equal to `expiry_timestamp`
    /// - `current_uses` is strictly less than `max_uses`
    /// - `addr` is present in `allowed_addresses`
    public fun check_access(policy: &AccessPolicy, addr: address, now: u64): bool {
        if (!policy.is_active) {
            return false
        };
        if (now > policy.expiry_timestamp) {
            return false
        };
        if (policy.current_uses >= policy.max_uses) {
            return false
        };
        vecset::contains(&policy.allowed_addresses, &addr)
    }

    /// Increment usage count for a successful access under this policy.
    /// Requirements:
    /// - Policy must not be expired
    /// - `current_uses < max_uses`
    /// Emits `AccessGranted`.
    public entry fun increment_usage(
        policy: &mut AccessPolicy,
        accessor: address,
        now: u64,
    ) {
        assert!(policy.is_active, E_EXPIRED);
        assert!(now <= policy.expiry_timestamp, E_EXPIRED);
        assert!(policy.current_uses < policy.max_uses, E_USAGE_EXCEEDED);

        policy.current_uses = policy.current_uses + 1;

        let policy_id = sui::object::uid_to_inner(&policy.id);
        event::emit(AccessGranted {
            policy_id,
            accessor,
            current_uses: policy.current_uses,
        });
    }

    /// Revoke the policy (creator-only).
    public entry fun revoke_policy(policy: &mut AccessPolicy, ctx: &mut TxContext) {
        let sender = sui::tx_context::sender(ctx);
        assert!(sender == policy.creator, E_NOT_CREATOR);
        policy.is_active = false;
    }

    /// Permanently destroy an access policy.
    public fun burn(policy: AccessPolicy) {
        let AccessPolicy { id, allowed_addresses: _, expiry_timestamp: _, max_uses: _, current_uses: _, is_active: _, creator: _ } = policy;
        sui::object::delete(id);
    }
}


