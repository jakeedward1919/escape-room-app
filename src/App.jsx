import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Escape Room App (Client-only)
 * - Start button + countdown
 * - Remaining time button
 * - Hint: enter hint code -> open hint in a new window (as /?hint=CODE)
 * - Hint usage limit: base 3, admin code can grant +1 repeatedly (bonus)
 * - Admin mode: can add exactly 1 hint per admin session
 * - FREE_HINT_CODES (e.g., E-00) do NOT consume hint uses
 *
 * Note: This is NOT secure if deployed publicly with source exposed.
 */

// ======= Config =======
const DEFAULT_DURATION_MIN = 70; // 1시간 10분
const MAX_HINT_USES = 3;
const FREE_HINT_CODES = new Set(["E-00"]);

// 운영 편의용 관리자 코드(배포 시 바꾸세요)
const ADMIN_CODE = "ADMIN-2026";

// localStorage keys
const LS_HINTS = "escape_hints_v1";
const LS_USES = "escape_hint_uses_v1";
const LS_TIMER = "escape_timer_v1";
const LS_BONUS = "escape_hint_bonus_v1";

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

/** Build a GitHub Pages-safe URL using Vite base URL */
function buildHintUrl(code) {
  const base = import.meta.env.BASE_URL || "/"; // ex) "/escape-room-app/"
  // Ensure base starts/ends with "/"
  const baseNorm = base.startsWith("/") ? base : `/${base}`;
  const baseFinal = baseNorm.endsWith("/") ? baseNorm : `${baseNorm}/`;
  return `${window.location.origin}${baseFinal}?hint=${encodeURIComponent(code)}`;
}

