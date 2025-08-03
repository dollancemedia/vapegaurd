import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from category_encoders import TargetEncoder
from xgboost import XGBClassifier
import joblib

# 1) Simulate the realistic dataset
np.random.seed(8)
n_samples = 1000
fire_rate = 0.15
n_fire = int(n_samples * fire_rate)
n_normal = n_samples - n_fire

normal_data = {
    'humidity': np.random.normal(50, 7, n_normal).clip(30, 70),
    'pm25': np.random.normal(10, 4, n_normal).clip(0, 30),
    'particle_size': np.random.normal(210, 40, n_normal).clip(120, 300),
    'volume_spike': np.random.normal(45, 12, n_normal).clip(20, 70),
    'result': np.zeros(n_normal)
}
fire_data = {
    'humidity': np.random.normal(35, 7, n_fire).clip(15, 60),
    'pm25': np.random.normal(25, 6, n_fire).clip(10, 45),
    'particle_size': np.random.normal(300, 40, n_fire).clip(180, 400),
    'volume_spike': np.random.normal(70, 12, n_fire).clip(40, 100),
    'result': np.ones(n_fire)
}

df = pd.concat([pd.DataFrame(normal_data), pd.DataFrame(fire_data)], ignore_index=True)
# 5% label noise
noise_idx = np.random.choice(df.index, size=int(0.05 * n_samples), replace=False)
df.loc[noise_idx, 'result'] = 1 - df.loc[noise_idx, 'result']
df = df.sample(frac=1, random_state=8).reset_index(drop=True)

# 2) Split
X = df.drop(columns=['result'])
y = df['result']
X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, test_size=0.2, random_state=8)

# 3) Build pipeline & train
pipe = Pipeline([
    ('encoder', TargetEncoder(cols=[])),
    ('clf', XGBClassifier(
        random_state=8,
        use_label_encoder=False,
        eval_metric='logloss'
    ))
])
# For simplicity, just fit default params here (you can replace with BayesSearchCV later)
pipe.fit(X_train, y_train)

# 4) Serialize the trained pipeline (includes encoder + model)
joblib.dump(pipe, 'models/xgb_model.joblib')
print("Model trained and saved to backend/models/xgb_model.joblib")
