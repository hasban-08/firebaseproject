import { useEffect, useState } from "react"; 
import { 
  addDoc, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  serverTimestamp, 
  where, 
} from "firebase/firestore"; 
import { useNavigate } from "react-router-dom"; 
import { auth, db } from "../firebase"; 
import { getLocalDateStr } from "../utils/attendanceHelpers"; 
import "./css/LeaveRequest.css"; 
 
function LeaveRequest() { 
  const navigate = useNavigate(); 
  const user = auth.currentUser; 
 
  const [requestType, setRequestType] = useState("leave"); 
  const [startDate, setStartDate] = useState(getLocalDateStr()); 
  const [endDate, setEndDate] = useState(getLocalDateStr()); 
  const [earlyLeaveTime, setEarlyLeaveTime] = useState(""); 
  const [reason, setReason] = useState(""); 
  const [employeeName, setEmployeeName] = useState("Employee"); 
  const [requests, setRequests] = useState([]); 
  const [loading, setLoading] = useState(true); 
  const [isProcessing, setIsProcessing] = useState(false); 
  const [error, setError] = useState(""); 
 
  useEffect(() => { 
    if (!user) { 
      navigate("/login"); 
      return; 
    } 
 
    let cancelled = false; 
 
    async function loadPage() { 
      try { 
        const userSnap = await getDoc(doc(db, "users", user.uid)); 
 
        if (!userSnap.exists()) { 
          throw new Error("Employee profile not found."); 
        } 
 
        const userData = userSnap.data(); 
 
        if (!cancelled) { 
          setEmployeeName( 
            userData.fullName || 
              userData.name || 
              user.displayName || 
              user.email?.split("@")[0] || 
              "Employee" 
          ); 
        } 
 
        const requestQuery = query( 
          collection(db, "leaveRequests"), 
          where("uid", "==", user.uid) 
        ); 
 
        const requestSnap = await getDocs(requestQuery); 
 
        const rows = requestSnap.docs 
          .map((item) => ({ id: item.id, ...item.data() })) 
          .sort((a, b) => { 
            const aTime = a.createdAt?.toMillis?.() || 0; 
            const bTime = b.createdAt?.toMillis?.() || 0; 
            return bTime - aTime; 
          }); 
 
        if (!cancelled) setRequests(rows); 
      } catch (err) { 
        if (!cancelled) setError(err.message || "Could not load requests."); 
      } finally { 
        if (!cancelled) setLoading(false); 
      } 
    } 
 
    loadPage(); 
 
    return () => { 
      cancelled = true; 
    }; 
  }, [user, navigate]); 
 
  async function refreshRequests() { 
    if (!user) return; 
 
    const requestQuery = query( 
      collection(db, "leaveRequests"), 
      where("uid", "==", user.uid) 
    ); 
 
    const requestSnap = await getDocs(requestQuery); 
 
    setRequests( 
      requestSnap.docs 
        .map((item) => ({ id: item.id, ...item.data() })) 
        .sort( 
          (a, b) => 
            (b.createdAt?.toMillis?.() || 0) - 
            (a.createdAt?.toMillis?.() || 0) 
        ) 
    ); 
  } 
 
  async function handleProcessRequest(event) { 
    event.preventDefault(); 
    setError(""); 
 
    if (!user) { 
      setError("Please log in again."); 
      return; 
    } 
 
    if (!reason.trim()) { 
      setError("Please enter a reason."); 
      return; 
    } 
 
    if (requestType === "leave") { 
      if (!startDate || !endDate || endDate < startDate) { 
        setError("Please select valid leave dates."); 
        return; 
      } 
    } else { 
      if (!startDate || !earlyLeaveTime) { 
        setError("Please select the date and early departure time."); 
        return; 
      } 
    } 
 
    setIsProcessing(true); 
 
    try { 
      const userSnap = await getDoc(doc(db, "users", user.uid)); 
 
      if (!userSnap.exists()) { 
        throw new Error("Employee profile not found."); 
      } 
 
      const userData = userSnap.data(); 
 
      const newRequest = { 
        uid: user.uid, 
        employeeName: 
          userData.fullName || 
          userData.name || 
          user.displayName || 
          user.email?.split("@")[0] || 
          "Employee", 
        employeeEmail: user.email || "", 
        type: requestType, 
        reason: reason.trim(), 
        status: "pending", 
        createdAt: serverTimestamp(), 
      }; 
 
      if (requestType === "leave") { 
        newRequest.startDate = startDate; 
        newRequest.endDate = endDate; 
      } else { 
        newRequest.date = startDate; 
        newRequest.earlyLeaveTime = earlyLeaveTime; 
      } 
 
      // Avoid duplicate pending requests
      const existingQuery = query( 
        collection(db, "leaveRequests"), 
        where("uid", "==", user.uid), 
        where("status", "==", "pending") 
      ); 
 
      const existingSnap = await getDocs(existingQuery); 
 
      const duplicate = existingSnap.docs.some((item) => { 
        const old = item.data(); 
 
        if (old.type !== requestType) return false; 
 
        if (requestType === "leave") { 
          return old.startDate === startDate && old.endDate === endDate; 
        } 
 
        return old.date === startDate; 
      }); 
 
      if (duplicate) { 
        throw new Error( 
          "You already have a pending request for this date or date range." 
        ); 
      } 
 
      await addDoc(collection(db, "leaveRequests"), newRequest); 
 
      setReason(""); 
      setEarlyLeaveTime(""); 
      await refreshRequests(); 
 
      window.alert("Request sent. It is waiting for admin approval."); 
    } catch (err) { 
      setError(err.message || "Could not process your request."); 
    } finally { 
      setIsProcessing(false); 
    } 
  } 
 
  function formatRequestType(type) { 
    return type === "earlyLeave" ? "Early Leave" : "Leave"; 
  } 
 
  return ( 
    <main className="leave-req-page"> 
      {/* Naya Topbar Header */}
      <header className="leave-req-topbar"> 
        <div className="leave-req-identity"> 
          <div className="leave-req-avatar">L</div> 
          <div className="leave-req-identity-text"> 
            <span className="leave-req-name">Leave & Early Leave</span> 
            <span className="leave-req-pill">Employee Portal</span> 
          </div> 
        </div> 
        <button className="leave-req-back-btn" onClick={() => navigate("/")}> 
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"> 
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> 
          </svg> 
          Back 
        </button> 
      </header> 
 
      <section className="leave-req-panel"> 
        <h2>New Request</h2> 
 
        <form onSubmit={handleProcessRequest} className="leave-req-form"> 
          <label> 
            Request Type 
            <select 
              value={requestType} 
              onChange={(event) => setRequestType(event.target.value)} 
            > 
              <option value="leave">Leave</option> 
              <option value="earlyLeave">Early Leave</option> 
            </select> 
          </label> 
 
          <label> 
            {requestType === "leave" ? "Start Date" : "Date"} 
            <input 
              type="date" 
              value={startDate} 
              min={getLocalDateStr()} 
              onChange={(event) => { 
                setStartDate(event.target.value); 
 
                if (endDate < event.target.value) { 
                  setEndDate(event.target.value); 
                } 
              }} 
              required 
            /> 
          </label> 
 
          {requestType === "leave" ? ( 
            <label> 
              End Date 
              <input 
                type="date" 
                value={endDate} 
                min={startDate} 
                onChange={(event) => setEndDate(event.target.value)} 
                required 
              /> 
            </label> 
          ) : ( 
            <label> 
              Expected Departure Time 
              <input 
                type="time" 
                value={earlyLeaveTime} 
                onChange={(event) => setEarlyLeaveTime(event.target.value)} 
                required 
              /> 
            </label> 
          )} 
 
          <label> 
            Reason 
            <textarea 
              rows={4} 
              maxLength={1000} 
              placeholder={ 
                requestType === "leave" 
                  ? "Explain why you need leave..." 
                  : "Explain why you need to leave early..." 
              } 
              value={reason} 
              onChange={(event) => setReason(event.target.value)} 
              required 
            /> 
          </label> 
 
          {error && <p className="leave-req-error">{error}</p>} 
 
          <button 
            className="leave-req-send-btn" 
            disabled={isProcessing} 
          > 
            {isProcessing ? "Processing..." : "Send Request"} 
          </button> 
        </form> 
      </section> 
 
      <section className="leave-req-panel"> 
        <h2>My Requests</h2> 
 
        {loading ? ( 
          <p className="leave-req-empty">Loading requests...</p> 
        ) : requests.length === 0 ? ( 
          <p className="leave-req-empty">You have not added any requests yet.</p> 
        ) : ( 
          <div className="leave-req-list"> 
            {requests.map((item) => ( 
              <article className="leave-req-card" key={item.id}> 
                <div className="leave-req-card-heading"> 
                  <strong>{formatRequestType(item.type)}</strong> 
                  <span 
                    className={`leave-req-status leave-req-status-${item.status || "pending"}`} 
                  > 
                    {item.status || "pending"} 
                  </span> 
                </div> 
 
                <p> 
                  <strong>Date: </strong> 
                  {item.type === "earlyLeave" 
                    ? item.date 
                    : `${item.startDate} to ${item.endDate}`} 
                </p> 
 
                {item.type === "earlyLeave" && ( 
                  <p> 
                    <strong>Departure: </strong> 
                    {item.earlyLeaveTime} 
                  </p> 
                )} 
 
                <p> 
                  <strong>Reason: </strong> 
                  {item.reason} 
                </p> 
 
                {item.adminComment && ( 
                  <p> 
                    <strong>Admin comment: </strong> 
                    {item.adminComment} 
                  </p> 
                )} 
              </article> 
            ))} 
          </div> 
        )} 
      </section> 
    </main> 
  ); 
} 
 
export default LeaveRequest;