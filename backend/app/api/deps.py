from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Credenciales inválidas",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise CREDENTIALS_EXCEPTION
    user_id = payload.get("sub")
    if not user_id:
        raise CREDENTIALS_EXCEPTION
    try:
        user_id = int(user_id)
    except ValueError:
        raise CREDENTIALS_EXCEPTION
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise CREDENTIALS_EXCEPTION
    return user


def get_current_superuser(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol admin"
        )
    return current_user


def require_permission(*codes: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        role_codes = {r.code for r in current_user.roles}
        if current_user.is_superuser:
            return current_user
        granted = set()
        for role in current_user.roles:
            for p in role.permissions:
                granted.add(p.code)
        if any(c in granted for c in codes):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tiene permiso: {', '.join(codes)}",
        )

    return checker
