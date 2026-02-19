import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, deleteField, updateDoc } from "firebase/firestore";

const CAMPUSES = [
  "Lemley Memorial", "Broken Arrow", "Owasso", "Peoria",
  "Riverside", "Sand Springs", "Health Sciences Center",
];
const SESSIONS = ["AM", "PM", "All Day"];
const TABS = [
  "Submit Steps", "Campus Average", "Highest Steps",
  "Highest Steps AM", "Highest Steps PM", "Highest Steps All Day", "Admin",
];

const ADMIN_USER = "Student Advisory";
const ADMIN_PASS = "Hello.com";

function todayStr() { return new Date().toISOString().split("T")[0]; }
function minDateStr() { return "2026-01-01"; }
function maxDateStr() { return "2026-12-31"; }

// ─── Firebase helpers ──────────────────────────────────────────────────────
// All student records live in a single Firestore document: "data/students"
// Structure: { [studentId]: { name, campus, session, totalSteps, submittedDates[], dailyScreenshots:{} } }

const DATA_REF = () => doc(db, "data", "students");

async function loadData() {
  try {
    const snap = await getDoc(DATA_REF());
    return { students: snap.exists() ? snap.data() : {} };
  } catch (e) {
    console.error("Firebase load error:", e);
    return { students: {} };
  }
}

async function saveStudents(students) {
  try {
    await setDoc(DATA_REF(), students);
  } catch (e) {
    console.error("Firebase save error:", e);
  }
}

// ─── Loader ────────────────────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:"3rem" }}>
      <div className="spinner" />
    </div>
  );
}

// ─── Medal ─────────────────────────────────────────────────────────────────
function MedalIcon({ rank }) {
  if (rank > 3) return <span style={{ color:"#888", fontFamily:"monospace", fontSize:"0.9rem" }}>#{rank}</span>;
  return <span style={{ fontSize:"1.4rem" }}>{rank===1?"🥇":rank===2?"🥈":"🥉"}</span>;
}

