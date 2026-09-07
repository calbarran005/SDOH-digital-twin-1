from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.services.ai_service import chat_with_ai

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


class ChatRequest(BaseModel):
    message: str
    language: str = "es"


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
def ai_chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    reply = chat_with_ai(
        message=body.message,
        language=body.language,
        db_session=db,
    )
    return ChatResponse(reply=reply)
