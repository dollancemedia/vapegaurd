Deterministic Training Dataset Builder

Run from repo root:

```powershell
$env:MONGODB_URI="your_mongodb_uri"
python backend/build_training_dataset.py `
  --labels-file backend/training/seed_event_labels.json `
  --db-name vape-alert `
  --samples-collection samples `
  --output-dir backend/training_artifacts `
  --window-seconds 10 `
  --purge-legacy-models `
  --enable-time-split
```

What it does:
- Resets old derived artifacts in `backend/training_artifacts`.
- Optionally removes legacy `backend/models/*.joblib` via `--purge-legacy-models`.
- Builds derived events with end-time inference when missing.
- Converts events to 50%-overlap windows.
- Computes modular per-channel engineered features.
- Creates grouped train/val/test splits (`GroupShuffleSplit`) and grouped CV folds (`GroupKFold`).
- Emits optional time-based split metadata by day.

Outputs:
- `backend/training_artifacts/derived_events.csv`
- `backend/training_artifacts/derived_events.json`
- `backend/training_artifacts/windows_multiclass.csv`
- `backend/training_artifacts/windows_binary_wave_vs_rest.csv` (only when wave labels exist)
- `backend/training_artifacts/splits_multiclass.json`
- `backend/training_artifacts/splits_binary_wave_vs_rest.json`
- `backend/training_artifacts/splits_time_based_optional.json`
- `backend/training_artifacts/manifest.json`

