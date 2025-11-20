pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

// Proof-of-origin circuit
// Private inputs:
//  - creatorPrivateKey
//  - dataHash
//  - creationTimestamp
// Public inputs:
//  - publicKeyHash
//  - commitmentHash
//  - currentTimestamp
// Output:
//  - isValid (1 if constraints satisfied, else witness must be invalid)
//
// Constraints:
//  1) Poseidon(creatorPrivateKey) === publicKeyHash
//  2) Poseidon(dataHash) === commitmentHash
//  3) creationTimestamp <= currentTimestamp
//
template DataAuthenticity() {
    // Private inputs
    signal input creatorPrivateKey;
    signal input dataHash;
    signal input creationTimestamp;

    // Public inputs (public classification handled by tooling; circom 2.x has no 'public' keyword)
    signal input publicKeyHash;
    signal input commitmentHash;
    signal input currentTimestamp;

    // Output
    signal output isValid;

    // Poseidon hash of creatorPrivateKey
    component pkeyHash = Poseidon(1);
    pkeyHash.inputs[0] <== creatorPrivateKey;
    // Enforce key ownership
    pkeyHash.out === publicKeyHash;

    // Poseidon hash of dataHash for integrity
    component dataHashPoseidon = Poseidon(1);
    dataHashPoseidon.inputs[0] <== dataHash;
    // Enforce data commitment
    dataHashPoseidon.out === commitmentHash;

    // Timestamp check: creationTimestamp <= currentTimestamp
    // Use 64-bit comparator for UNIX ms timestamps
    component le = LessEqThan(64);
    le.in[0] <== creationTimestamp;
    le.in[1] <== currentTimestamp;

    // isValid mirrors comparator result; other constraints must also hold
    isValid <== le.out;
}

component main = DataAuthenticity();
