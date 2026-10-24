const { verifyRequestUser } = require("./_lib/firebaseAdmin");

/**
 * /api/ai-chat
 * Supports:
 * 1. Tool-assisted HR chat (7 tools: get_headcount, get_attendance_summary, get_late_comers,
 *    get_leave_summary, get_my_leave_balance, get_payroll_summary, search_employees)
 * 2. Dashboard Summarizer (mode = "summarize"): 3-5 bullets strictly from provided numbers
 * 3. Smart Leave Parser (mode = "smart_leave"): Natural language / Roman Urdu -> structured JSON
 * Guardrails:
 * - Server-side GEMINI_API_KEY
 * - 15s timeout (AbortController)
 * - Rate limit: max 20 requests / hour per user (logged in ai_logs)
 * - "AI-generated" label metadata
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const geminiKey =
    process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY || "";

  const { services, user, error } = await verifyRequestUser(req);
  const body = req.body || {};
  const mode = body.mode || "chat";

  // Rate limit check if Admin SDK is active
  if (services && user) {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const logsSnap = await services.db
      .collection("ai_logs")
      .where("uid", "==", user.uid)
      .get();
    const recentCount = logsSnap.docs.filter((d) => {
      const ts = d.data().createdAt?.toDate?.();
      return ts && ts >= oneHourAgo;
    }).length;

    if (recentCount >= 20) {
      return res.status(429).json({
        error: "Rate limit exceeded (max 20 AI requests per hour). Please try again later.",
      });
    }
  }

  // If Admin SDK or Gemini Key is not configured on server, let client hybrid engine handle or use Gemini key
  if (!geminiKey) {
    return res.status(503).json({
      error: "GEMINI_API_KEY_MISSING",
      fallback: true,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const promptText = body.prompt || body.message || "";
    const contextData = body.contextData || {};

    let systemInstruction = `You are WorkPulse AI, an HR & Payroll Assistant.
Company Policies:
- Office Hours: 09:00 AM to 06:00 PM (Mon-Fri), Weekends: Saturday & Sunday.
- Grace Period: 15 minutes (Late after 09:15 AM).
- Half-Day: Working less than 5 hours in a day.
- Leave Quotas: Annual = 14 days, Sick = 8 days, Casual = 10 days, Unpaid = Unlimited. Only working days count (weekends and public holidays are skipped).
- Payroll Formula: Gross = 1.5 x Basic Salary (Basic + 30% HRA + 10% Medical + 10% Conveyance). Per-day rate = Gross / Working Days. Deductions apply for Absent days, Unpaid leave, Half-day (0.5d), and Late penalty (3 lates = 0.5 day), plus progressive FBR Income Tax slabs.
- Understand both English and Roman Urdu naturally.
- Strictly use ONLY the provided tool/context numbers. Never invent numbers.`;

    if (mode === "summarize") {
      systemInstruction = `Summarize the following HR Dashboard metrics into 3 to 5 concise bullet points.
CRITICAL RULE: Use ONLY the exact numbers provided in the JSON context. Do NOT invent or extrapolate any figures. Support English or Roman Urdu if requested.`;
    } else if (mode === "smart_leave") {
      systemInstruction = `Extract a structured leave request JSON from the user's natural language or Roman Urdu text.
Today's date is ${new Date().toISOString().slice(0, 10)}.
Return ONLY valid JSON with keys:
{ "leaveType": "annual" | "sick" | "casual" | "unpaid", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "reason": "string" }`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${promptText}\n\nContext Data (Authoritative Server Data):\n${JSON.stringify(
                  contextData
                )}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
        },
      }),
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Could not generate AI response.";

    if (services && user) {
      await services.db.collection("ai_logs").add({
        uid: user.uid,
        role: user.role,
        mode,
        prompt: promptText.slice(0, 500),
        reply: reply.slice(0, 1000),
        aiGenerated: true,
        createdAt: services.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json({
      ok: true,
      reply,
      aiGenerated: true,
      label: "AI-generated",
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "AI request timed out after 15 seconds." });
    }
    return res.status(500).json({ error: err.message || "AI Assistant error" });
  }
};