// ─── Leaderboard ───────────────────────────────────────────────────────────
function LeaderboardTable({ title, students, filter, groupBy }) {
  if (groupBy === "campus") {
    const campusMap = {};
    Object.values(students).forEach(s => {
      if (!campusMap[s.campus]) campusMap[s.campus] = { total:0, count:0 };
      campusMap[s.campus].total += s.totalSteps;
      campusMap[s.campus].count += 1;
    });

    const allStudents = Object.values(students);
    const globalMean = allStudents.length
      ? allStudents.reduce((sum, s) => sum + s.totalSteps, 0) / allStudents.length
      : 0;
    const campusEntries = Object.values(campusMap);
    const avgCampusSize = campusEntries.length
      ? campusEntries.reduce((sum, c) => sum + c.count, 0) / campusEntries.length
      : 1;
    const C = Math.max(1, Math.round(avgCampusSize));

    const rows = Object.entries(campusMap)
      .map(([campus, { total, count }]) => ({
        campus,
        avg: Math.round((C * globalMean + total) / (C + count)),
        rawAvg: Math.round(total / count),
        count,
      }))
      .sort((a, b) => b.avg - a.avg);

    if (!rows.length) return <div className="empty-state"><span>🏃</span><p>No data yet. Be the first to submit!</p></div>;
    return (
      <div className="leaderboard-wrap">
        <h2 className="lb-title">{title}</h2>
        <p style={{ color:"var(--muted)", fontSize:"0.8rem", marginBottom:"1.25rem", marginTop:"-0.75rem" }}>
          Ranked by Bayesian average — protects small campuses from outliers while fairly rewarding consistent effort.
        </p>
        <table className="lb-table">
          <thead><tr><th>Rank</th><th>Campus</th><th>Score</th><th>Raw Avg</th><th>Students</th></tr></thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={r.campus} className={i<3?`top-${i+1}`:""}>
                <td><MedalIcon rank={i+1}/></td>
                <td>{r.campus}</td>
                <td className="steps-cell">{r.avg.toLocaleString()}</td>
                <td style={{ color:"var(--muted)", fontSize:"0.85rem" }}>{r.rawAvg.toLocaleString()}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = Object.entries(students)
    .filter(([,s]) => !filter || s.session === filter)
    .map(([id,s]) => ({ id, ...s }))
    .sort((a,b) => b.totalSteps - a.totalSteps)
    .slice(0,10);
  if (!rows.length) return <div className="empty-state"><span>🏃</span><p>No data yet. Be the first to submit!</p></div>;
  return (
    <div className="leaderboard-wrap">
      <h2 className="lb-title">{title}</h2>
      <table className="lb-table">
        <thead><tr><th>Rank</th><th>Name</th><th>Campus</th><th>Session</th><th>Total Steps</th></tr></thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={r.id} className={i<3?`top-${i+1}`:""}>
              <td><MedalIcon rank={i+1}/></td>
              <td>{r.name}</td>
              <td>{r.campus}</td>
              <td><span className={`badge badge-${r.session.replace(" ","")}`}>{r.session}</span></td>
              <td className="steps-cell">{r.totalSteps.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Admin Login ───────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  function attempt() {
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      onLogin();
    } else {
      setErr("Incorrect username or password.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className={`admin-login-box ${shake ? "shake" : ""}`}>
        <div style={{ fontSize:"2.5rem", marginBottom:"0.75rem" }}>🔒</div>
        <h2 className="admin-login-title">Admin Access</h2>
        <p className="admin-login-sub">This area is restricted to administrators only.</p>
        {err && <div className="error-banner" style={{ marginBottom:"1rem" }}>⚠️ {err}</div>}
        <div className="field" style={{ marginBottom:"1rem" }}>
          <label>Username</label>
          <input type="text" value={u} onChange={e => { setU(e.target.value); setErr(""); }} placeholder="Enter username" autoComplete="off" />
        </div>
        <div className="field" style={{ marginBottom:"1.5rem" }}>
          <label>Password</label>
          <input type="password" value={p} onChange={e => { setP(e.target.value); setErr(""); }} placeholder="Enter password" onKeyDown={e => e.key === "Enter" && attempt()} />
        </div>
        <button onClick={attempt} className="submit-btn">Sign In 🔓</button>
      </div>
    </div>
  );
}

// ─── Admin Panel ───────────────────────────────────────────────────────────
function AdminPanel({ students, onDelete, onDeleteDay, onLogout }) {
  const [search, setSearch]         = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [confirmId, setConfirmId]   = useState(null);
  const [confirmDay, setConfirmDay] = useState(null);
  const [deleted, setDeleted]       = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [lightbox, setLightbox]     = useState(null);

  const list = Object.entries(students)
    .map(([id, s]) => ({ id, ...s }))
    .filter(s => {
      const matchesSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.campus.toLowerCase().includes(search.toLowerCase());
      const matchesDate = !dateFilter || (s.submittedDates && s.submittedDates.includes(dateFilter));
      return matchesSearch && matchesDate;
    })
    .sort((a, b) => {
      const latestA = a.submittedDates?.length ? [...a.submittedDates].sort().reverse()[0] : "";
      const latestB = b.submittedDates?.length ? [...b.submittedDates].sort().reverse()[0] : "";
      return latestB.localeCompare(latestA);
    });

  async function handleDelete(id) {
    const name = students[id]?.name || id;
    await onDelete(id);
    setConfirmId(null); setExpanded(null);
    setDeleted(`"${name}" has been removed successfully.`);
    setTimeout(() => setDeleted(""), 4000);
  }

  async function handleDayDelete(studentId, date) {
    const entry = students[studentId]?.dailyScreenshots?.[date];
    const steps = entry?.steps || 0;
    await onDeleteDay(studentId, date);
    setConfirmDay(null);
    setDeleted(`Day ${date} (${steps.toLocaleString()} steps) removed. Total updated.`);
    setTimeout(() => setDeleted(""), 4000);
  }

  return (
    <div>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:1000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"1.5rem", cursor:"pointer" }}>
          <div style={{ color:"var(--muted)", fontSize:"0.8rem", marginBottom:"0.75rem" }}>
            📅 {lightbox.date} &nbsp;·&nbsp; 👟 {lightbox.steps.toLocaleString()} steps &nbsp;·&nbsp; <em>Click anywhere to close</em>
          </div>
          <img src={lightbox.img} alt="Proof screenshot" style={{ maxWidth:"90vw", maxHeight:"80vh", borderRadius:"12px", border:"2px solid var(--border)", objectFit:"contain" }} onClick={e => e.stopPropagation()} />
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem", flexWrap:"wrap", gap:"1rem" }}>
        <h2 className="lb-title" style={{ marginBottom:0 }}>🛡️ Admin Panel</h2>
        <button onClick={onLogout} className="logout-btn">Sign Out</button>
      </div>

      <div className="admin-info-bar">
        <span>👤 Logged in as <strong>Student Advisory</strong></span>
        <span>📋 {Object.keys(students).length} total student{Object.keys(students).length !== 1 ? "s" : ""}</span>
      </div>

      {deleted && <div className="success-banner" style={{ marginBottom:"1.25rem" }}>✅ {deleted}</div>}

      <div style={{ display:"flex", gap:"1rem", marginBottom:"1.25rem", flexWrap:"wrap" }}>
        <div className="field" style={{ flex:2, minWidth:"200px" }}>
          <label>Search Students</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, student ID, or campus..." />
        </div>
        <div className="field" style={{ flex:1, minWidth:"160px" }}>
          <label>Filter by Date <span className="req-note">* 2026 only</span></label>
          <input type="date" value={dateFilter} min="2026-01-01" max="2026-12-31" onChange={e => setDateFilter(e.target.value)} style={{ colorScheme:"dark" }} />
        </div>
        {dateFilter && (
          <div className="field" style={{ justifyContent:"flex-end", paddingBottom:"0.1rem" }}>
            <label style={{ visibility:"hidden" }}>clear</label>
            <button className="cancel-btn" style={{ padding:"0.75rem 1rem", fontSize:"0.82rem" }} onClick={() => setDateFilter("")}>✕ Clear Filter</button>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="empty-state"><span>🔍</span><p>{dateFilter ? `No submissions found for ${dateFilter}.` : "No students match your search."}</p></div>
      ) : (
        <div className="admin-table-wrap">
          {dateFilter && (
            <div style={{ marginBottom:"0.75rem", fontSize:"0.82rem", color:"#ffcc00", fontWeight:600 }}>
              📅 Showing students who submitted on <strong>{dateFilter}</strong> — {list.length} result{list.length !== 1 ? "s" : ""}
            </div>
          )}
          <table className="lb-table">
            <thead>
              <tr><th>Student ID</th><th>Name</th><th>Campus</th><th>Session</th><th>Days Logged</th><th>Total Steps</th><th>Details</th><th>Action</th></tr>
            </thead>
            <tbody>
              {list.map(s => (
                <>
                  <tr key={s.id}>
                    <td style={{ fontFamily:"monospace", fontSize:"0.8rem", color:"var(--muted)" }}>{s.id}</td>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.campus}</td>
                    <td><span className={`badge badge-${s.session.replace(" ","")}`}>{s.session}</span></td>
                    <td style={{ textAlign:"center" }}>{s.submittedDates?.length || 0}</td>
                    <td className="steps-cell">{s.totalSteps.toLocaleString()}</td>
                    <td>
                      <button className="view-btn" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                        {expanded === s.id ? "▲ Hide" : "▼ View Days"}
                      </button>
                    </td>
                    <td>
                      {confirmId === s.id ? (
                        <div style={{ display:"flex", gap:"0.4rem" }}>
                          <button className="confirm-del-btn" onClick={() => handleDelete(s.id)}>Yes, Delete</button>
                          <button className="cancel-btn" onClick={() => setConfirmId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button className="delete-btn" onClick={() => setConfirmId(s.id)}>🗑 Delete</button>
                      )}
                    </td>
                  </tr>
                  {expanded === s.id && s.submittedDates && (
                    <tr key={`${s.id}-days`}>
                      <td colSpan={8} style={{ padding:"0 1rem 1rem", background:"rgba(0,0,0,0.3)" }}>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"0.75rem", paddingTop:"0.75rem" }}>
                          {[...s.submittedDates].sort().reverse().map(date => {
                            const entry = s.dailyScreenshots?.[date];
                            const isDayConfirm = confirmDay?.studentId === s.id && confirmDay?.date === date;
                            return (
                              <div key={date} className="day-card">
                                <div className="day-card-date">📅 {date}</div>
                                <div className="day-card-steps">👟 {entry?.steps?.toLocaleString() || "?"} steps</div>
                                {entry?.img ? (
                                  <img src={entry.img} alt={`Screenshot for ${date}`} className="day-thumb" onClick={() => setLightbox({ img: entry.img, date, steps: entry.steps || 0 })} title="Click to view full size" />
                                ) : (
                                  <div className="day-no-img">No image</div>
                                )}
                                {isDayConfirm ? (
                                  <div style={{ display:"flex", gap:"0.3rem", marginTop:"0.25rem" }}>
                                    <button className="confirm-del-btn" style={{ fontSize:"0.7rem", padding:"0.3rem 0.5rem" }} onClick={() => handleDayDelete(s.id, date)}>Yes</button>
                                    <button className="cancel-btn" style={{ fontSize:"0.7rem", padding:"0.3rem 0.5rem" }} onClick={() => setConfirmDay(null)}>No</button>
                                  </div>
                                ) : (
                                  <button className="delete-btn" style={{ fontSize:"0.7rem", padding:"0.3rem 0.5rem", marginTop:"0.25rem" }} onClick={() => setConfirmDay({ studentId: s.id, date })}>🗑 Delete Day</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Submit Form ───────────────────────────────────────────────────────────
function SubmitForm({ onSubmit, students }) {
  const today = todayStr();
  const minDate = minDateStr();
  const maxDate = maxDateStr();
  const [form, setForm] = useState({ studentId:"", name:"", date:today, steps:"", session:"", campus:"" });
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [errors, setErrors]         = useState({});
  const [submitError, setSubmitError] = useState("");

  function handleIdBlur() {
    const sid = form.studentId.trim();
    if (sid && students[sid]) {
      const s = students[sid];
      setForm(f => ({ ...f, name:s.name, session:s.session, campus:s.campus }));
    }
  }
  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]:e.target.value }));
    setErrors(er => ({ ...er, [e.target.name]:undefined }));
    setSubmitError("");
  }
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
    setErrors(er => ({ ...er, screenshot:undefined }));
  }
  function validate() {
    const errs = {};
    if (!form.studentId.trim()) errs.studentId = "Student ID is required";
    if (!form.name.trim())      errs.name      = "Name is required";
    if (!form.date)             errs.date      = "Date is required";
    if (!form.steps || Number(form.steps) < 1000) errs.steps = "Minimum 1,000 steps required to submit";
    if (!form.session) errs.session = "Please select a session";
    if (!form.campus)  errs.campus  = "Please select a campus";
    if (!screenshot)   errs.screenshot = "Screenshot proof is required";
    return errs;
  }
  async function handleSubmit() {
    setSubmitError("");
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const sid = form.studentId.trim();
    const existing = students[sid];
    if (existing?.submittedDates?.includes(form.date)) {
      setSubmitError(`You have already submitted steps for ${form.date}. Only one submission per day is allowed.`);
      return;
    }
    setSubmitting(true);
    const result = await onSubmit({ ...form, studentId:sid, screenshotPreview:preview });
    setSubmitting(false);
    if (result?.error) { setSubmitError(result.error); return; }
    setSuccess(true);
    setForm({ studentId:"", name:"", date:today, steps:"", session:"", campus:"" });
    setScreenshot(null); setPreview(null);
    setTimeout(() => setSuccess(false), 5000);
  }

  return (
    <div className="form-container">
      <div className="form-header">
        <div className="form-icon">👟</div>
        <h2>Log Your Steps</h2>
        <p>Submit your daily step count and screenshot for verification</p>
      </div>
      {success     && <div className="success-banner">✅ Steps submitted! Your running total has been updated. Check the leaderboards!</div>}
      {submitError && <div className="error-banner">⚠️ {submitError}</div>}
      <div className="step-form">
        <div className="form-grid">
          <div className={`field ${errors.studentId?"has-error":""}`}>
            <label>Student ID <span className="req-note">* Your unique identifier</span></label>
            <input name="studentId" value={form.studentId} onChange={handleChange} onBlur={handleIdBlur} placeholder="Enter your student ID" autoComplete="off" />
            {errors.studentId && <span className="err">{errors.studentId}</span>}
          </div>
          <div className={`field ${errors.name?"has-error":""}`}>
            <label>Full Name</label>
            <input name="name" value={form.name} onChange={handleChange} placeholder="Enter your full name" autoComplete="off" />
            {errors.name && <span className="err">{errors.name}</span>}
          </div>
          <div className={`field ${errors.date?"has-error":""}`}>
            <label>Date Steps Were Taken <span className="req-note">* Any date in 2026</span></label>
            <input type="date" name="date" value={form.date} min={minDate} max={maxDate} onChange={handleChange} />
            {errors.date && <span className="err">{errors.date}</span>}
          </div>
          <div className={`field ${errors.steps?"has-error":""}`}>
            <label>Step Count <span className="req-note">* Minimum 1,000 steps</span></label>
            <input type="number" name="steps" value={form.steps} onChange={handleChange} placeholder="e.g. 10000" min="1000" />
            {errors.steps && <span className="err">{errors.steps}</span>}
          </div>
          <div className={`field full-width ${errors.session?"has-error":""}`}>
            <label>Student Session</label>
            <div className="radio-group">
              {SESSIONS.map(s => (
                <label key={s} className={`radio-card ${form.session===s?"selected":""}`}>
                  <input type="radio" name="session" value={s} checked={form.session===s} onChange={handleChange} />{s}
                </label>
              ))}
            </div>
            {errors.session && <span className="err">{errors.session}</span>}
          </div>
          <div className={`field full-width ${errors.campus?"has-error":""}`}>
            <label>Campus</label>
            <div className="campus-grid">
              {CAMPUSES.map(c => (
                <label key={c} className={`campus-card ${form.campus===c?"selected":""}`}>
                  <input type="radio" name="campus" value={c} checked={form.campus===c} onChange={handleChange} />
                  <span>🏫</span>{c}
                </label>
              ))}
            </div>
            {errors.campus && <span className="err">{errors.campus}</span>}
          </div>
          <div className={`field full-width ${errors.screenshot?"has-error":""}`}>
            <label>Screenshot Proof <span className="req-note"> * REQUIRED — submission blocked without this</span></label>
            <div className="upload-zone" onClick={() => document.getElementById("ss-input").click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) handleFile({target:{files:[f]}}); }}>
              {preview
                ? <img src={preview} alt="Screenshot preview" className="preview-img" />
                : <><div className="upload-icon">📷</div><p>Click or drag & drop your screenshot here</p><span>PNG, JPG, WEBP accepted</span></>
              }
            </div>
            <input id="ss-input" type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
            {errors.screenshot && <span className="err">⚠️ A screenshot is required as proof — submission blocked until uploaded.</span>}
          </div>
        </div>
        <button onClick={handleSubmit} className="submit-btn" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit My Steps 🏃"}
        </button>
      </div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab]     = useState(0);
  const [students, setStudents]       = useState({});
  const [loading, setLoading]         = useState(true);
  const [adminAuthed, setAdminAuthed] = useState(false);

  useEffect(() => {
    loadData().then(({ students }) => { setStudents(students); setLoading(false); });
  }, []);

  const handleSubmit = useCallback(async (formData) => {
    const { studentId, name, campus, session, steps, date, screenshotPreview } = formData;
    const stepCount = Number(steps);
    const existing = students[studentId];
    if (existing?.submittedDates?.includes(date))
      return { error:`Already submitted steps for ${date}. Only one submission per day is allowed.` };
    const prevScreenshots = existing?.dailyScreenshots || {};
    const updatedStudent = existing
      ? { ...existing, name, campus, session, totalSteps: existing.totalSteps + stepCount, submittedDates: [...existing.submittedDates, date], dailyScreenshots: { ...prevScreenshots, [date]: { steps: stepCount, img: screenshotPreview } } }
      : { name, campus, session, totalSteps: stepCount, submittedDates: [date], dailyScreenshots: { [date]: { steps: stepCount, img: screenshotPreview } } };
    const newStudents = { ...students, [studentId]: updatedStudent };
    setStudents(newStudents);
    await saveStudents(newStudents);
    return { success: true };
  }, [students]);

  const handleDelete = useCallback(async (studentId) => {
    const newStudents = { ...students };
    delete newStudents[studentId];
    setStudents(newStudents);
    await saveStudents(newStudents);
  }, [students]);

  const handleDeleteDay = useCallback(async (studentId, date) => {
    const s = students[studentId];
    if (!s) return;
    const entry = s.dailyScreenshots?.[date];
    const stepsToRemove = entry?.steps || 0;
    const newDates = s.submittedDates.filter(d => d !== date);
    const newScreenshots = { ...s.dailyScreenshots };
    delete newScreenshots[date];
    const newTotal = Math.max(0, s.totalSteps - stepsToRemove);
    const newStudents = { ...students };
    if (newDates.length === 0) {
      delete newStudents[studentId];
    } else {
      newStudents[studentId] = { ...s, totalSteps: newTotal, submittedDates: newDates, dailyScreenshots: newScreenshots };
    }
    setStudents(newStudents);
    await saveStudents(newStudents);
  }, [students]);

  const allList       = Object.values(students);
  const totalStudents = allList.length;
  const highestSteps  = allList.length ? Math.max(...allList.map(s => s.totalSteps)) : 0;
  const avgSteps      = allList.length ? Math.round(allList.reduce((a,s) => a+s.totalSteps,0)/allList.length) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root { --bg:#0a0000; --surface:#130000; --surface2:#1c0000; --border:#3a0a0a; --accent:#e81c1c; --accent2:#ff5252; --accent3:#ff8a00; --text:#f5e8e8; --muted:#8a6060; }
        body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; min-height:100vh; }
        .hero { background:linear-gradient(135deg,#0a0000 0%,#1a0000 50%,#0f0000 100%); border-bottom:1px solid var(--border); padding:2.5rem 1.5rem 0; position:relative; overflow:hidden; }
        .hero::before { content:''; position:absolute; top:-60%; left:-20%; width:60%; height:200%; background:radial-gradient(ellipse,rgba(232,28,28,0.12) 0%,transparent 70%); pointer-events:none; }
        .hero::after  { content:''; position:absolute; top:-40%; right:-10%; width:50%; height:180%; background:radial-gradient(ellipse,rgba(180,0,0,0.08) 0%,transparent 70%); pointer-events:none; }
        .hero-inner { max-width:1100px; margin:0 auto; position:relative; z-index:1; }
        .hero-badge { display:inline-flex; align-items:center; gap:0.4rem; background:rgba(232,28,28,0.12); border:1px solid rgba(232,28,28,0.4); color:var(--accent2); font-size:0.75rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; padding:0.3rem 0.8rem; border-radius:100px; margin-bottom:1rem; }
        .hero h1 { font-family:'Bebas Neue',cursive; font-size:clamp(2rem,5.5vw,4rem); line-height:1; letter-spacing:0.02em; color:var(--text); margin-bottom:0.5rem; }
        .hero h1 span { -webkit-text-fill-color:transparent; -webkit-text-stroke:2px var(--accent); }
        .hero-sub { color:var(--muted); font-size:1rem; margin-bottom:2rem; }
        .stats-bar { display:flex; gap:2rem; padding:1rem 0; border-top:1px solid var(--border); margin-top:0.5rem; flex-wrap:wrap; }
        .stat-item { display:flex; flex-direction:column; gap:0.1rem; }
        .stat-val { font-family:'Bebas Neue',cursive; font-size:1.8rem; color:var(--accent); letter-spacing:0.05em; }
        .stat-lbl { font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.1em; }
        .tabs-bar { background:var(--surface); border-bottom:1px solid var(--border); overflow-x:auto; scrollbar-width:none; }
        .tabs-bar::-webkit-scrollbar { display:none; }
        .tabs-inner { max-width:1100px; margin:0 auto; display:flex; padding:0 1.5rem; }
        .tab-btn { padding:1rem 1.25rem; background:none; border:none; color:var(--muted); font-family:'DM Sans',sans-serif; font-size:0.85rem; font-weight:600; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; transition:color 0.2s,border-color 0.2s; }
        .tab-btn:hover { color:var(--text); }
        .tab-btn.active { color:var(--accent); border-bottom-color:var(--accent); }
        .tab-btn.admin-tab { color:#8a6060; }
        .tab-btn.admin-tab:hover { color:#ccc; }
        .tab-btn.admin-tab.active { color:#ffcc00; border-bottom-color:#ffcc00; }
        .content { max-width:1100px; margin:0 auto; padding:2rem 1.5rem; }
        .form-container { max-width:720px; margin:0 auto; }
        .form-header { text-align:center; margin-bottom:2rem; }
        .form-icon { font-size:3rem; margin-bottom:0.75rem; }
        .form-header h2 { font-family:'Bebas Neue',cursive; font-size:2.5rem; letter-spacing:0.05em; margin-bottom:0.4rem; }
        .form-header p { color:var(--muted); font-size:0.9rem; }
        .success-banner { background:rgba(232,28,28,0.12); border:1px solid rgba(232,28,28,0.4); color:var(--accent2); border-radius:10px; padding:1rem 1.25rem; text-align:center; font-weight:600; margin-bottom:1.5rem; animation:fadeIn 0.4s ease; }
        .error-banner { background:rgba(200,0,0,0.18); border:1px solid rgba(232,28,28,0.6); color:#ff8080; border-radius:10px; padding:1rem 1.25rem; text-align:center; font-weight:600; margin-bottom:1.5rem; animation:fadeIn 0.4s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .step-form { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:2rem; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; }
        .field { display:flex; flex-direction:column; gap:0.5rem; }
        .full-width { grid-column:1 / -1; }
        label { font-size:0.82rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:var(--muted); }
        .req-note { font-size:0.68rem; font-weight:500; text-transform:none; letter-spacing:0; color:var(--accent2); margin-left:0.3rem; }
        input[type="text"], input[type="number"], input[type="date"], input[type="password"] { background:var(--surface2); border:1px solid var(--border); color:var(--text); font-family:'DM Sans',sans-serif; font-size:0.95rem; padding:0.75rem 1rem; border-radius:8px; outline:none; transition:border-color 0.2s; width:100%; -webkit-text-fill-color:var(--text); }
        input[type="text"]::placeholder, input[type="number"]::placeholder, input[type="password"]::placeholder { color:var(--muted); opacity:1; }
        input[type="text"] { background:var(--surface2); color:#000; -webkit-text-fill-color:#000; }
        input[type="text"]::placeholder { color:#666; }
        input[type="text"]:focus, input[type="number"]:focus, input[type="date"]:focus, input[type="password"]:focus { border-color:var(--accent); }
        .has-error input, .has-error .upload-zone { border-color:#ff4f4f !important; }
        .err { font-size:0.78rem; color:#ff6b6b; font-weight:500; }
        .radio-group { display:flex; gap:0.75rem; flex-wrap:wrap; }
        .radio-card { display:flex; align-items:center; gap:0.5rem; background:var(--surface2); border:1.5px solid var(--border); border-radius:8px; padding:0.6rem 1rem; cursor:pointer; font-size:0.9rem; font-weight:600; transition:all 0.2s; color:var(--muted); }
        .radio-card input[type="radio"] { display:none; }
        .radio-card:hover { border-color:var(--accent); color:var(--text); }
        .radio-card.selected { border-color:var(--accent); background:rgba(232,28,28,0.12); color:var(--accent); }
        .campus-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:0.6rem; }
        .campus-card { display:flex; align-items:center; gap:0.5rem; background:var(--surface2); border:1.5px solid var(--border); border-radius:8px; padding:0.65rem 0.85rem; cursor:pointer; font-size:0.82rem; font-weight:600; transition:all 0.2s; color:var(--muted); line-height:1.3; }
        .campus-card input[type="radio"] { display:none; }
        .campus-card:hover { border-color:var(--accent2); color:var(--text); }
        .campus-card.selected { border-color:var(--accent); background:rgba(232,28,28,0.12); color:var(--accent2); }
        .upload-zone { background:var(--surface2); border:2px dashed var(--border); border-radius:12px; padding:2.5rem; text-align:center; cursor:pointer; transition:border-color 0.2s,background 0.2s; min-height:160px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.5rem; }
        .upload-zone:hover { border-color:var(--accent); background:rgba(232,28,28,0.05); }
        .upload-icon { font-size:2.5rem; }
        .upload-zone p { color:var(--text); font-weight:600; }
        .upload-zone span { color:var(--muted); font-size:0.8rem; }
        .preview-img { max-height:200px; border-radius:8px; object-fit:contain; }
        .submit-btn { width:100%; margin-top:1.75rem; padding:1rem; background:linear-gradient(135deg,#e81c1c,#c00000); color:#fff; border:none; border-radius:10px; font-family:'Bebas Neue',cursive; font-size:1.3rem; letter-spacing:0.08em; cursor:pointer; transition:opacity 0.2s,transform 0.1s; }
        .submit-btn:hover:not(:disabled) { opacity:0.9; transform:translateY(-1px); }
        .submit-btn:active:not(:disabled) { transform:translateY(0); }
        .submit-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .leaderboard-wrap { animation:fadeIn 0.35s ease; }
        .lb-title { font-family:'Bebas Neue',cursive; font-size:2.2rem; letter-spacing:0.05em; margin-bottom:1.25rem; color:var(--text); }
        .lb-table { width:100%; border-collapse:separate; border-spacing:0 0.4rem; }
        .lb-table thead th { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); padding:0 1rem 0.75rem; text-align:left; border-bottom:1px solid var(--border); }
        .lb-table tbody tr { background:var(--surface); transition:background 0.15s; }
        .lb-table tbody tr:hover { background:var(--surface2); }
        .lb-table tbody tr.top-1 { background:rgba(255,215,0,0.06); }
        .lb-table tbody tr.top-2 { background:rgba(192,192,192,0.05); }
        .lb-table tbody tr.top-3 { background:rgba(205,127,50,0.05); }
        .lb-table tbody td { padding:0.9rem 1rem; font-size:0.9rem; vertical-align:middle; }
        .lb-table tbody td:first-child { border-radius:10px 0 0 10px; }
        .lb-table tbody td:last-child  { border-radius:0 10px 10px 0; }
        .steps-cell { font-family:'Bebas Neue',cursive; font-size:1.3rem; letter-spacing:0.05em; color:var(--accent); }
        .badge { display:inline-block; padding:0.2rem 0.6rem; border-radius:100px; font-size:0.72rem; font-weight:700; letter-spacing:0.05em; }
        .badge-AM { background:rgba(232,28,28,0.15); color:#ff7070; }
        .badge-PM { background:rgba(255,138,0,0.15); color:var(--accent3); }
        .badge-AllDay { background:rgba(232,28,28,0.25); color:var(--accent2); }
        .empty-state { text-align:center; padding:5rem 2rem; color:var(--muted); }
        .empty-state span { font-size:4rem; display:block; margin-bottom:1rem; }
        .spinner { width:40px; height:40px; border:3px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.7s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .admin-login-wrap { display:flex; justify-content:center; align-items:center; min-height:400px; }
        .admin-login-box { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:2.5rem; width:100%; max-width:420px; text-align:center; }
        .admin-login-title { font-family:'Bebas Neue',cursive; font-size:2rem; letter-spacing:0.05em; margin-bottom:0.4rem; }
        .admin-login-sub { color:var(--muted); font-size:0.88rem; margin-bottom:1.5rem; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
        .shake { animation:shake 0.5s ease; }
        .admin-info-bar { display:flex; gap:1rem; background:rgba(255,204,0,0.07); border:1px solid rgba(255,204,0,0.2); border-radius:10px; padding:0.85rem 1.25rem; margin-bottom:1.5rem; color:#ffcc00; font-size:0.85rem; font-weight:600; flex-wrap:wrap; }
        .admin-table-wrap { overflow-x:auto; }
        .logout-btn { background:transparent; border:1px solid var(--border); color:var(--muted); padding:0.5rem 1rem; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:0.82rem; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .logout-btn:hover { border-color:var(--accent); color:var(--accent); }
        .delete-btn { background:rgba(232,28,28,0.12); border:1px solid rgba(232,28,28,0.3); color:var(--accent2); padding:0.4rem 0.8rem; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
        .delete-btn:hover { background:rgba(232,28,28,0.25); border-color:var(--accent); }
        .confirm-del-btn { background:#c00000; border:none; color:#fff; padding:0.4rem 0.75rem; border-radius:6px; font-size:0.78rem; font-weight:700; cursor:pointer; white-space:nowrap; }
        .confirm-del-btn:hover { background:#e81c1c; }
        .cancel-btn { background:var(--surface2); border:1px solid var(--border); color:var(--muted); padding:0.4rem 0.65rem; border-radius:6px; font-size:0.78rem; cursor:pointer; }
        .cancel-btn:hover { color:var(--text); }
        .view-btn { background:rgba(255,204,0,0.08); border:1px solid rgba(255,204,0,0.25); color:#ffcc00; padding:0.4rem 0.8rem; border-radius:6px; font-size:0.78rem; font-weight:600; cursor:pointer; white-space:nowrap; transition:all 0.2s; }
        .view-btn:hover { background:rgba(255,204,0,0.18); }
        .day-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:0.75rem; display:flex; flex-direction:column; gap:0.4rem; min-width:140px; max-width:160px; }
        .day-card-date { font-size:0.75rem; font-weight:700; color:var(--muted); letter-spacing:0.05em; }
        .day-card-steps { font-family:'Bebas Neue',cursive; font-size:1.1rem; color:var(--accent); letter-spacing:0.05em; }
        .day-thumb { width:100%; height:90px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid var(--border); transition:transform 0.15s,border-color 0.15s; }
        .day-thumb:hover { transform:scale(1.03); border-color:var(--accent); }
        .day-no-img { font-size:0.75rem; color:var(--muted); font-style:italic; text-align:center; padding:0.5rem 0; }
        @media (max-width:600px) {
          .form-grid { grid-template-columns:1fr; }
          .step-form { padding:1.25rem; }
          .campus-grid { grid-template-columns:1fr 1fr; }
          .hero h1 { font-size:2rem; }
          .lb-table thead th:nth-child(3), .lb-table tbody td:nth-child(3) { display:none; }
        }
      `}</style>

      <div className="hero">
        <div className="hero-inner">
          <div className="hero-badge">🏆 Step Challenge 2026</div>
          <h1>TULSA TECH <span>STUDENT</span> WALKING CHALLENGE</h1>
          <p className="hero-sub">Log your steps daily, build your total, and climb the leaderboard!</p>
          <div className="stats-bar">
            <div className="stat-item"><span className="stat-val">{totalStudents}</span><span className="stat-lbl">Students</span></div>
            <div className="stat-item"><span className="stat-val">{highestSteps.toLocaleString()}</span><span className="stat-lbl">Highest Total</span></div>
            <div className="stat-item"><span className="stat-val">{avgSteps.toLocaleString()}</span><span className="stat-lbl">Avg Total Steps</span></div>
          </div>
        </div>
      </div>

      <div className="tabs-bar">
        <div className="tabs-inner">
          {TABS.map((tab, i) => (
            <button key={tab} className={`tab-btn ${i===6?"admin-tab":""} ${activeTab===i?"active":""}`} onClick={() => { setActiveTab(i); if(i!==6) setAdminAuthed(false); }}>
              {i===6 ? "🔒 Admin" : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="content">
        {loading ? <Loader /> :
          activeTab===0 ? <SubmitForm onSubmit={handleSubmit} students={students} /> :
          activeTab===1 ? <LeaderboardTable title="🏫 Campus Average Steps" students={students} groupBy="campus" /> :
          activeTab===2 ? <LeaderboardTable title="🏆 Top 10 Highest Steps" students={students} /> :
          activeTab===3 ? <LeaderboardTable title="🌅 Top 10 AM Students" students={students} filter="AM" /> :
          activeTab===4 ? <LeaderboardTable title="🌆 Top 10 PM Students" students={students} filter="PM" /> :
          activeTab===5 ? <LeaderboardTable title="☀️ Top 10 All Day Students" students={students} filter="All Day" /> :
          activeTab===6 ? (
            adminAuthed
              ? <AdminPanel students={students} onDelete={handleDelete} onDeleteDay={handleDeleteDay} onLogout={() => { setAdminAuthed(false); setActiveTab(0); }} />
              : <AdminLogin onLogin={() => setAdminAuthed(true)} />
          ) : null
        }
      </div>

      <div style={{ textAlign:"center", padding:"2rem 1rem 1.5rem", color:"var(--muted)", fontSize:"0.72rem", opacity:0.6 }}>
        PM advisory is better :)
      </div>
    </>
  );
}
