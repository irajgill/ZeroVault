# ---------- Builder Stage ----------
FROM rust:1.75-slim AS builder

WORKDIR /build

# Dependencies for building (openssl headers may be needed by crates; rustls used but keep minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Cache deps: copy manifest and create a dummy main to build once
COPY Cargo.toml ./
RUN mkdir -p src && echo 'fn main() { println!("nautilus build cache"); }' > src/main.rs
RUN cargo build --release

# Now copy real sources and rebuild
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ---------- Runtime Stage ----------
FROM amazonlinux:2 AS runtime

WORKDIR /app

# Minimal runtime deps
RUN yum update -y && yum install -y ca-certificates curl && \
    yum clean all && rm -rf /var/cache/yum

# Create non-root user
RUN useradd -u 1000 -r -s /sbin/nologin nautilus && \
    mkdir -p /app && chown -R nautilus:nautilus /app

# Copy compiled binary
COPY --from=builder /build/target/release/zkdatavault-nautilus /app/nautilus-service
RUN chown nautilus:nautilus /app/nautilus-service && chmod 0755 /app/nautilus-service

USER nautilus
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD curl -f http://localhost:3000/health || exit 1

CMD ["/app/nautilus-service"]
























