import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Escape Room App (Client-only)
 * - Start button + countdown
 * - Remaining time button
 * - Hint button: enter hint code -> open hint in a new window
 * - Hint usage limit: 3
 * - Admin code: enable adding hint codes (limit: 1 add per admin session)
 *
 * Note: This is NOT secure if deployed publicly with source exposed.
 */

// ======= Config =======
const DEFAULT_DURATION_MIN = 90;
const MAX_HINT_USES = 3;

// 운영 편의용 관리자 코드(배포 시 바꾸세요)
const ADMIN_CODE = "ADMIN-2026";

// localStorage keys
const LS_HINTS = "escape_hints_v1";
const LS_USES = "escape_hint_uses_v1";
const LS_TIMER = "escape_timer_v1";

// ======= Helpers =======
function safeJsonParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function normalizeCode(code) {
  return (code || "").trim().toUpperCase();
}

function openHintWindow({ title, body }) {
  // 클릭 이벤트에서 호출되어야 팝업 차단이 덜합니다.
  const w = window.open("", "_blank", "noopener,noreferrer,width=520,height=640");
  if (!w) {
    alert("팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.");
    return;
  }

  const escapedTitle = (title || "HINT").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const escapedBody = (body || "")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br/>");

  // 어두운 미니멀 힌트 창 스타일
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapedTitle}</title>
        <style>
          :root {
            --bg: #0a0d14;
            --card: #101625;
            --border: #1f2a40;
            --text: #e7e9ee;
            --muted: #98a2b3;
            --btn: #141d2f;
            --btnb: #23304a;
          }
          body {
            font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            margin: 0; padding: 18px;
            background: var(--bg);
            color: var(--text);
          }
          .card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 16px;
          }
          h1 { font-size: 16px; margin: 0 0 10px; letter-spacing: 0.2px; }
          .body { font-size: 14px; line-height: 1.65; color: var(--text); }
          .meta { margin-top: 12px; font-size: 12px; color: var(--muted); }
          button {
            margin-top: 14px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid var(--btnb);
            background: var(--btn);
            color: var(--text);
            cursor: pointer;
          }
          button:hover { filter: brightness(1.06); }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${escapedTitle}</h1>
          <div class="body">${escapedBody}</div>
          <div class="meta">이 창은 힌트 전용 창입니다.</div>
          <button onclick="window.close()">닫기</button>
        </div>
      </body>
    </html>
  `);
  w.document.close();
}

// ======= App =======
export default function App() {
  // Hints store
  const [hints, setHints] = useState(() => {
    const saved = safeJsonParse(localStorage.getItem(LS_HINTS), null);
    if (saved && typeof saved === "object") return saved;

    // 초기 기본 힌트(예시) - 운영 시 지우거나 수정
    return {
      "HINT-001": { title: "힌트 001", body: "정전 12분은 '침입'보다 '기록 혼선'에 의미가 있습니다." },
      "HINT-002": { title: "힌트 002", body: "CCTV를 '보는 권한'과 '삭제/정책 변경 권한'은 다를 수 있습니다." },
    };
  });

  // Hint uses
  const [hintUses, setHintUses] = useState(() => {
    const saved = Number(localStorage.getItem(LS_USES));
    return Number.isFinite(saved) ? saved : 0;
  });

  // Timer state
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION_MIN * 60);
  const [running, setRunning] = useState(false);
  const [startAtMs, setStartAtMs] = useState(null); // epoch ms
  const [nowMs, setNowMs] = useState(Date.now());

  // Admin state
  const [adminMode, setAdminMode] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const [adminAddRemaining, setAdminAddRemaining] = useState(0); // ✅ 관리자 모드 진입 시 1로 리셋

  // Hint input state
  const [hintCodeInput, setHintCodeInput] = useState("");

  // Admin add form
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const intervalRef = useRef(null);

  // Persist hints/uses
  useEffect(() => {
    localStorage.setItem(LS_HINTS, JSON.stringify(hints));
  }, [hints]);

  useEffect(() => {
    localStorage.setItem(LS_USES, String(hintUses));
  }, [hintUses]);

  // Load timer from storage on mount
  useEffect(() => {
    const saved = safeJsonParse(localStorage.getItem(LS_TIMER), null);
    if (saved && typeof saved === "object") {
      if (Number.isFinite(saved.durationSec)) setDurationSec(saved.durationSec);
      if (typeof saved.running === "boolean") setRunning(saved.running);
      if (Number.isFinite(saved.startAtMs)) setStartAtMs(saved.startAtMs);
    }
  }, []);

  // Persist timer
  useEffect(() => {
    localStorage.setItem(LS_TIMER, JSON.stringify({ durationSec, running, startAtMs }));
  }, [durationSec, running, startAtMs]);

  // Tick
  useEffect(() => {
    if (running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => setNowMs(Date.now()), 250);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [running]);

  const remainingSec = useMemo(() => {
    if (!running || !startAtMs) return durationSec;
    const elapsedSec = (nowMs - startAtMs) / 1000;
    return Math.max(0, durationSec - elapsedSec);
  }, [running, startAtMs, nowMs, durationSec]);

  // Auto-stop when time up
  useEffect(() => {
    if (running && remainingSec <= 0) {
      setRunning(false);
      alert("시간 종료!");
    }
  }, [running, remainingSec]);

  function handleStart() {
    if (running) return;
    setStartAtMs(Date.now());
    setNowMs(Date.now());
    setRunning(true);
  }

  function handleUseHint() {
    if (hintUses >= MAX_HINT_USES) {
      alert(`힌트는 최대 ${MAX_HINT_USES}번까지 사용할 수 있습니다.`);
      return;
    }

    const code = normalizeCode(hintCodeInput);
    if (!code) {
      alert("힌트 코드를 입력해 주세요.");
      return;
    }

    const hint = hints[code];
    if (!hint) {
      alert("유효하지 않은 힌트 코드입니다.");
      return;
    }

    setHintUses((x) => x + 1);
    openHintWindow({ title: hint.title || code, body: hint.body || "" });
    setHintCodeInput("");
  }

  function handleAdminLogin() {
    if (adminInput.trim() === ADMIN_CODE) {
      setAdminMode(true);
      setAdminAddRemaining(1); // ✅ 관리자 모드 진입 시 힌트 추가 1회 허용
      setAdminInput("");
    } else {
      alert("관리자 코드가 올바르지 않습니다.");
    }
  }

  function handleAddHint() {
    if (!adminMode) return;

    if (adminAddRemaining <= 0) {
      alert("관리자 모드에서 힌트 추가는 1회만 가능합니다.");
      return;
    }

    const code = normalizeCode(newCode);
    if (!code) {
      alert("추가할 힌트 코드를 입력해 주세요.");
      return;
    }
    if (!newTitle.trim()) {
      alert("힌트 제목을 입력해 주세요.");
      return;
    }
    if (!newBody.trim()) {
      alert("힌트 내용을 입력해 주세요.");
      return;
    }
    if (hints[code]) {
      alert("이미 존재하는 힌트 코드입니다. 다른 코드를 사용해 주세요.");
      return;
    }

    setHints((prev) => ({
      ...prev,
      [code]: { title: newTitle.trim(), body: newBody.trim() },
    }));

    setAdminAddRemaining((n) => n - 1); // ✅ 1회 차감

    setNewCode("");
    setNewTitle("");
    setNewBody("");
  }

  function handleDeleteHint(code) {
    if (!adminMode) return;
    if (!confirm(`힌트 코드 ${code}를 삭제할까요?`)) return;
    setHints((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }

  const hintRemaining = MAX_HINT_USES - hintUses;

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        minHeight: "100vh",
        color: "#e6e8ee",
        // ✅ 어두운 미니멀 배경
        background:
          "radial-gradient(900px 540px at 18% 12%, rgba(52, 74, 120, 0.16), transparent 60%)," +
          "radial-gradient(800px 520px at 82% 20%, rgba(110, 110, 110, 0.10), transparent 58%)," +
          "linear-gradient(180deg, #070a10 0%, #0b0f19 55%, #070a10 100%)",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 20 }}>
        <h1 style={{ margin: "8px 0 16px", letterSpacing: 0.2 }}>방탈출 운영 앱</h1>

        {/* Top controls */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <button
            onClick={handleStart}
            style={btnStylePrimary(running)}
            disabled={running}
            title={running ? "이미 진행 중입니다." : "타이머 시작"}
          >
            시작
          </button>

          <button
            style={btnStyleNeutral()}
            onClick={() => alert(`남은 시간: ${formatTime(remainingSec)}`)}
            title="남은 시간을 확인합니다."
          >
            남은 시간: <b>{formatTime(remainingSec)}</b>
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#aab2c5" }}>
              힌트 사용 가능: <b>{hintRemaining}</b> / {MAX_HINT_USES}
            </span>
          </div>
        </div>

        {/* Hint section */}
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: 0.2 }}>힌트</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={hintCodeInput}
              onChange={(e) => setHintCodeInput(e.target.value)}
              placeholder="힌트 코드 입력 (예: HINT-001)"
              style={inputStyle()}
            />
            <button onClick={handleUseHint} style={btnStylePrimary(false)}>
              힌트 열기
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: "#aab2c5" }}>
            - 유효한 코드를 입력하면 새 창으로 힌트가 표시됩니다. <br />
            - 힌트 사용은 최대 {MAX_HINT_USES}회로 제한됩니다.
          </div>
        </div>

        {/* Admin section */}
        <div style={{ ...cardStyle(), marginTop: 14 }}>
          <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: 0.2 }}>관리자</h2>

          {!adminMode ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="password"
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
                placeholder="관리자 코드 입력"
                style={inputStyle()}
              />
              <button onClick={handleAdminLogin} style={btnStyleNeutral()}>
                관리자 모드 켜기
              </button>
              <div style={{ fontSize: 13, color: "#aab2c5" }}>
                관리자 모드에서 힌트 코드를 1개만 추가할 수 있습니다.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="새 힌트 코드 (예: HINT-003)"
                  style={inputStyle()}
                />
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="힌트 제목"
                  style={inputStyle()}
                />
              </div>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="힌트 내용(여러 줄 가능)"
                style={textareaStyle()}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={handleAddHint}
                  style={btnStylePrimary(adminAddRemaining <= 0)}
                  disabled={adminAddRemaining <= 0}
                  title={adminAddRemaining <= 0 ? "관리자 모드에서 힌트 추가는 1회만 가능합니다." : "힌트를 추가합니다."}
                >
                  힌트 코드 추가 ({adminAddRemaining}/1)
                </button>
                <button
                  onClick={() => setAdminMode(false)}
                  style={btnStyleNeutral()}
                  title="관리자 모드를 종료합니다."
                >
                  관리자 모드 끄기
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: "10px 0", fontSize: 15, color: "#cfd5e4" }}>
                  등록된 힌트 코드 ({Object.keys(hints).length})
                </h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {Object.entries(hints)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code, h]) => (
                      <div key={code} style={hintRowStyle()}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{code}</div>
                          <div style={{ fontSize: 13, color: "#aab2c5" }}>{h.title}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteHint(code)}
                          style={btnStyleDangerSmall()}
                          title="이 힌트를 삭제합니다."
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "#7f8aa6" }}>
          운영 팁: 팝업 차단이 있으면 “힌트 열기” 클릭 시 새 창이 막힐 수 있습니다. 브라우저에서 팝업 허용 후 사용하세요.
        </div>
      </div>
    </div>
  );
}

// ======= Styles =======
function cardStyle() {
  return {
    background: "rgba(16, 22, 37, 0.92)",
    border: "1px solid rgba(31, 42, 64, 0.9)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
    backdropFilter: "blur(6px)",
  };
}

function inputStyle() {
  return {
    width: 320,
    maxWidth: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #25314b",
    background: "rgba(12, 18, 32, 0.9)",
    color: "#e6e8ee",
    outline: "none",
  };
}

function textareaStyle() {
  return {
    width: "100%",
    minHeight: 110,
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #25314b",
    background: "rgba(12, 18, 32, 0.9)",
    color: "#e6e8ee",
    outline: "none",
    resize: "vertical",
    lineHeight: 1.5,
  };
}

function btnStylePrimary(disabled) {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #25314b",
    background: disabled ? "rgba(20, 29, 47, 0.55)" : "rgba(25, 45, 84, 0.9)",
    color: "#e6e8ee",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
  };
}

function btnStyleNeutral() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #25314b",
    background: "rgba(20, 29, 47, 0.88)",
    color: "#e6e8ee",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function btnStyleDangerSmall() {
  return {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(93, 45, 45, 0.95)",
    background: "rgba(58, 23, 23, 0.95)",
    color: "#ffd7d7",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  };
}

function hintRowStyle() {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(31, 42, 64, 0.95)",
    background: "rgba(12, 18, 32, 0.85)",
  };
}
