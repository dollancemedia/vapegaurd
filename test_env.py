import os
from dotenv import load_dotenv

env_path = os.path.join(os.getcwd(), 'backend', '.env')
print(f"Loading env from: {env_path}")
load_dotenv(env_path)
print(f"MONGODB_URI: {os.getenv('MONGODB_URI')}")