// ======= Hint-only Window UI =======
function HintWindow({ code, hint }) {
  return (
    <div style={hintWindowShell()}>
      <div style={hintWindowCard()}>
        <h1 style={{ margin: 0, fontSize: 16, letterSpacing: 0.2 }}>
          {hint?.title || "힌트"}
        </h1>

        {hint ? (
          <>
            <div
              style={{
                marginTop: 10,
                fontSize: 14,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {hint.body || ""}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#98a2b3" }}>
              이 창은 힌트 전용 창입니다. (코드: {code})
            </div>
          </>
        ) : (
          <div style={{ marginTop: 12, color: "#aab2c5", fontSize: 13 }}>
            유효하지 않은 힌트 코드입니다: <b>{code}</b>
          </div>
        )}

        <button style={hintWindowBtn()} onClick={() => window.close()}>
          닫기
        </button>
      </div>
    </div>
  );
}

// ======= App =======
export default function App() {
  // Hints store
  const [hints, setHints] = useState(() => {
    const saved = safeJsonParse(localStorage.getItem(LS_HINTS), null);
    if (saved && typeof saved === "object") return saved;

    // 초기 기본 힌트(예시) - 운영 시 지우거나 수정
    return {
      "E-00": { title: "튜토리얼", body: "게임을 시작하지" },
      "E-01": {
        title: "힌트 001",
        body: "정전 12분은 '침입'보다 '기록 혼선'에 의미가 있습니다.",
      },
      "E-02": {
        title: "힌트 002",
        body: "CCTV를 '보는 권한'과 '삭제/정책 변경 권한'은 다를 수 있습니다.",
      },
      "E-03": {
        title: "힌트 003",
        body: "출입기록은 ‘기기 로그’와 ‘관제 시스템’이 다를 수 있습니다.",
      },
      "E-04": { title: "힌트 004", body: "정전 구간의 '재부팅' 타이밍을 비교해 보세요." },
      "E-05": { title: "힌트 005", body: "권한 변경은 보통 별도의 감사 로그로 남습니다." },
      "E-06": { title: "힌트 006", body: "같은 시간대 다른 센서 이벤트와의 상관을 확인하세요." },
      "E-07": { title: "힌트 007", body: "현장 행동보다 '기록의 불일치'가 단서일 수 있습니다." },
      "E-08": { title: "힌트 008", body: "삭제된 구간이 아니라 '미기록' 구간인지 구분해야 합니다." },
      "E-09": { title: "힌트 009", body: "로그의 timezone/서버시간 차이를 의심해 보세요." },
      "E-10": { title: "힌트 010", body: "동일 계정의 동시 로그인/세션 수를 확인하세요." },
      "E-11": { title: "힌트 011", body: "백업 정책 변경은 일정/승인 흔적이 남을 수 있습니다." },
      "E-12": { title: "힌트 012", body: "알람 해제/재설정 이벤트가 있으면 그 전후를 확인하세요." },
      "E-13": { title: "힌트 013", body: "‘정상’ 표시가 자동인지 수동인지 확인하세요." },
      "E-14": { title: "힌트 014", body: "문서의 생성 시간과 수정 시간을 분리해서 보세요." },
      "E-15": { title: "힌트 015", body: "카메라별 NTP 동기화 상태가 다를 수 있습니다." },
      "E-16": { title: "힌트 016", body: "스케줄 작업(크론/자동화) 기록을 확인하세요." },
      "E-17": { title: "힌트 017", body: "권한 부여자는 항상 동일하지 않습니다. 결재 라인을 추적해보세요." },
      "E-18": { title: "힌트 018", body: "‘사람이 한 일’과 ‘시스템이 한 일’을 구분해 보세요." },
    };
  });

  // Hint uses (already used count)
  const [hintUses, setHintUses] = useState(() => {
    const saved = Number(localStorage.getItem(LS_USES));
    return Number.isFinite(saved) ? saved : 0;
  });

  // Bonus hint uses (granted by admin login; accumulative)
  const [hintBonus, setHintBonus] = useState(() => {
    const saved = Number(localStorage.getItem(LS_BONUS));
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
  const [adminAddRemaining, setAdminAddRemaining] = useState(0); // admin session add quota

  // Hint input state
  const [hintCodeInput, setHintCodeInput] = useState("");

  // Admin add form
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const intervalRef = useRef(null);

  // Derived limits
  const maxHintUses = MAX_HINT_USES + hintBonus;
  const hintRemaining = maxHintUses - hintUses;

  // ===== Hint-only mode (popup page) =====
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const hintParam = normalizeCode(params.get("hint"));
  const isHintWindow = Boolean(hintParam);
  const hintForWindow = hintParam ? hints[hintParam] : null;

  // Persist hints/uses/bonus
  useEffect(() => {
    localStorage.setItem(LS_HINTS, JSON.stringify(hints));
  }, [hints]);

  useEffect(() => {
    localStorage.setItem(LS_USES, String(hintUses));
  }, [hintUses]);

  useEffect(() => {
    localStorage.setItem(LS_BONUS, String(hintBonus));
  }, [hintBonus]);

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
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
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

  // ✅ Hint open: open same site with ?hint=CODE (no document.write -> avoids white popup)
  function handleUseHint() {
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

    const isFree = FREE_HINT_CODES.has(code);

    if (!isFree) {
      if (hintUses >= maxHintUses) {
        alert(`힌트는 최대 ${maxHintUses}번까지 사용할 수 있습니다.`);
        return;
      }
      setHintUses((x) => x + 1);
    }

    const url = buildHintUrl(code);
    const w = window.open(url, "_blank", "width=520,height=640");
    if (!w) {
      alert(
        "팝업이 차단되어 힌트를 열 수 없습니다.\n\n" +
          "Chrome/Edge: 주소창 오른쪽 팝업 차단 아이콘 → 이 사이트 팝업 허용"
      );
      return;
    }
    try {
      w.opener = null;
    } catch {}
    w.focus();

    setHintCodeInput("");
  }

  function handleAdminLogin() {
    if (adminInput.trim() === ADMIN_CODE) {
      // admin code grants +1 repeatedly
      setHintBonus((b) => b + 1);

      // enter admin mode & allow 1 hint add per session
      setAdminMode(true);
      setAdminAddRemaining(1);

      setAdminInput("");
      alert("관리자 승인: 힌트 사용 가능 횟수 +1");
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
    if (!code) return alert("추가할 힌트 코드를 입력해 주세요.");
    if (!newTitle.trim()) return alert("힌트 제목을 입력해 주세요.");
    if (!newBody.trim()) return alert("힌트 내용을 입력해 주세요.");
    if (hints[code]) return alert("이미 존재하는 힌트 코드입니다. 다른 코드를 사용해 주세요.");

    setHints((prev) => ({ ...prev, [code]: { title: newTitle.trim(), body: newBody.trim() } }));
    setAdminAddRemaining((n) => n - 1);

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

  function handlePopupTest() {
    // open a known hint window without consuming a hint
    const testCode = "E-00";
    const url = buildHintUrl(testCode);
    const w = window.open(url, "_blank", "width=520,height=640");
    if (!w) {
      alert("팝업이 차단되어 테스트 창을 열 수 없습니다. 이 사이트 팝업을 허용해 주세요.");
      return;
    }
    try {
      w.opener = null;
    } catch {}
    w.focus();
  }

  // ===== Render =====
  // ✅ If opened as ?hint=CODE, show hint-only UI
  if (isHintWindow) {
    return <HintWindow code={hintParam} hint={hintForWindow} />;
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        minHeight: "100vh",
        color: "#e6e8ee",
        background:
          "radial-gradient(900px 540px at 18% 12%, rgba(52, 74, 120, 0.14), transparent 60%)," +
          "radial-gradient(800px 520px at 82% 20%, rgba(110, 110, 110, 0.08), transparent 58%)," +
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

          <button style={btnStyleNeutral()} onClick={handlePopupTest} title="팝업(힌트 전용 페이지)이 정상 동작하는지 테스트합니다.">
            팝업 테스트
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "#aab2c5" }}>
              힌트 사용 가능: <b>{Math.max(0, hintRemaining)}</b> / {maxHintUses}
              {hintBonus > 0 ? (
                <span style={{ marginLeft: 8, fontSize: 12, color: "#8fa3c5" }}>(보너스 +{hintBonus})</span>
              ) : null}
            </span>
          </div>
        </div>

        {/* Hint section */}
        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: 0.2 }}>힌트</h2>

          <div style={{ marginBottom: 10, fontSize: 13, color: "#aab2c5" }}>
            힌트는 새 창(팝업)으로 열립니다. 처음 1회만 이 사이트의 팝업을 허용해 주세요. (E-00은 무료)
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={hintCodeInput}
              onChange={(e) => setHintCodeInput(e.target.value)}
              placeholder="힌트 코드 입력 (예: E-00)"
              style={inputStyle()}
            />
            <button onClick={handleUseHint} style={btnStylePrimary(false)}>
              힌트 열기
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#aab2c5" }}>
            - 기본 힌트 사용은 {MAX_HINT_USES}회이며, 관리자 코드 입력 시 +1씩 누적됩니다. <br />
            - 무료 코드: {[...FREE_HINT_CODES].join(", ")} (사용 횟수 차감 없음)
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
                관리자 모드 켜기 (+1)
              </button>
              <div style={{ fontSize: 13, color: "#aab2c5" }}>
                관리자 코드 입력 시마다 힌트 사용 가능 횟수 +1, 그리고 관리자 모드에서 힌트 1개 추가 가능.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="새 힌트 코드 (예: E-19)"
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

                <button onClick={() => setAdminMode(false)} style={btnStyleNeutral()} title="관리자 모드를 종료합니다.">
                  관리자 모드 끄기
                </button>

                <button
                  onClick={() => {
                    const code = prompt("관리자 코드를 다시 입력하면 힌트 사용 +1이 추가됩니다.");
                    if ((code || "").trim() === ADMIN_CODE) {
                      setHintBonus((b) => b + 1);
                      alert("관리자 승인: 힌트 사용 가능 횟수 +1");
                    } else if (code !== null) {
                      alert("관리자 코드가 올바르지 않습니다.");
                    }
                  }}
                  style={btnStyleNeutral()}
                  title="관리자 코드 재입력으로 힌트 사용 가능 횟수를 +1 추가합니다."
                >
                  +1 추가 지급
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
          운영 팁: 팝업이 안 뜨면 주소창 오른쪽 팝업 차단 아이콘에서 이 사이트 팝업을 허용하세요.
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

// ======= Hint window styles =======
function hintWindowShell() {
  return {
    minHeight: "100vh",
    padding: 18,
    background: "#070a10",
    color: "#e7e9ee",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
  };
}

function hintWindowCard() {
  return {
    width: "100%",
    maxWidth: 520,
    background: "rgba(16, 22, 37, 0.92)",
    border: "1px solid rgba(31, 42, 64, 0.9)",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.28)",
  };
}

function hintWindowBtn() {
  return {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #25314b",
    background: "rgba(20, 29, 47, 0.88)",
    color: "#e7e9ee",
    cursor: "pointer",
    fontWeight: 600,
  };
}
