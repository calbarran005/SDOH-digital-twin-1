from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.services.ai_service import chat_with_ai

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


class ChatRequest(BaseModel):
    message: str
    language: str = "es"
    session_id: str | None = Field(default=None, max_length=64)


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
def ai_chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    # Prefijo con el id del usuario para que nadie lea la memoria de otro usuario
    session_id = f"user-{user.id}-{body.session_id}" if body.session_id else None
    reply = chat_with_ai(
        message=body.message,
        language=body.language,
        db_session=db,
        session_id=session_id,
    )
    return ChatResponse(reply=reply)
