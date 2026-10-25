import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { askHrAiAssistant } from "../services/hrServer";

const SAMPLE_PROMPTS = [
  "Who is present and late today?",
  "What is my remaining leave balance?",
  "What is the company grace period, half-day, and payroll tax policy?",
  "Calculate tax and net salary for basic salary 95000",
  "Show payroll summary for this month",
  "Show recent audit trail logs",
];

function AiAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Welcome! I am your **WorkPulse HR & Payroll AI Assistant**.\n\nI can answer questions using live server tools (`get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`) and company policy rules.",
      toolsUsed: [],
      aiGenerated: true,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendPrompt = async (promptText) => {
    const text = (promptText ?? input).trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await askHrAiAssistant({ message: text, mode: "chat", history: messages });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.reply,
          toolsUsed: res.toolsUsed || [],
          actions: res.actions || [],
          aiGenerated: true,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Error: ${err.message || "AI request failed."}`,
          toolsUsed: [],
          aiGenerated: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#f8fafc",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(15, 23, 42, 0.9)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #8b5cf6, #4f46e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 800,
            }}
          > AI
          </div>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}> WorkPulse AI Assistant (Gemini Tool-Calling)
            </h1>
            <span style={{ fontSize: "12px", color: "#a78bfa" }}> Role-Scoped HR Tools | Policy Q&A | 20 req/hr Guardrail
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 14px",
            borderRadius: "9px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.05)",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
        > Back to Dashboard
        </button>
      </header>

      <div
        style={{
          maxWidth: "940px",
          width: "100%",
          margin: "0 auto",
          padding: "20px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => sendPrompt(p)}
              style={{
                padding: "7px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(139, 92, 246, 0.35)",
                background: "rgba(124, 58, 237, 0.12)",
                color: "#ddd6fe",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            background: "rgba(15, 23, 42, 0.78)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            maxHeight: "62vh",
            overflowY: "auto",
          }}
        >
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
                background:
                  m.role === "user"
                    ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                    : "rgba(30, 41, 59, 0.9)",
                border:
                  m.role === "user"
                    ? "none"
                    : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "14px",
                padding: "13px 16px",
                fontSize: "13.5px",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.role === "assistant" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10.5px",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(139, 92, 246, 0.25)",
                      color: "#c4b5fd",
                      fontWeight: 700,
                    }}
                  > AI-generated
                  </span>
                  {m.toolsUsed?.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: "10.5px",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: "rgba(16, 185, 129, 0.18)",
                        color: "#6ee7b7",
                        fontFamily: "monospace",
                      }}
                    >
                      {t}()
                    </span>
                  ))}
                </div>
              )}
              <div>{m.text}</div>
            </div>
          ))}
          {loading && (
            <div style={{ color: "#a78bfa", fontSize: "13px" }}> Running HR tools and generating response (15s timeout active)...
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt();
          }}
          style={{ display: "flex", gap: "10px" }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about attendance, leave balances, payroll, or company policies..."
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(15, 23, 42, 0.9)",
              color: "#fff",
              fontSize: "14px",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 24px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          > Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default AiAssistant;
