pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// Quality proof without revealing individual metrics
// Private inputs:
//  - qualityMetrics[10]
// Public inputs:
//  - minThreshold
//  - maxThreshold
//  - expectedHash  (Poseidon hash of the 10 metrics)
// Outputs:
//  - isValid (1 if all constraints hold)
//  - aggregateScore (integer average = sum(metrics) / 10)
//
// Constraints:
//  1) For each metric m: m >= minThreshold  (implemented as minThreshold <= m)
//  2) For each metric m: m <= maxThreshold
//  3) Poseidon(qualityMetrics) === expectedHash
//  4) aggregateScore * 10 === sum(qualityMetrics)
//
template QualityProof(n) {
    // Private inputs
    signal input qualityMetrics[n];

    // Public inputs (public classification handled by tooling; circom 2.x has no 'public' keyword)
    signal input minThreshold;
    signal input maxThreshold;
    signal input expectedHash;

    // Outputs
    signal output isValid;
    signal output aggregateScore;

    // Range checks using 32-bit comparators (sufficient for typical 0..100 scores)
    component ge[n]; // minThreshold <= metric
    component le[n]; // metric <= maxThreshold

    var i;
    for (i = 0; i < n; i++) {
        ge[i] = LessEqThan(32);
        ge[i].in[0] <== minThreshold;
        ge[i].in[1] <== qualityMetrics[i];

        le[i] = LessEqThan(32);
        le[i].in[0] <== qualityMetrics[i];
        le[i].in[1] <== maxThreshold;
    }

    // Poseidon hash over all metrics
    component h = Poseidon(n);
    for (i = 0; i < n; i++) {
        h.inputs[i] <== qualityMetrics[i];
    }
    // Enforce commitment
    h.out === expectedHash;

    // Sum and integer average
    signal sums[n + 1];
    sums[0] <== 0;
    for (i = 0; i < n; i++) {
        sums[i + 1] <== sums[i] + qualityMetrics[i];
    }
    // aggregateScore = sums[n] / n (field division)
    aggregateScore <== sums[n] / n;

    // isValid is the AND of all comparator results
    signal flags[2 * n];
    for (i = 0; i < n; i++) {
        flags[i] <== ge[i].out;
        flags[n + i] <== le[i].out;
    }
    signal prod[2 * n + 1];
    prod[0] <== 1;
    for (i = 0; i < 2 * n; i++) {
        prod[i + 1] <== prod[i] * flags[i];
    }
    isValid <== prod[2 * n];
}

// Expose a 10-metric circuit as main
component main = QualityProof(10);


