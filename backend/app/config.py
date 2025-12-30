from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URI: str
    DATABASE_NAME: str = "vape-alert"
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
