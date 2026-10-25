import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "../firebase";
import {
  askHrAiAssistant,
  parseSmartLeavePrompt,
  applyForLeave,
} from "../services/hrServer";
import { getLocalDateStr } from "../utils/attendanceHelpers";

const QUICK_CHIPS = [
  { label: "Today's Attendance", prompt: "Who is present and late today?" },
  { label: "My Leave Balance", prompt: "What is my remaining leave balance?" },
  { label: "Salary & Tax Summary", prompt: "Show my salary and payroll tax summary" },
  { label: "Audit Trail Logs", prompt: "Show recent audit trail logs" },
  { label: "HR & Payroll Policy", prompt: "What is the company grace period, half-day, and payroll tax policy?" },
  { label: "Server Time & Date", prompt: "What is the current server time and date?" },
];

function formatRichText(text) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
    return (
      <div key={i} style={{ minHeight: line.trim() === "" ? "8px" : "auto" }}>
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={j} style={{ color: "#f8fafc", fontWeight: 700 }}>
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={j}
                style={{
                  background: "rgba(139, 92, 246, 0.22)",
                  color: "#ddd6fe",
                  padding: "1px 6px",
                  borderRadius: "5px",
                  fontSize: "11.5px",
                  fontFamily: "monospace",
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={j}>{part}</span>;
        })}
      </div>
    );
  });
}

