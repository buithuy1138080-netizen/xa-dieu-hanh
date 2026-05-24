from pathlib import Path as _Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Absolute path to the backend/ directory (config.py lives at backend/app/core/config.py)
_BACKEND_ROOT = _Path(__file__).resolve().parent.parent.parent

_WEAK_KEY_FRAGMENTS = ("dev", "change", "secret", "placeholder", "example", "test", "default")


class Settings(BaseSettings):
    APP_NAME: str = "Hệ Thống Điều Hành Cấp Xã"
    APP_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    ORG_NAME: str = "UBND xã"

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120   # 2 hours
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Absolute path so uploads don't depend on working directory
    UPLOAD_DIR: str = str(_BACKEND_ROOT / "uploads")
    MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50 MB
    OCR_TESSERACT_CMD: str = ""

    # Google Sheet Sync — must be overridden in .env for production
    SYNC_WEBHOOK_SECRET: str = "sync-secret-change-me-in-production"

    # Google Gemini API — optional; enables AI-powered document parsing
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "models/gemini-2.5-flash"

    # Groq API — free alternative LLM (14,400 req/day, Llama 3.3 70B)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # DeepSeek API — optional alternative LLM
    DEEPSEEK_API_KEY: str = ""

    # Field-level encryption for sensitive columns (credentials_json, etc.)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    FERNET_KEY: str = ""  # empty = no encryption (dev only)

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT in ("development", "dev", "test"):
            return self

        errors: list[str] = []

        key = self.SECRET_KEY
        if len(key) < 32:
            errors.append("SECRET_KEY phải có ít nhất 32 ký tự trong môi trường production")
        if any(fragment in key.lower() for fragment in _WEAK_KEY_FRAGMENTS):
            errors.append(
                "SECRET_KEY chứa từ khoá yếu (dev/change/secret/placeholder…). "
                "Hãy tạo key mới: python -c \"import secrets; print(secrets.token_hex(32))\""
            )

        if not self.FERNET_KEY:
            errors.append(
                "FERNET_KEY bắt buộc trong môi trường production. "
                "Tạo key: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )

        if self.SYNC_WEBHOOK_SECRET == "sync-secret-change-me-in-production":
            errors.append("SYNC_WEBHOOK_SECRET vẫn là giá trị mặc định — hãy đặt giá trị mới trong .env")

        if errors:
            raise ValueError(
                "Cấu hình production không hợp lệ:\n" + "\n".join(f"  • {e}" for e in errors)
            )
        return self


settings = Settings()
