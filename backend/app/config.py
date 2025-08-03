from pydantic import BaseSettings

class Settings(BaseSettings):
    MONGODB_URI: str
    DATABASE_NAME: str = "vapeDB"
    class Config:
        env_file = ".env"

settings = Settings()
