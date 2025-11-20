use anyhow::{anyhow, Result};
use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_groth16::VerifyingKey;
use ark_serialize::CanonicalSerialize;
use serde_json::Value;
use std::str::FromStr;
use std::{env, fs};

fn parse_fq(s: &str) -> Result<Fq> {
    Fq::from_str(s).map_err(|_| anyhow!("bad Fq: {}", s))
}

fn parse_fq2_pair(pair: (&str, &str)) -> Result<Fq2> {
    // verification_key.json uses [c0, c1] ordering for Fq2 components
    let c0 = parse_fq(pair.0)?;
    let c1 = parse_fq(pair.1)?;
    Ok(Fq2::new(c0, c1))
}

fn parse_g1_arr(arr: &Vec<Value>) -> Result<G1Affine> {
    if arr.len() < 2 {
        return Err(anyhow!("g1 expected len>=2"));
    }
    let x = parse_fq(arr[0].as_str().ok_or_else(|| anyhow!("g1 x not str"))?)?;
    let y = parse_fq(arr[1].as_str().ok_or_else(|| anyhow!("g1 y not str"))?)?;
    Ok(G1Affine::new_unchecked(x, y))
}

fn parse_g2_arr(arr: &Vec<Value>) -> Result<G2Affine> {
    // Expect at least two pairs, ignore possible third (projective z)
    if arr.len() < 2 {
        return Err(anyhow!("g2 expected len>=2"));
    }
    let p0 = arr[0].as_array().ok_or_else(|| anyhow!("g2[0] not array"))?;
    let p1 = arr[1].as_array().ok_or_else(|| anyhow!("g2[1] not array"))?;
    if p0.len() < 2 || p1.len() < 2 {
        return Err(anyhow!("g2 pairs need 2 elems"));
    }
    let x = parse_fq2_pair((
        p0[0].as_str().ok_or_else(|| anyhow!("g2 x.c1 not str"))?,
        p0[1].as_str().ok_or_else(|| anyhow!("g2 x.c0 not str"))?,
    ))?;
    let y = parse_fq2_pair((
        p1[0].as_str().ok_or_else(|| anyhow!("g2 y.c1 not str"))?,
        p1[1].as_str().ok_or_else(|| anyhow!("g2 y.c0 not str"))?,
    ))?;
    Ok(G2Affine::new_unchecked(x, y))
}

fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        return Err(anyhow!(
            "Usage: sui-vktool <verification_key.json> <out.bin>"
        ));
    }
    let json = fs::read_to_string(&args[1])?;
    let v: Value = serde_json::from_str(&json)?;

    let alpha_g1 =
        parse_g1_arr(v["vk_alpha_1"].as_array().ok_or_else(|| anyhow!("vk_alpha_1 missing"))?)?;
    let beta_g2 =
        parse_g2_arr(v["vk_beta_2"].as_array().ok_or_else(|| anyhow!("vk_beta_2 missing"))?)?;
    let gamma_g2 =
        parse_g2_arr(v["vk_gamma_2"].as_array().ok_or_else(|| anyhow!("vk_gamma_2 missing"))?)?;
    let delta_g2 =
        parse_g2_arr(v["vk_delta_2"].as_array().ok_or_else(|| anyhow!("vk_delta_2 missing"))?)?;

    let ic_arr = v["IC"].as_array().ok_or_else(|| anyhow!("IC missing"))?;
    let mut gamma_abc_g1: Vec<G1Affine> = Vec::with_capacity(ic_arr.len());
    for g1v in ic_arr.iter() {
        let a = g1v.as_array().ok_or_else(|| anyhow!("IC elem not array"))?;
        gamma_abc_g1.push(parse_g1_arr(a)?);
    }

    let vk = VerifyingKey::<Bn254> {
        alpha_g1,
        beta_g2,
        gamma_g2,
        delta_g2,
        gamma_abc_g1,
    };

    // Serialize UNPREPARED verifying key bytes in the format expected by Sui fastcrypto groth16::api::from_arkworks_format:
    // alpha(G1, 32b) || beta(G2, 64b) || gamma(G2, 64b) || delta(G2, 64b) || len(gamma_abc) (u64 LE) || gamma_abc (len * 32b)
    use ark_serialize::CanonicalSerialize;
    let mut bytes = Vec::new();
    {
        // alpha_g1
        let mut buf = Vec::new();
        vk.alpha_g1.serialize_compressed(&mut buf)?;
        bytes.extend_from_slice(&buf);
    }
    {
        // beta_g2
        let mut buf = Vec::new();
        vk.beta_g2.serialize_compressed(&mut buf)?;
        bytes.extend_from_slice(&buf);
    }
    {
        // gamma_g2
        let mut buf = Vec::new();
        vk.gamma_g2.serialize_compressed(&mut buf)?;
        bytes.extend_from_slice(&buf);
    }
    {
        // delta_g2
        let mut buf = Vec::new();
        vk.delta_g2.serialize_compressed(&mut buf)?;
        bytes.extend_from_slice(&buf);
    }
    // gamma_abc length as u64 little-endian
    let n: u64 = vk.gamma_abc_g1.len() as u64;
    bytes.extend_from_slice(&n.to_le_bytes());
    // gamma_abc G1 points compressed
    for g1 in &vk.gamma_abc_g1 {
        let mut buf = Vec::new();
        g1.serialize_compressed(&mut buf)?;
        bytes.extend_from_slice(&buf);
    }
    fs::write(&args[2], &bytes)?;
    eprintln!(
        "Wrote Sui-compatible unprepared VK: {} ({} bytes)",
        &args[2],
        bytes.len()
    );
    Ok(())
}