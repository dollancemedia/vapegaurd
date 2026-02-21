Deterministic Training Dataset Builder

Run from repo root:

```powershell
$env:MONGODB_URI="your_mongodb_uri"
python backend/build_training_dataset.py `
  --labels-file backend/training/seed_event_labels.json `
  --db-name vape-alert `
  --samples-collection samples `
  --output-dir backend/training_artifacts `
  --window-seconds 60 `
  --drop-first-n-vape 12 `
  --overlap-json "{\"fire\":0.5,\"clean_air\":0.5,\"vape\":0.0,\"shower\":0.0,\"cooking\":0.0,\"default\":0.0}" `
  --purge-legacy-models `
  --enable-time-split

python backend/train_from_built_dataset.py `
  --artifacts-dir backend/training_artifacts `
  --models-dir backend/models

# If your Mongo timestamps look like Zulu but are actually local Pacific time,
# train directly from events.event_features with timezone reinterpretation:
python backend/train_from_events_collection.py `
  --db-name vape-alert `
  --events-collection events `
  --labels-file backend/training/seed_event_labels.json `
  --drop-first-n-vape 12 `
  --mongo-zulu-is-local-tz America/Los_Angeles `
  --label-zulu-is-local-tz America/Los_Angeles `
  --label-match-tolerance-sec 300 `
  --models-dir backend/models `
  --artifacts-dir backend/training_artifacts
```

What it does:
- Resets old derived artifacts in `backend/training_artifacts`.
- Optionally removes legacy `backend/models/*.joblib` via `--purge-legacy-models`.
- Builds derived events with end-time inference when missing.
- Converts events to class-specific windows (default: 50% overlap for `fire` + `clean_air`, no overlap otherwise).
- Computes modular per-channel engineered features.
- Creates grouped train/val/test splits (`GroupShuffleSplit`) and grouped CV folds (`GroupKFold`).
- Emits optional time-based split metadata by day.
- Trains and saves runtime models (`xgb`, `rf`, `knn`) used by backend ensemble inference.

Outputs:
- `backend/training_artifacts/derived_events.csv`
- `backend/training_artifacts/derived_events.json`
- `backend/training_artifacts/windows_multiclass.csv`
- `backend/training_artifacts/windows_binary_wave_vs_rest.csv` (only when wave labels exist)
- `backend/training_artifacts/splits_multiclass.json`
- `backend/training_artifacts/splits_binary_wave_vs_rest.json`
- `backend/training_artifacts/splits_time_based_optional.json`
- `backend/training_artifacts/manifest.json`
- `backend/training_artifacts/training_report.json`
