from datetime import datetime

from sqlalchemy.orm import Session

from app.models.user import AuditLog, User


def audit(
    db: Session,
    user: User,
    action: str,
    resource: str = None,
    resource_id: str = None,
    detail: str = None,
    ip_address: str = None,
):
    log = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else None,
        action=action,
        resource=resource,
        resource_id=str(resource_id) if resource_id is not None else None,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(log)
    db.commit()
