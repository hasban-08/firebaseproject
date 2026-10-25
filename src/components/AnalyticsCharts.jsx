import { useState } from "react";

/**
 * Interactive SVG Area Chart for Attendance Trend (Present vs Late)
 * Zero external ESM/es-toolkit bundler issues, responsive, with hover tooltips.
 */
export function AttendanceTrendChart({ data = [] }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ color: "#94a3b8", fontSize: "13px", padding: "40px 0", textAlign: "center" }}> No attendance data for selected date range.
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padLeft = 34;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    4,
    ...data.map((d) => Math.max(Number(d.Present) || 0, Number(d.Late) || 0, Number(d.Absent) || 0))
  );

  const getX = (i) => data.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (i / (data.length - 1)) * plotW;
  const getY = (val) => padTop + plotH - ((Number(val) || 0) / maxVal) * plotH;

  const presentPoints = data.map((d, i) => `${getX(i)},${getY(d.Present)}`).join(" ");
  const presentArea = `${padLeft},${padTop + plotH} ${presentPoints} ${getX(
    data.length - 1
  )},${padTop + plotH}`;

  const latePoints = data.map((d, i) => `${getX(i)},${getY(d.Late)}`).join(" ");
  const lateArea = `${padLeft},${padTop + plotH} ${latePoints} ${getX(
    data.length - 1
  )},${padTop + plotH}`;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "235px", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="gradLate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid Lines */}
        {yTicks.map((t, idx) => {
          const y = getY(t);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="10"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Area Fills & Polylines */}
        <polygon points={presentArea} fill="url(#gradPresent)" />
        <polyline
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2.5"
          points={presentPoints}
        />

        <polygon points={lateArea} fill="url(#gradLate)" />
        <polyline
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          points={latePoints}
        />

        {/* Data Points & X-Axis Labels */}
        {data.map((d, i) => {
          const x = getX(i);
          const yP = getY(d.Present);
          const yL = getY(d.Late);
          const showLabel =
            data.length <= 10 || i % Math.ceil(data.length / 7) === 0 || i === data.length - 1;
          return (
            <g
              key={d.fullDate || i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={x} cy={yP} r={hoverIdx === i ? 5 : 3.2} fill="#a78bfa" />
              <circle cx={x} cy={yL} r={hoverIdx === i ? 4.5 : 2.8} fill="#fbbf24" />
              {showLabel && (
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                >
                  {d.date}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend + Hover Readout */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "#cbd5e1",
          padding: "0 8px",
        }}
      >
        <div style={{ display: "flex", gap: "14px" }}>
          <span>
            <span style={{ color: "#8b5cf6", fontWeight: 800 }}></span> Present
          </span>
          <span>
            <span style={{ color: "#f59e0b", fontWeight: 800 }}></span> Late (&gt;09:15)
          </span>
        </div>
        {hoverIdx !== null && data[hoverIdx] && (
          <div style={{ color: "#e2e8f0", fontSize: "11.5px" }}>
            <strong>{data[hoverIdx].fullDate || data[hoverIdx].date}</strong>: Present{" "}
            <strong style={{ color: "#a78bfa" }}>{data[hoverIdx].Present}</strong> | Late{" "}
            <strong style={{ color: "#fbbf24" }}>{data[hoverIdx].Late}</strong> | Absent{" "}
            <strong style={{ color: "#f87171" }}>{data[hoverIdx].Absent}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Interactive SVG Grouped Bar Chart for Department Absenteeism & Late Arrivals
 */
export function DepartmentAbsenteeismChart({ data = [] }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ color: "#94a3b8", fontSize: "13px", padding: "40px 0", textAlign: "center" }}> No department records found.
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const padLeft = 34;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    4,
    ...data.map((d) => Math.max(Number(d.absentDays) || 0, Number(d.lateRecords) || 0))
  );

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const groupW = plotW / data.length;
  const barW = Math.min(24, Math.max(10, groupW * 0.28));

  const getY = (val) => padTop + plotH - ((Number(val) || 0) / maxVal) * plotH;
  const getH = (val) => ((Number(val) || 0) / maxVal) * plotH;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "235px", overflow: "visible" }}
      >
        {yTicks.map((t, idx) => {
          const y = getY(t);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="10"
              >
                {t}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const centerX = padLeft + i * groupW + groupW / 2;
          const absH = getH(d.absentDays);
          const lateH = getH(d.lateRecords);
          const absY = getY(d.absentDays);
          const lateY = getY(d.lateRecords);

          return (
            <g
              key={d.department || i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={centerX - barW - 2}
                y={absY}
                width={barW}
                height={Math.max(2, absH)}
                rx="4"
                fill="#ef4444"
                opacity={hoverIdx === i ? 1 : 0.85}
              />
              <rect
                x={centerX + 2}
                y={lateY}
                width={barW}
                height={Math.max(2, lateH)}
                rx="4"
                fill="#f59e0b"
                opacity={hoverIdx === i ? 1 : 0.85}
              />
              <text
                x={centerX}
                y={height - 12}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
              >
                {String(d.department || "Dept").slice(0, 12)}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "#cbd5e1",
          padding: "0 8px",
        }}
      >
        <div style={{ display: "flex", gap: "14px" }}>
          <span>
            <span style={{ color: "#ef4444", fontWeight: 800 }}></span> Absent Days
          </span>
          <span>
            <span style={{ color: "#f59e0b", fontWeight: 800 }}></span> Late Arrivals
          </span>
        </div>
        {hoverIdx !== null && data[hoverIdx] && (
          <div style={{ color: "#e2e8f0", fontSize: "11.5px" }}>
            <strong>{data[hoverIdx].department}</strong>: Absent{" "}
            <strong style={{ color: "#fca5a5" }}>{data[hoverIdx].absentDays}d</strong> | Late{" "}
            <strong style={{ color: "#fbbf24" }}>{data[hoverIdx].lateRecords}</strong> (Staff:{" "}
            {data[hoverIdx].employees})
          </div>
        )}
      </div>
    </div>
  );
}
