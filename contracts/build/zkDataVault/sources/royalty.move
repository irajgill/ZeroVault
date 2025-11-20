module zk_data_vault::royalty {
    use sui::coin::{Coin, value, split};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::event;
    use sui::tx_context::TxContext;

    /// Error codes
    const E_INVALID_PERCENTAGES: u64 = 1;

    /// Configuration for automated royalty distribution.
    /// Percentages are in whole numbers and must sum to 100.
    /// Stored in basis points (bps): 10000 = 100%, 1000 = 10%
    public struct RoyaltyConfig has store, drop {
        creator_bps: u64,
        platform_bps: u64,
        reseller_bps: u64,
    }

    /// Default config: 10% creator, 3% platform, remainder reseller (87%)
    public fun default_config(): RoyaltyConfig {
        create_config(1000, 300, 8700)
    }

    /// Create a royalty config in bps. Ensures bps sum to 10000.
    public fun create_config(
        creator_bps: u64,
        platform_bps: u64,
        reseller_bps: u64,
    ): RoyaltyConfig {
        let total = creator_bps + platform_bps + reseller_bps;
        assert!(total == 10_000, E_INVALID_PERCENTAGES);
        RoyaltyConfig { creator_bps, platform_bps, reseller_bps }
    }

    /// Emitted when a royalty payment is distributed.
    public struct RoyaltyPaid has copy, drop, store {
        total_amount: u64,
        creator_amount: u64,
        platform_amount: u64,
        reseller_amount: u64,
        creator: address,
        platform: address,
        reseller: address,
    }

    /// Split an incoming payment into creator, platform, and reseller shares
    /// according to `cfg`, and transfer to the provided addresses.
    ///
    /// Requirements:
    /// - Basis points in `cfg` must sum to 10000.
    /// Effects:
    /// - Consumes `payment` and transfers split coins to recipients.
    /// - Emits `RoyaltyPaid`.
    public fun split_payment(
        cfg: &RoyaltyConfig,
        mut payment: Coin<SUI>,
        creator_addr: address,
        platform_addr: address,
        reseller_addr: address,
        ctx: &mut TxContext,
    ) {
        let total_bps = cfg.creator_bps + cfg.platform_bps + cfg.reseller_bps;
        assert!(total_bps == 10_000, E_INVALID_PERCENTAGES);

        let total = value(&payment);

        let creator_amount = total * cfg.creator_bps / 10_000;
        let platform_amount = total * cfg.platform_bps / 10_000;
        let reseller_amount = total - creator_amount - platform_amount; // ensures sum exact to total

        // Transfer creator share
        if (creator_amount > 0) {
            let c = split(&mut payment, creator_amount, ctx);
            transfer::public_transfer(c, creator_addr);
        };

        // Transfer platform share
        if (platform_amount > 0) {
            let p = split(&mut payment, platform_amount, ctx);
            transfer::public_transfer(p, platform_addr);
        };

        // Remaining is reseller share
        transfer::public_transfer(payment, reseller_addr);

        event::emit(RoyaltyPaid {
            total_amount: total,
            creator_amount,
            platform_amount,
            reseller_amount,
            creator: creator_addr,
            platform: platform_addr,
            reseller: reseller_addr,
        });
    }

}


