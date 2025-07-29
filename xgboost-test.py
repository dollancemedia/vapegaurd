import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from category_encoders import TargetEncoder
from xgboost import XGBClassifier
from skopt import BayesSearchCV
from skopt.space import Real, Integer, Categorical
from sklearn.metrics import roc_auc_score

pd.set_option('future.no_silent_downcasting', True)

x = 8           # Random seed for reproducibility
np.random.seed(x)
n_samples = 100000
fire_rate = 0.001  # 2% of samples are fire events

n_fire = int(n_samples * fire_rate)
n_normal = n_samples - n_fire

# Non-fire (normal) distribution
normal_data = {
    'humidity': np.random.normal(50, 7, n_normal).clip(30, 70),
    'pm25': np.random.normal(10, 4, n_normal).clip(0, 30),
    'particle_size': np.random.normal(210, 40, n_normal).clip(120, 300),
    'volume_spike': np.random.normal(45, 12, n_normal).clip(20, 70),
    'result': np.zeros(n_normal)
}

# Fire distribution with overlap
fire_data = {
    'humidity': np.random.normal(35, 7, n_fire).clip(15, 60),        # slightly overlaps with normal
    'pm25': np.random.normal(25, 6, n_fire).clip(10, 45),
    'particle_size': np.random.normal(300, 40, n_fire).clip(180, 400),
    'volume_spike': np.random.normal(70, 12, n_fire).clip(40, 100),
    'result': np.ones(n_fire)
}

# Combine and shuffle
df_realistic = pd.concat([
    pd.DataFrame(normal_data),
    pd.DataFrame(fire_data)
], ignore_index=True)

# Add some label noise (mislabel ~5%)
noise_indices = np.random.choice(df_realistic.index, size=int(0.001 * n_samples), replace=False)
df_realistic.loc[noise_indices, 'result'] = 1 - df_realistic.loc[noise_indices, 'result']

# Shuffle rows
df_realistic = df_realistic.sample(frac=1, random_state=8).reset_index(drop=True)


'''
df = pd.read_csv('bank-additional.csv', delimiter=';')
cols = ['duration', 'emp.var.rate', 'cons.price.idx', 'cons.conf.idx', 'euribor3m', 'nr.employed']
df=df.drop(columns=cols).rename(columns={'job': 'job_type', 'default': 'default_status', 'housing': 'housing_loan_status', 'loan': 'personal_loan_status', 'contact': 'contact_type', 'month': 'contact_month', 'day_of_week': 'contact_day_of_week', 'campaign': 'num_contacts', 'pdays': 'days_last_contact', 'previous': 'previous_contacts', 'poutcome': 'previous_outcome', 'y': 'result'})
df['result'] = df['result'].replace({'yes': 1, 'no': 0})

# Remove quotes from column names (if any)
df.columns = df.columns.str.replace('"', '')

# Remove quotes from string/object columns safely
for col in df.select_dtypes(include='object').columns:
    df[col] = df[col].astype(str).str.replace('"', '')

# Ensure target column is integer (fix for your error)
df['result'] = df['result'].astype(int)
'''

X = df_realistic.drop(columns=['result'])
y = df_realistic['result']

# X=df.drop(columns=['result'])
# y=df['result']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=8)

estimators = [
    ('encoder', TargetEncoder(cols=[])),
    ('clf', XGBClassifier(random_state=8, use_label_encoder=False, eval_metric='logloss'))
]
pipe = Pipeline(steps=estimators)

search_space = {
    'clf__max_depth': Integer(2, 8),
    'clf__learning_rate': Real(0.001, 1.0, prior='log-uniform'),
    'clf__subsample': Real(0.5, 1.0),
    'clf__colsample_bytree': Real(0.5, 1.0),
    'clf__colsample_bylevel': Real(0.5, 1.0),
    'clf__colsample_bynode': Real(0.5, 1.0),
    'clf__reg_alpha': Real(0, 10),
    'clf__reg_lambda': Real(0, 10),
    'clf__gamma': Real(0, 10),
}

# make cv and n_iter bigger for better results
opt = BayesSearchCV(pipe, search_space, cv=3, n_iter=10, scoring = 'roc_auc', random_state=8)

opt.fit(X_train, y_train)

print("\n\n\n\n\n")
print("Best parameters found: ", opt.best_params_)
print("Best score: ", opt.best_score_)

# Evaluate the model on the test set
test_score = opt.score(X_test, y_test)
print("Test ROC AUC score:", test_score)

# Get predicted probabilities for the positive class
y_pred_proba = opt.predict_proba(X_test)[:, 1]

# Bootstrapping for 95% confidence interval
intervalSize = 95                       # Confidence interval size
n_bootstraps = 1000
rng = np.random.RandomState(42)
bootstrapped_scores = []

for i in range(n_bootstraps):
    indices = rng.randint(0, len(y_test), len(y_test))
    if len(np.unique(y_test.iloc[indices])) < 2:
        # Skip this sample because ROC AUC is undefined with only one class
        continue
    score = roc_auc_score(y_test.iloc[indices], y_pred_proba[indices])
    bootstrapped_scores.append(score)

# Compute 2.5th and 97.5th percentiles for 95% CI
ci_lower = np.percentile(bootstrapped_scores, (100 - intervalSize) / 2)
ci_upper = np.percentile(bootstrapped_scores, 100 - (100 - intervalSize) / 2)

print(f"{intervalSize}% confidence interval for ROC AUC: [{ci_lower:.3f}, {ci_upper:.3f}]")

print("\n\n")
# Example: new situation (replace these values with your sensor readings)
new_situation = pd.DataFrame([{
    'humidity': 32,
    'pm25': 28,
    'particle_size': 320,
    'volume_spike': 80
}])

# Predict class (0 = not fire, 1 = fire)
predicted_class = opt.predict(new_situation)[0]

# Predict probability for fire (class 1)
fire_probability = opt.predict_proba(new_situation)[0, 1]

print(f"Predicted class: {'FIRE' if predicted_class == 1 else 'NO FIRE'}")
print(f"Probability of fire: {fire_probability:.2f}")