function FloatingChatWidget() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customGeminiKey, setCustomGeminiKey] = useState(
    () => localStorage.getItem("workpulse_gemini_api_key") || ""
  );

  const [liveStats, setLiveStats] = useState({
    presentToday: 0,
    lateToday: 0,
    pendingLeaves: 0,
    liveClock: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Welcome! I am your **Real-Time HR & Payroll AI Assistant**.\n\nI am connected to live Firestore data (`attendance`, `leaves`, `payroll`, `audit_logs`, `employees`). Ask me anything about your workforce, attendance, leave balances, salary calculations, or company policies.",
      toolsUsed: ["live_realtime_stream"],
      actions: [
        { label: "Mark Attendance", path: "/mark-attendance" },
        { label: "Audit Trail", path: "/audit-logs" },
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      label: "Real-Time AI",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [smartLeaveDraft, setSmartLeaveDraft] = useState(null);
  const [applyingLeave, setApplyingLeave] = useState(false);
  const messagesEndRef = useRef(null);
  const prevPresentRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveStats((prev) => ({
        ...prev,
        liveClock: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const todayStr = getLocalDateStr();

    const attQuery = query(collection(db, "attendance"), where("date", "==", todayStr));
    const unsubAtt = onSnapshot(
      attQuery,
      (snap) => {
        const docs = snap.docs.map((d) => d.data());
        const presentCount = docs.length;
        const lateCount = docs.filter(
          (r) => r.status === "late" || r.status === "extreme-late"
        ).length;

        setLiveStats((prev) => ({
          ...prev,
          presentToday: presentCount,
          lateToday: lateCount,
        }));

        if (prevPresentRef.current !== null && presentCount > prevPresentRef.current) {
          const newest = docs[docs.length - 1];
          if (newest) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                text: `**Real-Time Live Update**: **${newest.name || "An employee"}** just checked in (Status: **${(newest.status || "present").toUpperCase()}**). Total present today: **${presentCount}**.`,
                toolsUsed: ["onSnapshot_attendance"],
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                label: "Live Stream",
              },
            ]);
            if (!isOpen) {
              setUnreadCount((c) => c + 1);
            }
          }
        }
        prevPresentRef.current = presentCount;
      },
      () => {}
    );

    const leaveQuery = query(
      collection(db, "leaveRequests"),
      where("status", "==", "pending")
    );
    const unsubLeave = onSnapshot(
      leaveQuery,
      (snap) => {
        setLiveStats((prev) => ({
          ...prev,
          pendingLeaves: snap.size,
        }));
      },
      () => {}
    );

    return () => {
      unsubAtt();
      unsubLeave();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    }
  }, [messages, isOpen, loading]);

  const handleSend = async (customPrompt = null) => {
    const text = String(customPrompt ?? input).trim();
    if (!text || loading) return;

    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const userMsg = { role: "user", text, timestamp: nowTime };
    setMessages((prev) => [...prev, userMsg]);
    if (customPrompt === null) setInput("");
    setLoading(true);
    setSmartLeaveDraft(null);

    try {
      const lower = text.toLowerCase();
      const looksLikeSmartLeave =
        (lower.includes("need leave") ||
          lower.includes("apply leave") ||
          lower.includes("request leave") ||
          lower.includes("take off") ||
          lower.includes("sick tomorrow")) &&
        !lower.includes("balance");

      if (looksLikeSmartLeave) {
        const parsed = await parseSmartLeavePrompt(text);
        setSmartLeaveDraft(parsed);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `**Smart Leave AI Parser**:\nI have prepared your structured leave request:\n- **Leave Type**: **${parsed.leaveType.toUpperCase()}**\n- **Start Date**: **${parsed.startDate}**\n- **End Date**: **${parsed.endDate}**\n- **Reason**: "${parsed.reason}"\n\nClick the button below to submit immediately or open the Leave Request page:`,
            toolsUsed: ["smart_leave_parser"],
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            label: "Smart Leave AI",
          },
        ]);
      } else {
        const res = await askHrAiAssistant({
          message: text,
          mode: "chat",
          history: messages,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: res.reply,
            toolsUsed: res.toolsUsed || [],
            actions: res.actions || [],
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            label: res.label || "Real-Time AI",
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Notice: ${err.message || "Could not process request."}`,
          toolsUsed: [],
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          label: "System",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSmartLeave = async () => {
    if (!smartLeaveDraft || applyingLeave) return;
    setApplyingLeave(true);
    try {
      const res = await applyForLeave({
        leaveType: smartLeaveDraft.leaveType,
        startDate: smartLeaveDraft.startDate,
        endDate: smartLeaveDraft.endDate,
        reason: smartLeaveDraft.reason,
      });
      setSmartLeaveDraft(null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `**Leave Submitted Successfully!**\nYour **${smartLeaveDraft.leaveType.toUpperCase()}** leave (**${res.workingDays}** working day(s): ${smartLeaveDraft.startDate} to ${smartLeaveDraft.endDate}) has been sent for HR approval and recorded in the Audit Trail.`,
          toolsUsed: ["applyForLeave", "recordAuditLog"],
          actions: [{ label: "View My Leaves", path: "/leave-request" }],
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          label: "Live Action",
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `**Leave Validation Error**: ${err.message}`,
          toolsUsed: ["applyForLeave"],
          actions: [{ label: "Open Leave Form", path: "/leave-request" }],
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          label: "Validation",
        },
      ]);
    } finally {
      setApplyingLeave(false);
    }
  };

  const saveGeminiKey = () => {
    if (customGeminiKey.trim()) {
      localStorage.setItem("workpulse_gemini_api_key", customGeminiKey.trim());
    } else {
      localStorage.removeItem("workpulse_gemini_api_key");
    }
    setShowKeyModal(false);
  };

  if (location.pathname === "/login" || location.pathname === "/setup") {
    return null;
  }

  return (
    <>
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "92px",
            right: "24px",
            width: isExpanded ? "min(620px, calc(100vw - 32px))" : "min(410px, calc(100vw - 32px))",
            height: isExpanded ? "min(78vh, 720px)" : "min(560px, calc(100vh - 130px))",
            background: "rgba(13, 17, 28, 0.97)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            borderRadius: "20px",
            boxShadow: "0 24px 64px rgba(0, 0, 0, 0.75), 0 0 32px rgba(124, 58, 237, 0.25)",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            overflow: "hidden",
            color: "#f8fafc",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              background: "linear-gradient(135deg, rgba(124, 58, 237, 0.28), rgba(30, 41, 59, 0.95))",
              borderBottom: "1px solid rgba(255, 255, 255, 0.09)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #8b5cf6, #4f46e5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#fff",
                  boxShadow: "0 4px 14px rgba(124, 58, 237, 0.45)",
                  position: "relative",
                }}
              > AI
                <span
                  style={{
                    position: "absolute",
                    bottom: "-2px",
                    right: "-2px",
                    width: "11px",
                    height: "11px",
                    borderRadius: "50%",
                    background: "#10b981",
                    border: "2px solid #09090b",
                  }}
                />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "14.5px", color: "#fff" }}> WorkPulse Live AI
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      borderRadius: "999px",
                      background: "rgba(16, 185, 129, 0.2)",
                      color: "#6ee7b7",
                      fontWeight: 700,
                    }}
                  > REAL-TIME
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "2px" }}> Present: <strong>{liveStats.presentToday}</strong> | Late:{" "}
                  <strong>{liveStats.lateToday}</strong> | Pending Leaves:{" "}
                  <strong>{liveStats.pendingLeaves}</strong> | {liveStats.liveClock}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                title="Configure Optional Gemini Key"
                onClick={() => setShowKeyModal((v) => !v)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#cbd5e1",
                  borderRadius: "8px",
                  padding: "5px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              > API Key
              </button>
              <button
                type="button"
                title={isExpanded ? "Compact Size" : "Expand Size"}
                onClick={() => setIsExpanded((v) => !v)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#cbd5e1",
                  borderRadius: "8px",
                  padding: "5px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                {isExpanded ? "Min" : "Max"}
              </button>
              <button
                type="button"
                title="Close Chat"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "rgba(239, 68, 68, 0.18)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "#fca5a5",
                  borderRadius: "8px",
                  padding: "5px 9px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              > X
              </button>
            </div>
          </div>

          {showKeyModal && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(15, 23, 42, 0.95)",
                borderBottom: "1px solid rgba(139, 92, 246, 0.3)",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "11.5px", color: "#cbd5e1" }}>
                <strong>Optional Gemini 2.0 Flash Key</strong> (Built-in Real-Time Firestore Engine works automatically without a key):
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="password"
                  value={customGeminiKey}
                  onChange={(e) => setCustomGeminiKey(e.target.value)}
                  placeholder="Paste AIzaSy... Gemini API key (optional)"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: "7px",
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "#09090b",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <button
                  type="button"
                  onClick={saveGeminiKey}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "7px",
                    border: "none",
                    background: "#7c3aed",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                > Save
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              padding: "8px 12px",
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(9, 9, 11, 0.55)",
            }}
          >
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleSend(chip.prompt)}
                style={{
                  whiteSpace: "nowrap",
                  padding: "5px 10px",
                  borderRadius: "999px",
                  border: "1px solid rgba(139, 92, 246, 0.32)",
                  background: "rgba(124, 58, 237, 0.14)",
                  color: "#ddd6fe",
                  fontSize: "11.5px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div
            style={{
              flex: 1,
              padding: "14px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background:
                    m.role === "user"
                      ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                      : "rgba(30, 41, 59, 0.92)",
                  border:
                    m.role === "user"
                      ? "none"
                      : "1px solid rgba(255, 255, 255, 0.09)",
                  borderRadius:
                    m.role === "user"
                      ? "16px 16px 4px 16px"
                      : "16px 16px 16px 4px",
                  padding: "11px 14px",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  color: "#f1f5f9",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                }}
              >
                {m.role === "assistant" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px",
                      flexWrap: "wrap",
                      marginBottom: "6px",
                    }}
                  >
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 7px",
                          borderRadius: "999px",
                          background: "rgba(139, 92, 246, 0.25)",
                          color: "#c4b5fd",
                          fontWeight: 700,
                        }}
                      >
                        {m.label || "AI-generated"}
                      </span>
                      {m.toolsUsed?.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "999px",
                            background: "rgba(16, 185, 129, 0.16)",
                            color: "#6ee7b7",
                            fontFamily: "monospace",
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    {m.timestamp && (
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                        {m.timestamp}
                      </span>
                    )}
                  </div>
                )}

                <div>{formatRichText(m.text)}</div>

                {m.actions && m.actions.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      marginTop: "9px",
                      paddingTop: "8px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {m.actions.map((act) => (
                      <button
                        key={act.path + act.label}
                        type="button"
                        onClick={() => navigate(act.path)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "7px",
                          border: "1px solid rgba(139, 92, 246, 0.45)",
                          background: "rgba(124, 58, 237, 0.2)",
                          color: "#e9d5ff",
                          fontSize: "11.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {smartLeaveDraft && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#a7f3d0", fontWeight: 700 }}> Confirm Smart Leave Submission
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={applyingLeave}
                    onClick={handleConfirmSmartLeave}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#10b981",
                      color: "#052e16",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {applyingLeave ? "Submitting..." : "Submit Leave Now"}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/leave-request")}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "transparent",
                      color: "#e2e8f0",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  > Open Leave Form
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: "rgba(30, 41, 59, 0.85)",
                  borderRadius: "12px",
                  padding: "9px 14px",
                  fontSize: "12px",
                  color: "#c4b5fd",
                }}
              > Querying live Firestore and generating response...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(9, 9, 11, 0.9)",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about attendance, leaves, salary, policies..."
              style={{
                flex: 1,
                padding: "10px 13px",
                borderRadius: "11px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "rgba(24, 24, 34, 0.95)",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                padding: "10px 16px",
                borderRadius: "11px",
                border: "none",
                background:
                  loading || !input.trim()
                    ? "rgba(124, 58, 237, 0.4)"
                    : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "13px",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              }}
            > Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setUnreadCount(0);
        }}
        title="Open Real-Time Project AI Chatbot"
        style={{
          position: "fixed",
          bottom: "22px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: isOpen ? "12px 16px" : "12px 18px",
          borderRadius: "999px",
          border: "1px solid rgba(167, 139, 250, 0.5)",
          background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
          color: "#ffffff",
          boxShadow: "0 12px 32px rgba(124, 58, 237, 0.55), 0 0 0 4px rgba(124, 58, 237, 0.18)",
          cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: "14px",
          transition: "all 0.2s ease",
        }}
      >
        <span>{isOpen ? "Close AI" : "Live AI Chat"}</span>
        <span
          style={{
            width: "9px",
            height: "9px",
            borderRadius: "50%",
            background: "#34d399",
            boxShadow: "0 0 8px #34d399",
          }}
        />
        {!isOpen && unreadCount > 0 && (
          <span
            style={{
              background: "#ef4444",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 800,
              padding: "1px 6px",
              borderRadius: "999px",
              marginLeft: "2px",
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>
    </>
  );
}

export default FloatingChatWidget;
