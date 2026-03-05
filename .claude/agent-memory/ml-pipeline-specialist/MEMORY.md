# ML Pipeline Specialist Memory

## BME680 Vape Detection Threshold Analysis (2026-03-01)

See [bme680_threshold_analysis.md](bme680_threshold_analysis.md) for full details.

Key finding: BME680 humidity/gas changes from vaping in the first 5-10 seconds are **too small to reliably distinguish from clean air noise**. The BME680 alone cannot serve as a reliable vape wake trigger at 95%+ recall. It can only catch ~50-70% of events at thresholds that will also produce false positives from normal bathroom variability.

## Data Quality Notes

- Vape events vape_0030 through vape_0041 and vape_0048 through vape_0051 have **saturated BME680** readings (humidity=100%, gas_resistance=0 KOhms). These 16 events must be excluded from any BME680-focused analysis. This likely indicates the sensor was in a very humid environment (bathroom after shower?) or had a hardware issue.
- Of 57 vape events (after dropping first 12), only 41 have valid BME680 data.
- Gas resistance is stored in KOhms (divided by 1000 in firmware).

## Sensor Behavior Baselines

- **Humidity baseline**: 50-86 %RH, mean 66.3, median 67.6
- **Gas resistance baseline**: 261-526 KOhms, mean 429, median 445
- **Clean air 5s consecutive humidity noise**: P95=0.78 %RH, P99=1.09 %RH
- **Clean air 5s consecutive gas noise**: P95=4.46 KOhms, P99=5.98 KOhms
