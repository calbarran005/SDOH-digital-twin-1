from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# --- Permission / Role ---
class PermissionOut(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_system: bool = False

    class Config:
        from_attributes = True


class RoleWithPermissions(RoleOut):
    permissions: List[PermissionOut] = []


# --- Profile ---
class ProfileIn(BaseModel):
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    organization: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Optional[str] = None


class ProfileOut(ProfileIn):
    id: int
    user_id: int

    class Config:
        from_attributes = True


# --- User ---
class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6, max_length=128)
    full_name: Optional[str] = None
    role_codes: List[str] = []
    is_superuser: bool = False
    is_active: bool = True


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    role_codes: Optional[List[str]] = None


class UserOut(BaseModel):
    id: int
    email: EmailStr
    username: str
    is_active: bool
    is_superuser: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    roles: List[RoleOut] = []
    profile: Optional[ProfileOut] = None

    class Config:
        from_attributes = True


# --- Auth ---
class LoginIn(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class AuditLogOut(BaseModel):
    id: int
    username: Optional[str] = None
    action: str
    resource: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
