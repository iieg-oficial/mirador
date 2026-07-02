"""Cifrado simétrico de credenciales de conexiones (Fernet).

Único lugar del sistema que maneja secretos de conexión en claro. Las
contraseñas de las `Connection` se guardan cifradas y nunca se serializan al
frontend (ver `docs/security.md` §9.1).
"""

from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().SECRET_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "SECRET_ENCRYPTION_KEY no está configurada. Genera una con: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode())


def encrypt_secret(plaintext: str) -> str:
    """Cifra un secreto en claro y devuelve el token Fernet (str)."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Descifra un token Fernet y devuelve el secreto en claro."""
    return _fernet().decrypt(token.encode()).decode()
