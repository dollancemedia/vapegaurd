# BME680 Threshold Analysis for ESP32 Wake Trigger

## Analysis Date: 2026-03-01
## Data Source: 41 valid vape events (57 total, 16 excluded for BME680 saturation)
## Clean Air Reference: 365 consecutive 5s samples from clean_air_0002

## The Core Problem

Vape aerosol effects on BME680 humidity and gas resistance in the **first 5-10 seconds** are extremely subtle and overlap heavily with the normal noise floor of clean bathroom air.

### Vape Signal at 5 Seconds (33 valid events)
| Metric | Humidity Delta (%RH) | Gas Delta (KOhms) |
|--------|--------------------|--------------------|
| Mean | +0.035 | -0.248 |
| Median | +0.048 | -0.069 |
| P90 | +0.296 | -2.995 (negative=drop) |
| P95 | +0.508 | -7.688 |

### Vape Signal at 10 Seconds (37 valid events)
| Metric | Humidity Delta (%RH) | Gas Delta (KOhms) |
|--------|--------------------|--------------------|
| Mean | +0.044 | -0.995 |
| Median | +0.099 | -1.244 |
| P25 | -0.100 | -2.919 |
| P75 | +0.233 | +0.390 |

### Clean Air Noise Floor (consecutive 5s reads)
| Metric | abs(Humidity Delta) | abs(Gas Delta) |
|--------|--------------------|--------------------|
| P50 | 0.182 | 1.244 |
| P95 | 0.777 | 4.463 |
| P99 | 1.090 | 5.982 |

### Single-Threshold Detection Rates at 10 Seconds
- Gas drop >= 1 KOhm: catches 51.4% of vape events
- Gas drop >= 2 KOhm: catches 40.5%
- Humidity rise >= 0.1 %RH: catches 48.6%
- Humidity rise >= 0.2 %RH: catches 29.7%

### Combined (OR) Detection Rates at 10 Seconds
- gas_drop>=1.5 OR hum_rise>=0.15: catches 70.3%
- gas_drop>=2 OR hum_rise>=0.2: catches 56.8%

## Conclusion

The BME680 cannot achieve 95%+ vape detection recall as a standalone wake trigger at 5-10 seconds. The signal-to-noise ratio is too low.
