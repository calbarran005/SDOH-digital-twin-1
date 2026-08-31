from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_superuser, get_current_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import AuditLog, Permission, Profile, Role, User
from app.models.sdoh import Alert, EquityIndex
from app.schemas.user import (
    AuditLogOut,
    PermissionOut,
    ProfileIn,
    RoleWithPermissions,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services.audit_service import audit

router = APIRouter(prefix="/users", tags=["Users"])


def _apply_roles(db: Session, user: User, role_codes: List[str]):
    user.roles = []
    if role_codes:
        roles = db.query(Role).filter(Role.code.in_(role_codes)).all()
        found = {r.code for r in roles}
        missing = set(role_codes) - found
        if missing:
            raise HTTPException(
                status_code=400, detail=f"Roles no encontrados: {missing}"
            )
        user.roles = roles


@router.get("", response_model=List[UserOut])
def list_users(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    q = db.query(User)
    if search:
        q = q.filter(
            (User.username.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%"))
        )
    return q.order_by(User.id).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_superuser),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username ya registrado")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
    )
    user.profile = Profile(full_name=payload.full_name)
    _apply_roles(db, user, payload.role_codes or [])
    db.add(user)
    db.commit()
    db.refresh(user)
    audit(db, admin, "CREATE", "user", user.id, f"Creó usuario {user.username}")
    return user


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not (current.is_superuser or current.id == user_id):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


@router.patch("/{user_id}/profile", response_model=UserOut)
def update_profile(
    user_id: int,
    payload: ProfileIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not (current.is_superuser or current.id == user_id):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not user.profile:
        user.profile = Profile(user_id=user.id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user.profile, k, v)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_superuser),
):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    update = payload.model_dump(exclude_unset=True)
    if "password" in update and update["password"]:
        user.hashed_password = hash_password(update.pop("password"))
    role_codes = update.pop("role_codes", None)
    for k, v in update.items():
        setattr(user, k, v)
    if role_codes is not None:
        _apply_roles(db, user, role_codes)
    db.commit()
    db.refresh(user)
    audit(db, admin, "UPDATE", "user", user.id, f"Actualizó usuario {user.username}")
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_superuser),
):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="No puede eliminarse a sí mismo")
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    audit(db, admin, "DELETE", "user", user.id, f"Eliminó usuario {user.username}")
    db.delete(user)
    db.commit()


# --- Roles & Permissions ---
@router.get("/roles/all", response_model=List[RoleWithPermissions])
def list_roles(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Role).order_by(Role.id).all()


@router.get("/permissions/all", response_model=List[PermissionOut])
def list_permissions(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Permission).order_by(Permission.id).all()


# --- Auditoría ---
@router.get("/audit/logs", response_model=List[AuditLogOut])
def audit_logs(
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_superuser),
):
    return (
        db.query(AuditLog)
        .order_by(AuditLog.id.desc())
        .limit(limit)
        .all()
    )
