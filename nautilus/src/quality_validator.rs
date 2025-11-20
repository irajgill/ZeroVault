use anyhow::{anyhow, Result};
use std::collections::HashSet;
use tracing::info;

// Public API: run a suite of static checks and return a weighted 0..=100 score.
// NEVER log or expose raw data. Only aggregate scores are logged.
pub fn validate_dataset_quality(data: &[u8]) -> Result<u8> {
    if data.is_empty() {
        return Err(anyhow!("empty dataset"));
    }

    let diversity = check_data_diversity(data);            // 0..=100
    let bias = check_bias_indicators(data);                // 0..=100
    let authenticity = detect_synthetic_patterns(data);    // 0..=100
    let completeness = check_data_completeness(data);      // 0..=100
    let consistency = check_metadata_consistency(data);    // 0..=100

    // Weighted average:
    // diversity*25 + bias*20 + authenticity*30 + completeness*15 + consistency*10
    let score = (diversity as u32 * 25
        + bias as u32 * 20
        + authenticity as u32 * 30
        + completeness as u32 * 15
        + consistency as u32 * 10) / 100;

    let score_u8 = score.min(100) as u8;
    info!(quality_score = score_u8, "Aggregate dataset quality score");
    Ok(score_u8)
}

// Shannon entropy over byte distribution normalized to 0..=100.
fn check_data_diversity(data: &[u8]) -> u32 {
    // Frequency of each byte value 0..=255
    let mut freq = [0usize; 256];
    for &b in data {
        freq[b as usize] += 1;
    }

    let len = data.len() as f64;
    if len == 0.0 {
        return 0;
    }
    // Distinct symbols present
    let distinct = freq.iter().filter(|&&c| c > 0).count();
    if distinct <= 1 {
        return 0;
    }
    // Shannon entropy in bits (max for 256 symbols is log2(256) = 8)
    let mut entropy = 0.0_f64;
    for &count in &freq {
        if count == 0 {
            continue;
        }
        let p = count as f64 / len;
        entropy -= p * p.log2();
    }
    // Normalize to 0..=100 relative to the active alphabet size to better reflect diversity
    let denom = (distinct as f64).log2().max(1.0);
    let normalized = (entropy / denom * 100.0)
        .clamp(0.0, 100.0)
        .round() as u32;
    normalized
}

// Variance-based bias indicator.
// Compute variance of byte values and normalize by the theoretical max variance (~ (255^2)/4).
fn check_bias_indicators(data: &[u8]) -> u32 {
    if data.is_empty() {
        return 0;
    }
    let len = data.len() as f64;
    let mean = data.iter().map(|&b| b as f64).sum::<f64>() / len;
    let var = data
        .iter()
        .map(|&b| {
            let x = b as f64 - mean;
            x * x
        })
        .sum::<f64>()
        / len;
    // Max variance for byte in [0,255] occurs when half 0 and half 255
    let max_var = (255.0_f64 * 255.0_f64) / 4.0_f64; // ~16256.25
    let norm = (var / max_var * 100.0).clamp(0.0, 100.0);
    norm.round() as u32
}

// Detect synthetic patterns via repeated rolling windows (4 bytes).
// High repetition => likely synthetic => lower score.
fn detect_synthetic_patterns(data: &[u8]) -> u32 {
    let n = data.len();
    if n < 8 {
        // Too short to judge; return mid-range
        return 50;
    }
    let window = 4usize;
    if n < window + 1 {
        return 50;
    }
    let total_windows = n - window + 1;
    let mut seen = HashSet::with_capacity(total_windows);
    let mut duplicates = 0usize;
    for i in 0..total_windows {
        let slice = &data[i..i + window];
        if !seen.insert(slice) {
            duplicates += 1;
        }
    }
    let repetition_ratio = (duplicates as f64) / (total_windows as f64);
    let authenticity = (100.0 - (repetition_ratio * 100.0).clamp(0.0, 100.0))
        .round() as u32;
    authenticity
}

// Completeness based on size thresholds (bytes).
// <1KB -> 10, 1KB..10KB -> 50, 10KB..100KB -> 80, >100KB -> 100
fn check_data_completeness(data: &[u8]) -> u32 {
    let sz = data.len();
    if sz <= 1023 {
        10
    } else if sz <= 10 * 1024 {
        50
    } else if sz <= 100 * 1024 {
        80
    } else {
        100
    }
}

// Metadata consistency: proportion of null bytes should be low for typical textual/structured data.
// Score = (1 - zero_ratio) * 100
fn check_metadata_consistency(data: &[u8]) -> u32 {
    if data.is_empty() {
        return 0;
    }
    let zeros = data.iter().filter(|&&b| b == 0).count() as f64;
    let ratio = zeros / (data.len() as f64);
    let score = (100.0 * (1.0 - ratio)).clamp(0.0, 100.0);
    score.round() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diversity_entropy_bounds() {
        let zeros = vec![0u8; 4096];
        let maxdiv = vec![0u8, 85, 170, 255].into_iter().cycle().take(4096).collect::<Vec<_>>();
        let d0 = check_data_diversity(&zeros);
        let d1 = check_data_diversity(&maxdiv);
        assert!(d0 <= 5, "Low diversity expected for zeros, got {}", d0);
        assert!(d1 >= 50, "Higher diversity expected, got {}", d1);
    }

    #[test]
    fn test_bias_variance() {
        let zeros = vec![0u8; 2048];
        let high_var = vec![0u8, 255u8].into_iter().cycle().take(2048).collect::<Vec<_>>();
        let b0 = check_bias_indicators(&zeros);
        let b1 = check_bias_indicators(&high_var);
        assert!(b0 <= 1);
        assert!(b1 >= 90);
    }

    #[test]
    fn test_repetition_authenticity() {
        // Repetitive pattern => low authenticity
        let repetitive = vec![1u8, 2, 3, 4].into_iter().cycle().take(4096).collect::<Vec<_>>();
        let randomish = (0..4096).map(|i| (i as u8).wrapping_mul(73).wrapping_add(19)).collect::<Vec<_>>();
        let a_rep = detect_synthetic_patterns(&repetitive);
        let a_rand = detect_synthetic_patterns(&randomish);
        assert!(a_rep < a_rand, "Repetitive data should have lower authenticity");
    }

    #[test]
    fn test_completeness_thresholds() {
        assert_eq!(check_data_completeness(&vec![0u8; 512]), 10);
        assert_eq!(check_data_completeness(&vec![0u8; 2048]), 50);
        assert_eq!(check_data_completeness(&vec![0u8; 50 * 1024]), 80);
        assert_eq!(check_data_completeness(&vec![0u8; 200 * 1024]), 100);
    }

    #[test]
    fn test_consistency_nulls() {
        let mut data = vec![1u8; 1000];
        data[0] = 0;
        data[1] = 0;
        let s = check_metadata_consistency(&data);
        assert!(s <= 100 && s >= 0);
        let all_nulls = vec![0u8; 1000];
        assert_eq!(check_metadata_consistency(&all_nulls), 0);
    }

    #[test]
    fn test_validate_aggregate() {
        let data = (0..8192).map(|i| (i as u8).wrapping_mul(31)).collect::<Vec<_>>();
        let score = validate_dataset_quality(&data).unwrap();
        assert!(score <= 100);
    }
}


