# Chapter 2: Back-of-the-Envelope Estimation

## Overview

This chapter implements interactive tools and examples for back-of-the-envelope estimations in system design interviews, following Alex Xu's "System Design Interview: An Insider's Guide" Chapter 2.

## What You'll Learn

1. **Power of Two** - Understanding data volume units and binary calculations
2. **Latency Numbers** - Key performance benchmarks every programmer should know
3. **Practical Examples** - Real-world estimation scenarios (Twitter, YouTube, etc.)
4. **Estimation Techniques** - QPS, storage, bandwidth, and server calculations

## Interactive Tools

- **Power of Two Calculator** - Convert between bytes, KB, MB, GB, TB, PB
- **Latency Benchmark Tool** - Modern latency numbers with comparisons
- **QPS Estimator** - Calculate queries per second and peak load
- **Storage Calculator** - Estimate storage requirements over time
- **Twitter Scale Example** - Step-by-step estimation walkthrough

## Key Estimation Concepts

### Traffic Estimation
- Daily Active Users (DAU)
- Queries Per Second (QPS)
- Peak QPS (typically 2-5x average)
- Read vs Write ratios

### Storage Estimation
- Text storage (tweets, posts, messages)
- Media storage (images, videos)
- Metadata overhead
- Retention policies

### Bandwidth Estimation
- Network I/O requirements
- CDN bandwidth needs
- Geographic distribution

## Common Estimation Patterns

```
1. Clarify requirements and assumptions
2. Estimate scale (users, data, QPS)
3. Calculate storage needs
4. Estimate bandwidth
5. Determine server requirements
6. Consider high-level design
```

## Directory Structure

```
chapter-2-estimation/
├── README.md
├── tools/
│   ├── power-of-two-calculator/
│   ├── latency-benchmark/
│   ├── qps-estimator/
│   ├── storage-calculator/
│   └── twitter-example/
├── examples/
│   ├── twitter-estimation.js
│   ├── youtube-estimation.js
│   └── chat-system-estimation.js
├── tests/
│   └── estimation-accuracy.test.js
└── dashboard/
    └── index.html
```

## Getting Started

Each tool can be run independently and provides interactive calculations for system design interview preparation.