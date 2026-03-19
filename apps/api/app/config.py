from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    log_level: str = "INFO"
    default_chat_provider: str = "mock"
    openai_base_url: str = "http://localhost:11434/v1"
    openai_api_key: str = "demo-key"
    openai_model: str = "gpt-4o-mini"

    model_config = SettingsConfigDict(env_file='.env', extra='ignore')


settings = Settings()
