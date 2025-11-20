use anyhow::{anyhow, Result};
use ark_bn254::{G1Affine, G2Affine};
use ark_groth16::Proof;
use ark_serialize::CanonicalSerialize;
use serde_json::Value;
use std::{fs, str::FromStr};

fn parse_fq(s: &str) -> Result<ark_bn254::Fq> {
    ark_bn254::Fq::from_str(s).map_err(|_| anyhow!("bad Fq: {}", s))
}

fn parse_fq2_pair(pair: (&str, &str)) -> Result<ark_bn254::Fq2> {
    // helper expects (c0, c1)
    let c0 = parse_fq(pair.0)?;
    let c1 = parse_fq(pair.1)?;
    Ok(ark_bn254::Fq2::new(c0, c1))
}

fn parse_g1_arr(arr: &Vec<Value>) -> Result<G1Affine> {
    if arr.len() < 2 {
        return Err(anyhow!("g1 expected len>=2"));
    }
    let x = parse_fq(arr[0].as_str().ok_or_else(|| anyhow!("g1 x not str"))?)?;
    let y = parse_fq(arr[1].as_str().ok_or_else(|| anyhow!("g1 y not str"))?)?;
    Ok(G1Affine::new_unchecked(x, y))
}

fn parse_g2_from_snarkjs(arr: &Vec<Value>) -> Result<G2Affine> {
    // snarkjs groth16 proof.json for bn128 emits:
    // pi_b = [[x.c0, x.c1], [y.c0, y.c1], [1, 0]]
    if arr.len() < 2 {
        return Err(anyhow!("g2 expected len>=2"));
    }
    let x_arr = arr[0].as_array().ok_or_else(|| anyhow!("pi_b[0] not array"))?;
    let y_arr = arr[1].as_array().ok_or_else(|| anyhow!("pi_b[1] not array"))?;
    if x_arr.len() < 2 || y_arr.len() < 2 {
        return Err(anyhow!("g2 c0/c1 need 2 elems each"));
    }
    // Map directly: (c0, c1)
    let x = parse_fq2_pair((
        x_arr[0].as_str().ok_or_else(|| anyhow!("x.c0 not str"))?,
        x_arr[1].as_str().ok_or_else(|| anyhow!("x.c1 not str"))?,
    ))?;
    let y = parse_fq2_pair((
        y_arr[0].as_str().ok_or_else(|| anyhow!("y.c0 not str"))?,
        y_arr[1].as_str().ok_or_else(|| anyhow!("y.c1 not str"))?,
    ))?;
    Ok(G2Affine::new_unchecked(x, y))
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        return Err(anyhow!(
            "Usage: proofprep <proof.json> <out.bin> (snarkjs proof json → arkworks compressed proof bytes)"
        ));
    }
    let proof_json = fs::read_to_string(&args[1])?;
    let v: Value = serde_json::from_str(&proof_json)?;

    let pi_a = v["pi_a"].as_array().ok_or_else(|| anyhow!("pi_a missing"))?;
    let pi_b = v["pi_b"].as_array().ok_or_else(|| anyhow!("pi_b missing"))?;
    let pi_c = v["pi_c"].as_array().ok_or_else(|| anyhow!("pi_c missing"))?;

    let a = parse_g1_arr(pi_a)?;
    let b = parse_g2_from_snarkjs(pi_b)?;
    let c = parse_g1_arr(pi_c)?;

    let proof = Proof::<ark_bn254::Bn254> {
        a,
        b,
        c,
    };
    let mut bytes = Vec::new();
    proof.serialize_compressed(&mut bytes)?;
    fs::write(&args[2], &bytes)?;
    eprintln!("Wrote arkworks compressed proof: {} ({} bytes)", &args[2], bytes.len());
    Ok(())
}

