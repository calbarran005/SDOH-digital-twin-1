import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, X, Send, Bot, Trash2 } from "lucide-react";
import api from "../api/client";
import { useLanguage } from "../store/language";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIChat() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post("/ai/chat", { message: text, language });
      setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("ai.error") }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <>
      {!open && (
        <button
          className="ai-chat-fab"
          onClick={() => setOpen(true)}
          title={t("ai.openChat")}
        >
          <Sparkles size={22} />
        </button>
      )}

      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <h3>
              <Bot size={18} style={{ color: "#60a5fa" }} />
              {t("ai.title")}
            </h3>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="btn btn-sm secondary"
                onClick={clearChat}
                title={t("ai.clearChat")}
                style={{ padding: "4px 8px" }}
              >
                <Trash2 size={14} />
              </button>
              <button
                className="btn btn-sm secondary"
                onClick={() => setOpen(false)}
                title={t("ai.closeChat")}
                style={{ padding: "4px 8px" }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <div className="ai-msg assistant">{t("ai.welcome")}</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="ai-msg thinking">{t("ai.thinking")}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("ai.placeholder")}
              disabled={loading}
            />
            <button onClick={send} disabled={loading || !input.trim()}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
