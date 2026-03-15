import React, { useState, useRef, useEffect, useCallback } from "react";

const C = {
  navy:"#0B1628",navyMid:"#152238",navyLight:"#1E3352",
  gold:"#D4A843",goldLight:"#F0C96A",
  ice:"#C8D8F0",white:"#FAFBFF",gray:"#8899BB",
  green:"#2DD4A0",amber:"#F59E0B",red:"#F05C5C",purple:"#A78BFA"
};

const TYPE_LABELS={process:"Process Improvement",technology:"Technology / Automation",culture:"Culture / People"};
const TYPE_COLORS={process:C.gold,technology:C.green,culture:C.ice};
const TYPE_ICONS={process:"⚙️",technology:"💡",culture:"🤝"};

function generateThumbnailSvg(type, title="") {
  const cfg = {
    process:{ bg1:"#1A1000", bg2:"#3A2800", accent:C.gold, label:"PROCESS" },
    technology:{ bg1:"#001A10", bg2:"#003020", accent:C.green, label:"TECHNOLOGY" },
    culture:{ bg1:"#000D1A", bg2:"#001830", accent:C.ice, label:"CULTURE" }
  }[type] || { bg1:"#0B1628", bg2:"#152238", accent:C.gold, label:"IDEA" };
  const words = title.split(" ").slice(0,5).join(" ") || cfg.label;
  const icon = TYPE_ICONS[type] || "💡";
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${cfg.bg1}"/>
          <stop offset="100%" style="stop-color:${cfg.bg2}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="220" fill="url(#bg)"/>
      <circle cx="320" cy="55" r="80" fill="${cfg.accent}" opacity="0.07"/>
      <circle cx="60" cy="170" r="60" fill="${cfg.accent}" opacity="0.05"/>
      <rect x="0" y="0" width="4" height="220" fill="${cfg.accent}" opacity="0.8"/>
      <text x="24" y="38" font-family="system-ui" font-size="10" font-weight="700" letter-spacing="3" fill="${cfg.accent}" opacity="0.7">${cfg.label}</text>
      <text x="24" y="115" font-family="system-ui" font-size="26" fill="white" opacity="0.95">${icon}</text>
      <text x="62" y="108" font-family="system-ui" font-size="15" font-weight="700" fill="white" opacity="0.9" dominant-baseline="middle">${words.length>30?words.slice(0,30)+"…":words}</text>
      <rect x="24" y="160" width="352" height="1" fill="${cfg.accent}" opacity="0.2"/>
      <text x="24" y="185" font-family="system-ui" font-size="10" fill="${cfg.accent}" opacity="0.6">IdeaForge · AI-Powered Innovation</text>
    </svg>`
  )}`;
}

function buildSystemPrompt(type) {
  const ctx = {
    process:"process improvement (streamlining workflows, reducing manual steps, eliminating waste)",
    technology:"technology or automation (apps, digital tools, automation replacing manual work)",
    culture:"culture or people improvement (engagement, communication, training, recognition)"
  }[type];
  return `You are IdeaForge AI, a friendly enterprise idea development assistant. Guide the employee through a structured conversation — one focused question at a time.

IDEA TYPE: ${ctx}

Cover these areas naturally:
1. Plain language description of the idea
2. Current state / process (who, how often, how long)
3. Pain points with the current state
4. Future state vision
5. Time and cost data for benefit estimate (ask for hourly rate range)
6. Stage: Just a Thought / In Progress / Implemented

When you have enough info (5-7 exchanges), generate:
<RECORD>{"title":"...","valueStatement":"...","currentState":"...","futureState":"...","hardBenefits":[{"item":"...","low":0,"high":0,"unit":"$/yr"}],"softBenefits":["..."],"riskNote":"...","nextSteps":["..."],"emailSubject":"...","emailBody":"...","capturedFacts":["..."]}</RECORD>

Then ask user to confirm stage. Keep responses 2-4 sentences. Warm, encouraging tone. Start with a welcome and ask them to describe their idea.`;
}

function buildFollowUpPrompt(idea, attemptNum) {
  return `You are IdeaForge AI conducting a 30-day follow-up. The idea "${idea.title}" (${TYPE_LABELS[idea.type]}) has not been updated in ${idea.simulatedDays} days. This is attempt ${attemptNum} of 2.

Previous notes: ${idea.followUpLog?.filter(l=>l.response).map(l=>l.summary).join("; ") || "None yet."}

Warmly greet the person, reference the idea by name, acknowledge it hasn't had updates, and ask ONE focused follow-up question about current status. 2-3 sentences max. Be warm and encouraging.`;
}

function getErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || "Unknown error";
  if (typeof err === "object") {
    if (typeof err.message === "string") return err.message;
    if (typeof err.error === "string") return err.error;
    if (err.error && typeof err.error.message === "string") return err.error.message;
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown object error";
    }
  }
  return String(err);
}

async function callClaude(messages) {
  const res = await fetch("/api/anthropic", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages: messages.map(m => ({
  role: m.role,
  content: [
    {
      type: "text",
      text: m.content
    }
  ]
}))
    })
  });

  const data = await res.json();
  console.log("Claude response:", data);

if (!res.ok) {
  throw new Error(
    data?.error?.message ||
    data?.error ||
    data?.message ||
    `HTTP ${res.status}`
  );
}

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
      data?.error ||
      data?.message ||
      `HTTP ${res.status}`
    );
  }

  console.log("Claude response:", data);

  if (Array.isArray(data.content)) {
    const text = data.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    return text;
  }

  throw new Error("Unexpected Claude response format");
}

async function generateSummary(ideaTitle, response) {
  try {
    return await callClaude([{
      role: "user",
      content: `Summarize this follow-up update about "${ideaTitle}" in one sentence (max 20 words): "${response}"`
    }]);
  } catch {
    return response.slice(0, 80);
  }
}

// ── SEED DATA ─────────────────────────────────────────────────────────────
const today = new Date("2026-03-14");
function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

const SEED_IDEAS = [
  { id:"TEC-2026-0301-042", title:"Automate Monthly Compliance Report Generation", type:"technology", stage:"progress", valueStatement:"Replace 4 hours of monthly manual report compilation with a fully automated Power BI dashboard.", currentState:"Compliance team manually pulls data from 6 spreadsheets each month, spending 4+ hours compiling a static report.", futureState:"A Power BI dashboard auto-pulls all compliance data and sends scheduled summaries to leadership automatically.", hardBenefits:[{item:"Report compilation time saved",low:2400,high:3600,unit:"$/yr"}], softBenefits:["Real-time visibility","Reduced human error"], nextSteps:["Identify developer","Map data sources"], submitter:"Maria Chen", submitterEmail:"maria.chen@company.com", assignedTo:"IT Team", assignedEmail:"it@company.com", department:"Compliance", date:daysAgo(35), lastUpdated:daysAgo(35), simulatedDays:35, likes:24, comments:2, saves:11, commentList:[{author:"James R.",text:"This would save so much time every month.",date:daysAgo(34)},{author:"Priya S.",text:"Can we include audit tracking data too?",date:daysAgo(33)}], savingsLow:2400, savingsHigh:3600, followUpCount:0, followUpLog:[], followUpHistory:[] },
  { id:"PRC-2026-0205-017", title:"Standardize Onboarding Checklist Across All Departments", type:"process", stage:"thought", valueStatement:"A single standardized onboarding checklist reduces new hire ramp time by 30%.", currentState:"Each department runs its own onboarding process with no shared standard. New hires report confusion.", futureState:"A shared onboarding checklist template with department-specific sections and automated task assignments.", hardBenefits:[{item:"HR onboarding admin time saved",low:5200,high:8400,unit:"$/yr"}], softBenefits:["Consistent experience","Faster ramp"], nextSteps:["Survey managers","Draft template"], submitter:"Devon Williams", submitterEmail:"devon.williams@company.com", assignedTo:"HR Lead", assignedEmail:"hr@company.com", department:"Human Resources", date:daysAgo(42), lastUpdated:daysAgo(42), simulatedDays:42, likes:19, comments:2, saves:14, commentList:[{author:"Sandra K.",text:"Long overdue.",date:daysAgo(40)},{author:"Tom A.",text:"IT has a checklist to share.",date:daysAgo(39)}], savingsLow:5200, savingsHigh:8400, followUpCount:1, followUpLog:[{attempt:1,date:daysAgo(12),response:"We started gathering input from 3 department heads. Still early stages.",summary:"Gathering input from department heads, early stage.",respondedBy:"Devon Williams"}], followUpHistory:[] },
  { id:"CUL-2026-0208-089", title:"Peer Recognition Program Tied to Company Values", type:"culture", stage:"progress", valueStatement:"A peer recognition program reinforces company values and reduces voluntary turnover.", currentState:"Recognition is manager-driven and infrequent. Employees feel undervalued.", futureState:"Monthly peer nominations tied to values with public recognition in all-hands meetings.", hardBenefits:[{item:"Turnover reduction (est. 1 role/yr)",low:8000,high:15000,unit:"$/yr"}], softBenefits:["Improved engagement","Values alignment"], nextSteps:["Draft guidelines","Pilot with one team"], submitter:"Keisha Thompson", submitterEmail:"keisha.t@company.com", assignedTo:"People & Culture Lead", assignedEmail:"people@company.com", department:"People & Culture", date:daysAgo(38), lastUpdated:daysAgo(38), simulatedDays:38, likes:31, comments:2, saves:18, commentList:[{author:"Luis M.",text:"Recognition was the #1 gap in our last survey.",date:daysAgo(36)},{author:"Anna B.",text:"Would love this tied into Slack!",date:daysAgo(35)}], savingsLow:8000, savingsHigh:15000, followUpCount:0, followUpLog:[], followUpHistory:[] },
  { id:"TEC-2026-0310-055", title:"Replace Email-Based Purchase Approvals with Power App", type:"technology", stage:"implemented", valueStatement:"A Power App cuts purchase cycle time from 5 days to same-day, eliminating lost email chains.", currentState:"Purchase approvals managed via email chains frequently get lost. Average cycle time is 5 business days.", futureState:"Power App routes requests to correct approver with automated reminders and full audit trail.", hardBenefits:[{item:"Approval follow-up time saved",low:3800,high:5200,unit:"$/yr"},{item:"Delayed purchase cost reduction",low:2000,high:4000,unit:"$/yr"}], softBenefits:["Full audit trail","Faster procurement"], nextSteps:["Monitor adoption","Expand scope"], submitter:"Robert Kim", submitterEmail:"robert.kim@company.com", assignedTo:"Robert Kim", assignedEmail:"robert.kim@company.com", department:"Finance", date:daysAgo(10), lastUpdated:daysAgo(10), simulatedDays:10, likes:44, comments:1, saves:22, commentList:[{author:"Michelle P.",text:"Already live and working great. Saved us hours this week.",date:daysAgo(8)}], savingsLow:5800, savingsHigh:9200, followUpCount:0, followUpLog:[], followUpHistory:[] },
  { id:"PRC-2026-0112-031", title:"Centralize Vendor Contract Renewal Tracking", type:"process", stage:"thought", valueStatement:"A centralized contract tracker prevents surprise renewals and saves $20K+ annually.", currentState:"Vendor contracts tracked individually in separate spreadsheets or not at all.", futureState:"Shared contract register with automated 90/60/30 day renewal alerts.", hardBenefits:[{item:"Avoided auto-renewal waste",low:12000,high:28000,unit:"$/yr"}], softBenefits:["Budget predictability","Legal risk reduction"], nextSteps:["Audit contracts","Build SharePoint tracker"], submitter:"Patricia Moore", submitterEmail:"patricia.m@company.com", assignedTo:"Operations Lead", assignedEmail:"ops@company.com", department:"Operations", date:daysAgo(65), lastUpdated:daysAgo(65), simulatedDays:65, likes:15, comments:1, saves:9, commentList:[{author:"Greg T.",text:"We just got hit with a $4K auto-renewal. This is critical.",date:daysAgo(64)}], savingsLow:12000, savingsHigh:28000, followUpCount:2, followUpLog:[{attempt:1,date:daysAgo(35),response:null,summary:null,respondedBy:null},{attempt:2,date:daysAgo(5),response:null,summary:null,respondedBy:null}], followUpHistory:[] }
];

const SAMPLE_CSV = `Idea Title,Submitter Email,Department,Brief Description,Idea Type
Automate Weekly Status Reports,sarah.jones@company.com,Marketing,We manually compile weekly status reports from 5 tools every Friday. Takes 2 hours of copy-paste work.,technology
Reduce Meeting Overload,david.park@company.com,Engineering,Too many recurring meetings with no clear agenda. Team spends 40% of time in meetings that could be emails.,culture
Streamline Invoice Processing,linda.wu@company.com,Finance,Invoice approval goes through 3 people via email. Often gets lost and delays vendor payments causing late fees.,process`;

// ── SMALL COMPONENTS ──────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{display:"flex",gap:4,alignItems:"center",padding:"2px 0"}}>
      {[0,1,2].map(i => <div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.gray,animation:`td 1.2s ${i*0.2}s infinite ease-in-out`}}/>)}
      <style>{`@keyframes td{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-5px)}}`}</style>
    </div>
  );
}

function StageBadge({ stage }) {
  const m = {
    thought:[C.amber,"💭 Thought"], progress:[C.green,"🔄 In Progress"],
    implemented:[C.gold,"✅ Implemented"], archived:["#666","🗄️ Archived"],
    pending:[C.ice,"⏳ Pending"], "follow-up":[C.purple,"🔔 Follow-up Due"]
  };
  const [col, label] = m[stage] || m.thought;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:600,background:`${col}25`,border:`1px solid ${col}55`,color:col}}>
      {label}
    </span>
  );
}

function Toast({ icon, msg, type="success" }) {
  return (
    <div style={{position:"fixed",bottom:24,right:24,background:C.navyMid,border:`1px solid ${type==="error"?"rgba(240,92,92,0.4)":"rgba(45,212,160,0.35)"}`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.white,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",zIndex:999,animation:"su .4s cubic-bezier(.34,1.56,.64,1) both",maxWidth:340}}>
      <style>{`@keyframes su{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <span style={{fontSize:18}}>{icon}</span>
      <span>{msg}</span>
    </div>
  );
}

function IdeaThumbnailImg({ idea, size="card", editable=false, onUpload }) {
  const h = size==="card" ? 130 : 200;
  const src = idea.thumbnail || generateThumbnailSvg(idea.type, idea.title);
  const fileRef = useRef(null);
  function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onUpload && onUpload(ev.target.result);
    reader.readAsDataURL(file);
  }
  return (
    <div style={{position:"relative",width:"100%",height:h,borderRadius:size==="card"?"14px 14px 0 0":12,overflow:"hidden",flexShrink:0}}>
      <img src={src} alt={idea.title} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      <div style={{position:"absolute",top:10,left:10}}>
        <span style={{fontSize:10,fontWeight:600,color:TYPE_COLORS[idea.type]||C.gold,background:"rgba(11,22,40,0.85)",border:`1px solid ${TYPE_COLORS[idea.type]||C.gold}55`,padding:"2px 9px",borderRadius:20}}>
          {TYPE_ICONS[idea.type]||"💡"} {(TYPE_LABELS[idea.type]||"Idea").split(" / ")[0]}
        </span>
      </div>
      <div style={{position:"absolute",top:10,right:10}}><StageBadge stage={idea.stage}/></div>
      {idea.followUpCount > 0 && !["archived","implemented","pending"].includes(idea.stage) && (
        <div style={{position:"absolute",bottom:10,right:10,background:"rgba(167,139,250,0.9)",border:"1px solid rgba(167,139,250,0.5)",borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:600,color:C.white}}>
          🔔 {idea.followUpCount}/2
        </div>
      )}
      {editable && (
        <>
          <div onClick={() => fileRef.current?.click()}
            style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"background 0.2s"}}
            onMouseEnter={e => { e.currentTarget.style.background="rgba(11,22,40,0.65)"; e.currentTarget.querySelector(".el").style.opacity="1"; }}
            onMouseLeave={e => { e.currentTarget.style.background="rgba(11,22,40,0)"; e.currentTarget.querySelector(".el").style.opacity="0"; }}>
            <div className="el" style={{opacity:0,transition:"opacity 0.2s",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <div style={{width:40,height:40,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📷</div>
              <span style={{fontSize:11,fontWeight:600,color:C.white}}>Upload Image</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
        </>
      )}
    </div>
  );
}

function Header({ view, onNav, staleCount }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 20px",borderBottom:"1px solid rgba(212,168,67,0.15)",background:"rgba(11,22,40,0.98)",position:"sticky",top:0,zIndex:50,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:34,height:34,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:C.navy,boxShadow:`0 2px 12px ${C.gold}55`}}>I</div>
        <span style={{fontSize:18,fontWeight:700,color:C.white,letterSpacing:-0.5}}>Idea<span style={{color:C.gold}}>Forge</span></span>
        <span style={{fontSize:9,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gold,background:"rgba(212,168,67,0.12)",border:"1px solid rgba(212,168,67,0.28)",padding:"3px 8px",borderRadius:20}}>AI-Powered</span>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[
          ["feed","💡 Feed"],
          ["submit","+ Submit"],
          ["import","📥 Import"],
          ["staleness", staleCount > 0 ? `🔔 Staleness (${staleCount})` : "🔔 Staleness"],
          ["dashboard","Dashboard"]
        ].map(([key, label]) => (
          <button key={key} onClick={() => onNav(key)}
            style={{padding:"7px 13px",borderRadius:7,fontSize:12,fontWeight:key==="submit"?600:500,cursor:"pointer",fontFamily:"inherit",border:view===key?"none":key==="submit"?"none":"1px solid rgba(255,255,255,0.12)",background:key==="submit"?`linear-gradient(135deg,${C.gold},${C.goldLight})`:key==="staleness"&&staleCount>0?"rgba(167,139,250,0.15)":view===key?"rgba(212,168,67,0.15)":"rgba(255,255,255,0.05)",color:key==="submit"?C.navy:key==="staleness"&&staleCount>0?C.purple:view===key?C.gold:C.ice}}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function IdeaCard({ idea, onOpen, onLike, onSave, likedIds, savedIds }) {
  const isLiked = likedIds.has(idea.id);
  const isSaved = savedIds.has(idea.id);
  const tot = (idea.hardBenefits||[]).reduce((a,b) => ({low:a.low+b.low,high:a.high+b.high}), {low:idea.savingsLow||0,high:idea.savingsHigh||0});
  const isArchived = idea.stage === "archived";
  return (
    <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${isArchived?"rgba(255,255,255,0.04)":idea.followUpCount>0&&idea.stage!=="implemented"?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.08)"}`,borderRadius:16,overflow:"hidden",transition:"all 0.22s",cursor:"pointer",display:"flex",flexDirection:"column",opacity:isArchived?0.55:1}}
      onMouseEnter={e => { if(!isArchived){e.currentTarget.style.borderColor="rgba(212,168,67,0.35)";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.3)";} }}
      onMouseLeave={e => { e.currentTarget.style.borderColor=isArchived?"rgba(255,255,255,0.04)":idea.followUpCount>0&&idea.stage!=="implemented"?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.08)";e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"; }}>
      <div onClick={() => onOpen(idea)}><IdeaThumbnailImg idea={idea} size="card"/></div>
      <div style={{padding:"14px 16px",flex:1,display:"flex",flexDirection:"column"}} onClick={() => onOpen(idea)}>
        <div style={{fontSize:11,color:C.gray,marginBottom:5}}>{idea.submitter} · {idea.department} · {idea.date}</div>
        <div style={{fontSize:14,fontWeight:700,color:C.white,lineHeight:1.3,marginBottom:7,flex:1}}>{idea.title}</div>
        {isArchived
          ? <div style={{fontSize:11,color:"#888",fontStyle:"italic"}}>🗄️ Archived — {idea.archivedReason||"No updates after 2 follow-up attempts"}</div>
          : idea.stage === "pending"
            ? <div style={{fontSize:11,color:C.ice,background:"rgba(200,216,240,0.1)",border:"1px solid rgba(200,216,240,0.2)",borderRadius:6,padding:"4px 8px"}}>⏳ Outreach sent — awaiting AI development</div>
            : <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(45,212,160,0.1)",border:"1px solid rgba(45,212,160,0.2)",borderRadius:8,padding:"4px 10px"}}>
                <span style={{fontSize:10,color:C.gray}}>Est. Savings</span>
                <span style={{fontSize:11,color:C.green,fontFamily:"monospace",fontWeight:600}}>${tot.low.toLocaleString()}–${tot.high.toLocaleString()}/yr</span>
              </div>
        }
      </div>
      <div style={{display:"flex",alignItems:"center",padding:"10px 16px 12px",borderTop:"1px solid rgba(255,255,255,0.05)",gap:2}} onClick={e => e.stopPropagation()}>
        <button onClick={() => onLike(idea.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:8,border:"none",background:isLiked?"rgba(212,168,67,0.15)":"transparent",color:isLiked?C.gold:C.gray,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:isLiked?600:400}}>👍 {idea.likes+(isLiked?1:0)}</button>
        <button onClick={() => onOpen(idea)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:8,border:"none",background:"transparent",color:C.gray,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>💬 {idea.comments}</button>
        <button onClick={() => navigator.clipboard?.writeText(`IdeaForge — ${idea.title} (${idea.id})`).catch(()=>{})} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:8,border:"none",background:"transparent",color:C.gray,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>↗️</button>
        <button onClick={() => onSave(idea.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:8,border:"none",background:isSaved?"rgba(200,216,240,0.12)":"transparent",color:isSaved?C.ice:C.gray,cursor:"pointer",fontSize:12,fontFamily:"inherit",marginLeft:"auto"}}>🔖 {isSaved?"Saved":"Save"}</button>
      </div>
    </div>
  );
}

function IdeaDetail({ idea, onClose, onLike, onSave, likedIds, savedIds, onAddComment, onUpdateThumbnail, onTriggerFollowUp, currentUser }) {
  const [comment, setComment] = useState("");
  const isLiked = likedIds.has(idea.id);
  const isSaved = savedIds.has(idea.id);
  const tot = (idea.hardBenefits||[]).reduce((a,b) => ({low:a.low+b.low,high:a.high+b.high}), {low:idea.savingsLow||0,high:idea.savingsHigh||0});
  const canFollowUp = idea.simulatedDays>=30 && idea.followUpCount<2 && !["archived","implemented","pending"].includes(idea.stage);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(11,22,40,0.92)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"24px 16px"}} onClick={onClose}>
      <div style={{background:C.navyMid,border:`1px solid ${idea.followUpCount>0?"rgba(167,139,250,0.25)":"rgba(212,168,67,0.2)"}`,borderRadius:18,maxWidth:700,width:"100%",boxShadow:"0 16px 64px rgba(0,0,0,0.6)",animation:"mi .3s ease both"}} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes mi{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <IdeaThumbnailImg idea={idea} size="detail" editable={true} onUpload={url => onUpdateThumbnail(idea.id, url)}/>
        <div style={{padding:"20px 22px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,fontFamily:"monospace",color:C.gold,letterSpacing:1,marginBottom:5}}>{idea.id} · {idea.department}</div>
              <h2 style={{fontSize:"clamp(15px,2.5vw,20px)",fontWeight:700,color:C.white,lineHeight:1.25,margin:0}}>{idea.title}</h2>
              <div style={{fontSize:11,color:C.gray,marginTop:5}}>{idea.submitter} · Assigned: {idea.assignedTo||"Unassigned"} · {idea.simulatedDays} days since last update</div>
            </div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",color:C.gray,cursor:"pointer",width:32,height:32,borderRadius:8,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
          </div>

          {canFollowUp && (
            <div style={{background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:10,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.purple,marginBottom:2}}>🔔 No update in {idea.simulatedDays} days</div>
                <div style={{fontSize:11,color:C.gray}}>Follow-up attempt {idea.followUpCount+1} of 2 ready to send.</div>
              </div>
              <button onClick={() => onTriggerFollowUp(idea.id)} style={{padding:"8px 14px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:C.white,fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Send Follow-Up</button>
            </div>
          )}

          {idea.stage === "archived" && (
            <div style={{background:"rgba(102,102,102,0.1)",border:"1px solid rgba(102,102,102,0.3)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:"#aaa",marginBottom:4}}>🗄️ This idea has been archived</div>
              <div style={{fontSize:12,color:C.gray}}>{idea.archivedReason}</div>
            </div>
          )}

          {idea.followUpLog?.length > 0 && (
            <div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:10,padding:14,marginBottom:14}}>
              <div style={{fontSize:9,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.purple,marginBottom:10}}>🔔 Follow-Up History</div>
              {idea.followUpLog.map((log, i) => (
                <div key={i} style={{padding:"8px 0",borderBottom:"1px solid rgba(167,139,250,0.1)",display:"flex",gap:10}}>
                  <div style={{width:20,height:20,background:"rgba(167,139,250,0.2)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:C.purple,flexShrink:0,marginTop:1}}>{log.attempt}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:C.gray,marginBottom:3}}>{log.date} · Attempt {log.attempt}</div>
                    {log.response
                      ? <><div style={{fontSize:12,color:C.ice,lineHeight:1.5}}>{log.response}</div><div style={{fontSize:11,color:C.green,marginTop:3}}>✓ {log.summary}</div></>
                      : <div style={{fontSize:12,color:"#888",fontStyle:"italic"}}>No response received</div>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}

          {idea.stage !== "pending" && idea.valueStatement && (
            <>
              <div style={{background:"rgba(212,168,67,0.08)",border:"1px solid rgba(212,168,67,0.18)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
                <div style={{fontSize:9,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gold,marginBottom:4}}>Value Statement</div>
                <p style={{fontSize:13,color:C.white,lineHeight:1.7,margin:0,fontStyle:"italic"}}>"{idea.valueStatement}"</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:12}}>
                {[["⚠️ Current State",idea.currentState],["✅ Future State",idea.futureState]].map(([label,text]) => (
                  <div key={label} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:13}}>
                    <div style={{fontSize:9,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.gold,marginBottom:7}}>{label}</div>
                    <p style={{fontSize:12,color:C.ice,lineHeight:1.7,margin:0}}>{text}</p>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:14}}>
                <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:13}}>
                  <div style={{fontSize:9,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.gold,marginBottom:7}}>💰 Est. Annual Savings</div>
                  <div style={{fontSize:20,fontWeight:700,color:C.green,fontFamily:"monospace"}}>${tot.low.toLocaleString()}–${tot.high.toLocaleString()}</div>
                </div>
                <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:13}}>
                  <div style={{fontSize:9,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.gold,marginBottom:7}}>🔵 Soft Benefits</div>
                  {(idea.softBenefits||[]).map((s,i) => <div key={i} style={{fontSize:11,color:C.ice,padding:"2px 0"}}>· {s}</div>)}
                </div>
              </div>
            </>
          )}

          {idea.stage === "pending" && (
            <div style={{background:"rgba(200,216,240,0.08)",border:"1px solid rgba(200,216,240,0.2)",borderRadius:12,padding:20,marginBottom:14,textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:10}}>⏳</div>
              <div style={{fontSize:14,fontWeight:600,color:C.white,marginBottom:8}}>Awaiting AI Development</div>
              <div style={{fontSize:13,color:C.ice,lineHeight:1.7,marginBottom:14}}>Outreach email sent to <strong style={{color:C.gold}}>{idea.submitterEmail}</strong> to complete the AI intake conversation.</div>
              {idea.briefDescription && <div style={{background:"rgba(11,22,40,0.5)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 14px",textAlign:"left"}}><div style={{fontSize:9,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gold,marginBottom:6}}>Imported Description</div><p style={{fontSize:13,color:C.ice,lineHeight:1.65,margin:0,fontStyle:"italic"}}>"{idea.briefDescription}"</p></div>}
            </div>
          )}

          <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
            {[
              [() => onLike(idea.id), `👍 ${idea.likes+(isLiked?1:0)} Likes`, isLiked?C.gold:null],
              [() => onSave(idea.id), isSaved?"🔖 Saved":"🔖 Save", isSaved?C.ice:null],
              [() => navigator.clipboard?.writeText(`IdeaForge — ${idea.title}`).catch(()=>{}), "↗️ Share", null]
            ].map(([fn,label,active], i) => (
              <button key={i} onClick={fn} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:9,border:`1px solid ${active?active+"55":"rgba(255,255,255,0.12)"}`,background:active?`${active}18`:"rgba(255,255,255,0.05)",color:active||C.ice,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:active?600:400}}>{label}</button>
            ))}
          </div>

          <div style={{fontSize:13,fontWeight:600,color:C.white,marginBottom:12}}>💬 Comments ({idea.commentList?.length||0})</div>
          <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:14}}>
            {(idea.commentList||[]).map((c,i) => (
              <div key={i} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"11px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:C.gold}}>{c.author}</span><span style={{fontSize:11,color:C.gray}}>{c.date}</span></div>
                <p style={{fontSize:12,color:C.ice,lineHeight:1.65,margin:0}}>{c.text}</p>
              </div>
            ))}
            {(!idea.commentList||idea.commentList.length===0) && <div style={{textAlign:"center",padding:"14px 0",color:C.gray,fontSize:12}}>No comments yet — be the first.</div>}
          </div>
          <div style={{display:"flex",gap:9,alignItems:"flex-end"}}>
            <div style={{width:30,height:30,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:C.navy,flexShrink:0}}>{currentUser.charAt(0)}</div>
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" rows={2}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(comment.trim()){onAddComment(idea.id,comment.trim());setComment("");}} }}
              style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,padding:"10px 13px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5}}/>
            <button onClick={() => { if(comment.trim()){onAddComment(idea.id,comment.trim());setComment("");} }} disabled={!comment.trim()}
              style={{padding:"10px 16px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,color:C.navy,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",opacity:comment.trim()?1:0.4}}>Post</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowUpEmailPreview({ idea, attemptNum, onClose, onOpenChat }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(11,22,40,0.9)",backdropFilter:"blur(8px)",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={onClose}>
      <div style={{background:C.navyMid,border:"1px solid rgba(167,139,250,0.3)",borderRadius:18,maxWidth:600,width:"100%",boxShadow:"0 16px 64px rgba(0,0,0,0.6)",animation:"mi .3s ease both",overflow:"hidden"}} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes mi{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{height:4,background:"linear-gradient(90deg,#A78BFA,#7C3AED)"}}/>
        <div style={{padding:"22px 24px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,background:"linear-gradient(135deg,#A78BFA,#7C3AED)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📧</div>
              <div><div style={{fontSize:14,fontWeight:600,color:C.white}}>Follow-Up Email Sent</div><div style={{fontSize:11,color:C.purple}}>Attempt {attemptNum} of 2 · {idea.title.slice(0,40)}{idea.title.length>40?"…":""}</div></div>
            </div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",color:C.gray,cursor:"pointer",width:30,height:30,borderRadius:7,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
          <div style={{background:"rgba(11,22,40,0.6)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:18,marginBottom:18}}>
            <div style={{display:"grid",gridTemplateColumns:"60px 1fr",gap:"6px 12px",marginBottom:14,fontSize:12}}>
              <span style={{color:C.gray}}>To:</span><span style={{color:C.white}}>{idea.submitterEmail}, {idea.assignedEmail}</span>
              <span style={{color:C.gray}}>Subject:</span><span style={{color:C.white}}>{attemptNum===2?"⚠️ Final notice":"Update needed"}: "{idea.title.slice(0,35)}{idea.title.length>35?"…":""}"</span>
              <span style={{color:C.gray}}>From:</span><span style={{color:C.gold}}>IdeaForge AI &lt;noreply@ideaforge.ai&gt;</span>
            </div>
            <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:14,color:C.ice,lineHeight:1.85,fontSize:13}}>
              Hi {idea.submitter.split(" ")[0]},<br/><br/>
              {attemptNum===2
                ? <><strong style={{color:C.red}}>Final follow-up:</strong> Your idea <em style={{color:C.gold}}>"{idea.title}"</em> hasn't had an update in {idea.simulatedDays} days. If we don't hear back, it will be automatically archived. You can always restore it later.</>
                : <>Your idea <em style={{color:C.gold}}>"{idea.title}"</em> hasn't had an update in {idea.simulatedDays} days. Our AI has a quick question — it takes less than 2 minutes.</>
              }<br/><br/>
              <div style={{textAlign:"center",marginTop:8}}>
                <button onClick={onOpenChat} style={{display:"inline-flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:C.white,fontWeight:600,fontSize:13,padding:"10px 22px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                  🔔 Update My Idea Now →
                </button>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={onClose} style={{padding:"9px 18px",borderRadius:8,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:C.ice,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
            <button onClick={onOpenChat} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:C.white,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Open AI Follow-Up →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowUpModal({ idea, attemptNum, onClose, onComplete }) {
  const [msgs, setMsgs] = useState([]);
  const [hist, setHist] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState("");
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs, typing]);

  useEffect(() => {
    const init = [{role:"user",content:`[SYSTEM]: ${buildFollowUpPrompt(idea,attemptNum)}\n\nBegin now.`}];
    setHist(init); setTyping(true);
    callClaude(init).then(txt => {
      setHist([...init,{role:"assistant",content:txt}]);
      setMsgs([{role:"ai",text:txt}]);
      setTyping(false);
    }).catch(() => {
      setMsgs([{role:"ai",text:`Hi ${idea.submitter.split(" ")[0]}! Just checking in on "${idea.title}" — it's been ${idea.simulatedDays} days since the last update. What's the current status?`}]);
      setTyping(false);
    });
  }, []);

  async function send() {
    const text = input.trim(); if(!text||typing||done) return;
    setInput("");
    setMsgs(m => [...m,{role:"user",text}]);
    const nh = [...hist,{role:"user",content:text}]; setHist(nh); setTyping(true);
    const sum = await generateSummary(idea.title, text);
    setSummary(sum);
    try {
      const closing = await callClaude([...nh,{role:"user",content:"[Give a brief warm thank-you closing, 1-2 sentences, confirming the update was logged.]"}]);
      setMsgs(m => [...m,{role:"ai",text:closing}]);
    } catch {
      setMsgs(m => [...m,{role:"ai",text:"Thank you for the update! I've logged your response and the idea record has been refreshed."}]);
    }
    setTyping(false); setDone(true);
    setTimeout(() => onComplete(text, sum), 2200);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(11,22,40,0.92)",backdropFilter:"blur(8px)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={onClose}>
      <div style={{background:C.navyMid,border:"1px solid rgba(167,139,250,0.3)",borderRadius:18,maxWidth:580,width:"100%",boxShadow:"0 16px 64px rgba(0,0,0,0.6)",animation:"mi .3s ease both",overflow:"hidden"}} onClick={e => e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(167,139,250,0.2)",background:"rgba(167,139,250,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,background:"linear-gradient(135deg,#A78BFA,#7C3AED)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>🔔</div>
            <div><div style={{fontSize:13,fontWeight:600,color:C.white}}>30-Day Follow-Up · Attempt {attemptNum} of 2</div><div style={{fontSize:11,color:C.purple}}>{idea.title.slice(0,45)}{idea.title.length>45?"…":""}</div></div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.08)",border:"none",color:C.gray,cursor:"pointer",width:30,height:30,borderRadius:7,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{height:300,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
          {msgs.map((msg,i) => (
            <div key={i} style={{display:"flex",gap:9,flexDirection:msg.role==="user"?"row-reverse":"row",animation:"fi .25s ease both"}}>
              <style>{`@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
              <div style={{width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,fontWeight:700,background:msg.role==="ai"?"linear-gradient(135deg,#A78BFA,#7C3AED)":"rgba(255,255,255,0.1)",color:C.white}}>{msg.role==="ai"?"🔔":"ME"}</div>
              <div style={{maxWidth:"80%",padding:"10px 14px",borderRadius:13,fontSize:13,lineHeight:1.65,background:msg.role==="ai"?"rgba(167,139,250,0.1)":"rgba(212,168,67,0.14)",border:`1px solid ${msg.role==="ai"?"rgba(167,139,250,0.25)":"rgba(212,168,67,0.28)"}`,color:msg.role==="ai"?C.ice:C.white,borderTopLeftRadius:msg.role==="ai"?3:13,borderTopRightRadius:msg.role==="user"?3:13}}>{msg.text}</div>
            </div>
          ))}
          {typing && <div style={{display:"flex",gap:9}}><div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#A78BFA,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>🔔</div><div style={{padding:"10px 14px",borderRadius:13,background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.25)",borderTopLeftRadius:3}}><TypingDots/></div></div>}
          {done && summary && <div style={{background:"rgba(45,212,160,0.1)",border:"1px solid rgba(45,212,160,0.25)",borderRadius:10,padding:"10px 14px",fontSize:12,color:C.green}}><strong>✓ Update logged:</strong> {summary}</div>}
          <div ref={endRef}/>
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(167,139,250,0.15)",display:"flex",gap:9,alignItems:"flex-end",background:"rgba(255,255,255,0.02)"}}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={done?"Update logged — closing…":"Type your update here…"} rows={1} disabled={typing||done}
            style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:9,padding:"10px 13px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,opacity:done?0.4:1}}/>
          <button onClick={send} disabled={typing||!input.trim()||done}
            style={{width:40,height:40,background:"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:(typing||!input.trim()||done)?0.35:1}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function StalenessView({ ideas, onTriggerFollowUp, onSimulateDays, onArchive }) {
  const card = (extra={}) => ({background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:16,...extra});
  const sLabel = {fontSize:9,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.gold,marginBottom:12};
  const active = ideas.filter(i => !["archived","implemented","pending"].includes(i.stage));
  const stale = active.filter(i => i.simulatedDays>=30 && i.followUpCount<2);
  const nearStale = active.filter(i => i.simulatedDays>=20 && i.simulatedDays<30);
  const readyToArchive = active.filter(i => i.followUpCount>=2 && i.followUpLog.filter(l=>!l.response).length>=2);
  const archived = ideas.filter(i => i.stage==="archived");

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"26px 16px 80px"}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:9,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:5}}>Idea Health Monitor</div>
        <div style={{fontSize:26,fontWeight:800,letterSpacing:-0.5}}>Staleness & Follow-Up Center</div>
        <p style={{fontSize:13,color:C.gray,marginTop:6,lineHeight:1.7}}>Ideas without updates for 30+ days trigger automated follow-up emails. After 2 unanswered attempts, ideas are automatically archived.</p>
      </div>

      <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.25)",borderRadius:14,padding:20,marginBottom:22}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
          <div><div style={{fontSize:13,fontWeight:600,color:C.white,marginBottom:4}}>⏱️ Time Simulator</div><div style={{fontSize:12,color:C.gray}}>Fast-forward to demonstrate the 30-day staleness trigger.</div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["+ 5 days",5],["+ 15 days",15],["+ 30 days",30],["Reset",0]].map(([label,days]) => (
              <button key={label} onClick={() => onSimulateDays(days)}
                style={{padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"none",background:days===0?"rgba(240,92,92,0.15)":days===30?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.08)",color:days===0?C.red:days===30?C.purple:C.ice}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
        {[{label:"Active Ideas",val:active.length,accent:C.gold,icon:"💡"},{label:"Stale (30+ days)",val:stale.length,accent:C.amber,icon:"⚠️"},{label:"Follow-Ups Sent",val:ideas.reduce((s,i)=>s+i.followUpCount,0),accent:C.purple,icon:"🔔"},{label:"Archived",val:archived.length,accent:"#666",icon:"🗄️"}].map(({label,val,accent,icon}) => (
          <div key={label} style={{...card(),borderBottom:`2px solid ${accent}`,textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:6}}>{icon}</div>
            <div style={{fontSize:9,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gray,marginBottom:5}}>{label}</div>
            <div style={{fontSize:28,fontWeight:800,color:C.white}}>{val}</div>
          </div>
        ))}
      </div>

      {readyToArchive.length > 0 && (
        <div style={{background:"rgba(240,92,92,0.08)",border:"1px solid rgba(240,92,92,0.3)",borderRadius:14,padding:18,marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:600,color:C.red,marginBottom:12}}>⚠️ {readyToArchive.length} idea{readyToArchive.length!==1?"s":""} ready to archive — 2 unanswered follow-ups</div>
          {readyToArchive.map(idea => (
            <div key={idea.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(240,92,92,0.1)"}}>
              <img src={idea.thumbnail||generateThumbnailSvg(idea.type,idea.title)} alt="" style={{width:44,height:33,borderRadius:7,objectFit:"cover",flexShrink:0}}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.white}}>{idea.title}</div><div style={{fontSize:11,color:C.gray}}>{idea.submitter} · {idea.simulatedDays} days · 2 attempts unanswered</div></div>
              <button onClick={() => onArchive(idea.id)} style={{padding:"7px 14px",borderRadius:8,border:"none",background:"rgba(240,92,92,0.2)",color:C.red,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Archive Now</button>
            </div>
          ))}
        </div>
      )}

      <div style={{...card(),marginBottom:16}}>
        <div style={sLabel}>🔔 Stale Ideas — Follow-Up Required ({stale.length})</div>
        {stale.length === 0
          ? <div style={{textAlign:"center",padding:"20px 0",color:C.gray,fontSize:13}}>No stale ideas — all current.</div>
          : stale.map(idea => (
            <div key={idea.id} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <img src={idea.thumbnail||generateThumbnailSvg(idea.type,idea.title)} alt="" style={{width:48,height:36,borderRadius:8,objectFit:"cover",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.white,marginBottom:2}}>{idea.title}</div>
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.amber}}>⚠️ {idea.simulatedDays} days since last update</span>
                  <span style={{fontSize:11,color:C.gray}}>· {idea.submitter} · {idea.followUpCount}/2 sent</span>
                </div>
                {idea.followUpLog.filter(l=>l.response).length > 0 && <div style={{fontSize:11,color:C.green,marginTop:3}}>✓ Last: {idea.followUpLog.filter(l=>l.response).slice(-1)[0]?.summary}</div>}
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0,alignItems:"center"}}>
                <StageBadge stage={idea.stage}/>
                <button onClick={() => onTriggerFollowUp(idea.id)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid rgba(167,139,250,0.35)",background:"rgba(167,139,250,0.12)",color:C.purple,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🔔 Follow-Up</button>
              </div>
            </div>
          ))
        }
      </div>

      {nearStale.length > 0 && (
        <div style={{...card(),marginBottom:16}}>
          <div style={sLabel}>⏰ Approaching 30 Days ({nearStale.length})</div>
          {nearStale.map(idea => (
            <div key={idea.id} style={{display:"flex",alignItems:"center",gap:13,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <img src={idea.thumbnail||generateThumbnailSvg(idea.type,idea.title)} alt="" style={{width:40,height:30,borderRadius:7,objectFit:"cover",flexShrink:0}}/>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,color:C.white}}>{idea.title}</div><div style={{fontSize:11,color:C.gray}}>{idea.simulatedDays} days · {30-idea.simulatedDays} days until follow-up</div></div>
              <div style={{width:80,height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(idea.simulatedDays/30)*100}%`,height:"100%",background:`linear-gradient(90deg,${C.green},${C.amber})`,borderRadius:3}}/></div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div style={card()}>
          <div style={sLabel}>🗄️ Archived ({archived.length})</div>
          {archived.map(idea => (
            <div key={idea.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <img src={idea.thumbnail||generateThumbnailSvg(idea.type,idea.title)} alt="" style={{width:40,height:30,borderRadius:7,objectFit:"cover",flexShrink:0,opacity:0.5}}/>
              <div style={{flex:1,opacity:0.7}}><div style={{fontSize:13,fontWeight:500,color:C.white}}>{idea.title}</div><div style={{fontSize:11,color:C.gray}}>{idea.archivedReason||"Archived after 2 unanswered follow-ups"}</div></div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <StageBadge stage="archived"/>
                <button onClick={() => onArchive(idea.id,true)} style={{padding:"5px 11px",borderRadius:7,border:"1px solid rgba(45,212,160,0.3)",background:"rgba(45,212,160,0.08)",color:C.green,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Restore</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportView({ onImport, showToast }) {
  const [step, setStep] = useState("upload");
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [sentCount, setSentCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  function parseCSV(text) {
    const lines = text.trim().split("\n"); if(lines.length<2) return [];
    const headers = lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,"").toLowerCase().replace(/ /g,"_"));
    return lines.slice(1).map((line,idx) => {
      const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)||[];
      const row = {}; headers.forEach((h,i)=>{row[h]=(vals[i]||"").trim().replace(/^"|"$/g,"");});
      const title=row.idea_title||row.title||""; const email=row.submitter_email||row.email||"";
      const dept=row.department||""; const desc=row.brief_description||row.description||"";
      const typeRaw=(row.idea_type||row.type||"").toLowerCase();
      const type=typeRaw.includes("tech")||typeRaw.includes("auto")?"technology":typeRaw.includes("cult")||typeRaw.includes("people")?"culture":"process";
      return {_idx:idx,title,email,dept,desc,type,valid:!!(title&&email)};
    }).filter(r=>r.title||r.email);
  }

  function handleFile(file) {
    if(!file||!file.name.endsWith(".csv")){showToast("❌","Please upload a CSV file","error");return;}
    const reader=new FileReader(); reader.onload=e=>{const rows=parseCSV(e.target.result);if(rows.length===0){showToast("❌","No valid rows found","error");return;}setParsedRows(rows);setSelectedRows(new Set(rows.filter(r=>r.valid).map(r=>r._idx)));setStep("preview");}; reader.readAsText(file);
  }

  function downloadSample(){const blob=new Blob([SAMPLE_CSV],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ideaforge_template.csv";a.click();URL.revokeObjectURL(url);showToast("⬇️","Template downloaded!");}

  async function sendOutreach() {
    setStep("sending"); setSentCount(0);
    const toSend=parsedRows.filter(r=>selectedRows.has(r._idx)&&r.valid);
    const imported=[];
    for(let i=0;i<toSend.length;i++){
      const row=toSend[i]; await new Promise(res=>setTimeout(res,600));
      const p={process:"PRC",technology:"TEC",culture:"CUL"}[row.type];
      const d=new Date();
      const id=`${p}-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.floor(Math.random()*900)+100}`;
      imported.push({id,title:row.title,type:row.type,stage:"pending",submitter:row.email.split("@")[0].replace(/\./g," ").replace(/\b\w/g,c=>c.toUpperCase()),submitterEmail:row.email,assignedTo:"Unassigned",assignedEmail:row.email,department:row.dept,briefDescription:row.desc,date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),lastUpdated:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),simulatedDays:0,likes:0,comments:0,saves:0,commentList:[],savingsLow:0,savingsHigh:0,hardBenefits:[],softBenefits:[],valueStatement:"",currentState:"",futureState:"",nextSteps:[],followUpCount:0,followUpLog:[],followUpHistory:[]});
      setSentCount(i+1);
    }
    onImport(imported); setStep("done");
  }

  if(step==="upload") return (
    <div style={{maxWidth:780,margin:"0 auto",padding:"32px 16px 80px"}}>
      <div style={{marginBottom:28}}><div style={{fontSize:9,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:5}}>Bulk Import</div><div style={{fontSize:26,fontWeight:800,letterSpacing:-0.5}}>Import Existing Ideas</div><p style={{fontSize:14,color:C.gray,marginTop:8,lineHeight:1.7}}>Upload a CSV and IdeaForge will create draft records and send each submitter an AI intake invitation.</p></div>
      <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${dragOver?"rgba(212,168,67,0.6)":"rgba(255,255,255,0.15)"}`,borderRadius:18,padding:"48px 24px",textAlign:"center",cursor:"pointer",background:dragOver?"rgba(212,168,67,0.06)":"rgba(255,255,255,0.02)",transition:"all 0.2s",marginBottom:20}}>
        <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
        <div style={{fontSize:40,marginBottom:14}}>📥</div><div style={{fontSize:16,fontWeight:600,color:C.white,marginBottom:8}}>Drop your CSV file here</div><div style={{fontSize:13,color:C.gray,marginBottom:20}}>or click to browse</div>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,color:C.navy,fontWeight:600,fontSize:13,padding:"10px 22px",borderRadius:9}}>Choose CSV File</div>
      </div>
      <div style={{background:"rgba(212,168,67,0.06)",border:"1px solid rgba(212,168,67,0.2)",borderRadius:14,padding:18,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
        <div><div style={{fontSize:13,fontWeight:600,color:C.white,marginBottom:4}}>📄 Need a template?</div><div style={{fontSize:12,color:C.gray}}>Download our CSV with sample data.</div></div>
        <button onClick={downloadSample} style={{padding:"9px 18px",borderRadius:9,border:"1px solid rgba(212,168,67,0.4)",background:"rgba(212,168,67,0.1)",color:C.gold,fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>⬇️ Download Template</button>
      </div>
    </div>
  );

  if(step==="preview") return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"32px 16px 80px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,gap:16,flexWrap:"wrap"}}>
        <div><div style={{fontSize:9,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:5}}>Review Import</div><div style={{fontSize:24,fontWeight:800,letterSpacing:-0.5}}>Preview & Confirm</div><div style={{fontSize:13,color:C.gray,marginTop:6}}>{parsedRows.length} ideas found · {selectedRows.size} selected</div></div>
        <div style={{display:"flex",gap:9}}><button onClick={()=>{setStep("upload");setParsedRows([]);}} style={{padding:"9px 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:C.ice,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Back</button><button onClick={sendOutreach} disabled={selectedRows.size===0} style={{padding:"9px 20px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,color:C.navy,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",opacity:selectedRows.size===0?0.4:1}}>Send Outreach to {selectedRows.size} →</button></div>
      </div>
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"40px 1fr 180px 130px 90px 70px",padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)"}}>
          {["","Title","Email","Dept","Type","Status"].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gray}}>{h}</div>)}
        </div>
        {parsedRows.map(row=>(
          <div key={row._idx} style={{display:"grid",gridTemplateColumns:"40px 1fr 180px 130px 90px 70px",padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)",alignItems:"center",background:!row.valid?"rgba(240,92,92,0.04)":"transparent"}}>
            <div onClick={()=>{if(!row.valid)return;setSelectedRows(prev=>{const n=new Set(prev);n.has(row._idx)?n.delete(row._idx):n.add(row._idx);return n;});}} style={{width:18,height:18,borderRadius:5,border:`2px solid ${selectedRows.has(row._idx)?C.gold:"rgba(255,255,255,0.2)"}`,background:selectedRows.has(row._idx)?C.gold:"transparent",cursor:row.valid?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.navy,fontWeight:700}}>{selectedRows.has(row._idx)?"✓":""}</div>
            <div><div style={{fontSize:13,fontWeight:500,color:row.title?C.white:C.red}}>{row.title||"⚠️ Missing"}</div>{row.desc&&<div style={{fontSize:11,color:C.gray,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:200}}>{row.desc}</div>}</div>
            <div style={{fontSize:11,color:row.email?C.ice:C.red,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis"}}>{row.email||"⚠️"}</div>
            <div style={{fontSize:12,color:C.gray}}>{row.dept||"—"}</div>
            <div><span style={{fontSize:10,fontWeight:600,color:TYPE_COLORS[row.type],background:`${TYPE_COLORS[row.type]}18`,padding:"2px 8px",borderRadius:20}}>{TYPE_ICONS[row.type]} {row.type}</span></div>
            <div>{row.valid?<span style={{fontSize:10,color:C.green}}>✓ Ready</span>:<span style={{fontSize:10,color:C.red}}>⚠️ Error</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );

  if(step==="sending"){const toSend=parsedRows.filter(r=>selectedRows.has(r._idx)&&r.valid);return(<div style={{maxWidth:600,margin:"0 auto",padding:"80px 16px",textAlign:"center"}}><div style={{fontSize:40,marginBottom:20}}>✉️</div><div style={{fontSize:20,fontWeight:700,color:C.white,marginBottom:10}}>Sending outreach emails…</div><div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,padding:24,marginTop:32}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:10,fontSize:13}}><span style={{color:C.gray}}>Progress</span><span style={{color:C.gold,fontFamily:"monospace"}}>{sentCount}/{toSend.length}</span></div><div style={{height:8,background:"rgba(255,255,255,0.08)",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",background:`linear-gradient(90deg,${C.gold},${C.green})`,borderRadius:4,width:`${(sentCount/toSend.length)*100}%`,transition:"width 0.4s"}}/></div></div></div>);}

  if(step==="done"){const sent=parsedRows.filter(r=>selectedRows.has(r._idx)&&r.valid);return(<div style={{maxWidth:600,margin:"0 auto",padding:"80px 16px",textAlign:"center"}}><div style={{width:72,height:72,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 24px",boxShadow:`0 4px 24px ${C.gold}55`}}>✓</div><div style={{fontSize:22,fontWeight:800,color:C.white,marginBottom:10}}>Import Complete!</div><div style={{fontSize:14,color:C.gray,marginBottom:32,lineHeight:1.7}}>{sent.length} idea{sent.length!==1?"s":""} imported and outreach sent.</div><button onClick={()=>window.dispatchEvent(new CustomEvent("navToFeed"))} style={{padding:"10px 22px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,color:C.navy,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>View in Feed →</button></div>);}
  return null;
}

// ── MAIN APP ──────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("feed");
  const [ideas, setIdeas] = useState(SEED_IDEAS.map(i => ({...i, thumbnail:generateThumbnailSvg(i.type,i.title)})));
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [feedFilter, setFeedFilter] = useState("popular");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState(null);
  const [followUpTarget, setFollowUpTarget] = useState(null);
  const [followUpChatIdea, setFollowUpChatIdea] = useState(null);

  const [selType, setSelType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [ideaId, setIdeaId] = useState("");
  const [stage, setStage] = useState("thought");
  const [record, setRecord] = useState(null);
  const [sideData, setSideData] = useState({benefits:[],facts:[]});
  const [showStage, setShowStage] = useState(false);
  const [chatStep, setChatStep] = useState("type");
  const apiKeyMissing = false;
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, isTyping]);
  useEffect(() => { const h=()=>setView("feed"); window.addEventListener("navToFeed",h); return()=>window.removeEventListener("navToFeed",h); }, []);

  function showToast(icon,msg,type="success"){setToast({icon,msg,type});setTimeout(()=>setToast(null),3500);}
  function genId(type){const p={process:"PRC",technology:"TEC",culture:"CUL"}[type];const d=new Date();return`${p}-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.floor(Math.random()*900)+100}`;}
  function toggleLike(id){setLikedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});if(!likedIds.has(id))showToast("👍","Liked!");}
  function toggleSave(id){setSavedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});showToast(savedIds.has(id)?"🔖":"🔖",savedIds.has(id)?"Removed":"Saved!");}
  function addComment(ideaId,text){const c={author:"You",text,date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})};setIdeas(prev=>prev.map(i=>i.id!==ideaId?i:{...i,comments:i.comments+1,commentList:[...(i.commentList||[]),c]}));if(selectedIdea?.id===ideaId)setSelectedIdea(prev=>({...prev,comments:prev.comments+1,commentList:[...(prev.commentList||[]),c]}));showToast("💬","Comment posted!");}
  function updateThumbnail(ideaId,url){setIdeas(prev=>prev.map(i=>i.id!==ideaId?i:{...i,thumbnail:url}));if(selectedIdea?.id===ideaId)setSelectedIdea(prev=>({...prev,thumbnail:url}));showToast("📷","Thumbnail updated!");}
  function handleImport(imported){setIdeas(prev=>[...imported,...prev]);showToast("✅",`${imported.length} idea${imported.length!==1?"s":""} imported!`);}

  function simulateDays(days){
    if(days===0){setIdeas(prev=>prev.map(i=>{const seed=SEED_IDEAS.find(s=>s.id===i.id);return seed?{...i,simulatedDays:seed.simulatedDays}:i;}));showToast("⏱️","Time reset");return;}
    setIdeas(prev=>prev.map(i=>["archived","implemented","pending"].includes(i.stage)?i:{...i,simulatedDays:i.simulatedDays+days}));
    showToast("⏱️",`Fast-forwarded +${days} days`);
  }

  function triggerFollowUp(ideaId){
    const idea=ideas.find(i=>i.id===ideaId); if(!idea||idea.followUpCount>=2) return;
    const attempt=idea.followUpCount+1;
    setIdeas(prev=>prev.map(i=>{if(i.id!==ideaId)return i;const newLog=[...i.followUpLog,{attempt,date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),response:null,summary:null,respondedBy:null}];return{...i,followUpCount:attempt,followUpLog:newLog};}));
    if(selectedIdea?.id===ideaId)setSelectedIdea(prev=>{const newLog=[...prev.followUpLog,{attempt,date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),response:null,summary:null,respondedBy:null}];return{...prev,followUpCount:attempt,followUpLog:newLog};});
    setFollowUpTarget({idea:{...ideas.find(i=>i.id===ideaId),followUpCount:attempt},attemptNum:attempt});
    showToast("🔔",`Follow-up email sent (Attempt ${attempt} of 2)`);
  }

  function handleFollowUpComplete(ideaId,response,summary){
    const date=new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
    setIdeas(prev=>prev.map(i=>{if(i.id!==ideaId)return i;const newLog=i.followUpLog.map((l,idx)=>idx===i.followUpLog.length-1?{...l,response,summary,respondedBy:"You",date}:l);return{...i,followUpLog:newLog,lastUpdated:date,simulatedDays:0};}));
    setFollowUpChatIdea(null);
    showToast("✅","Follow-up logged and idea updated!");
  }

  function archiveIdea(ideaId,restore=false){
    const idea=ideas.find(i=>i.id===ideaId); if(!idea) return;
    if(restore){setIdeas(prev=>prev.map(i=>i.id!==ideaId?i:{...i,stage:"thought",archivedReason:null}));showToast("🔄","Idea restored!");}
    else{const unanswered=idea.followUpLog.filter(l=>!l.response).length;const reason=`Archived after ${unanswered} unanswered follow-up attempt${unanswered!==1?"s":""} over ${idea.simulatedDays} days.`;setIdeas(prev=>prev.map(i=>i.id!==ideaId?i:{...i,stage:"archived",archivedReason:reason}));if(selectedIdea?.id===ideaId)setSelectedIdea(null);showToast("🗄️","Idea archived. Can be restored anytime.");}
  }

  async function startChat(type){
    
    setSelType(type);const id=genId(type);setIdeaId(id);setMessages([]);setHistory([]);setRecord(null);setSideData({benefits:[],facts:[]});setShowStage(false);setStage("thought");setChatStep("chat");setIsTyping(true);
    const init=[{role:"user",content:`[SYSTEM]: ${buildSystemPrompt(type)}\n\nBegin now.`}];setHistory(init);
    try {
  const txt = await callClaude(init);
  console.log("AI first response:", txt, typeof txt);
  setHistory([...init, { role: "assistant", content: txt }]);
  processAI(txt);
}
    catch (e) {
  setMessages([{ role: "ai", text: `⚠️ ${getErrorMessage(e)}` }]);
}
    setIsTyping(false);
  }

  function processAI(txt) {
  const safeText =
    typeof txt === "string"
      ? txt
      : txt && typeof txt === "object"
        ? JSON.stringify(txt)
        : String(txt);

  const m = safeText.match(/<RECORD>([\s\S]*?)<\/RECORD>/);

  if (m) {
    try {
      const r = JSON.parse(m[1]);
      setRecord(r);
      setSideData({
        benefits: r.hardBenefits || [],
        facts: r.capturedFacts || []
      });

      const displayText = safeText.replace(/<RECORD>[\s\S]*?<\/RECORD>/, "").trim();
      if (displayText) {
        setMessages(p => [...p, { role: "ai", text: displayText }]);
      }

      setShowStage(true);
      return;
    } catch (e) {
      console.error("Failed to parse RECORD JSON:", e, m[1]);
    }
  }

  const displayText = safeText.replace(/<RECORD>[\s\S]*?<\/RECORD>/, "").trim();
  if (displayText) {
    setMessages(p => [...p, { role: "ai", text: displayText }]);
  }
}

  async function sendMessage(){
    const text=inputVal.trim();if(!text||isTyping)return;
    setInputVal("");setMessages(m=>[...m,{role:"user",text}]);
    const nh=[...history,{role:"user",content:text}];setHistory(nh);setIsTyping(true);
    try{const txt=await callClaude(nh);setHistory([...nh,{role:"assistant",content:txt}]);processAI(txt);}
    catch (e) {
  setMessages([{ role: "ai", text: `⚠️ ${getErrorMessage(e)}` }]);
}
    setIsTyping(false);inputRef.current?.focus();
  }

  function confirmStage(s){
    setStage(s);setShowStage(false);
    setMessages(m=>[...m,{role:"user",text:`Stage: ${{thought:"Just a Thought",progress:"In Progress",implemented:"Implemented"}[s]}`}]);
    if(record){
      const tot=(record.hardBenefits||[]).reduce((a,b)=>({low:a.low+b.low,high:a.high+b.high}),{low:0,high:0});
      const newIdea={id:ideaId,title:record.title,type:selType,stage:s,valueStatement:record.valueStatement,currentState:record.currentState,futureState:record.futureState,hardBenefits:record.hardBenefits||[],softBenefits:record.softBenefits||[],nextSteps:record.nextSteps||[],submitter:"You",submitterEmail:"you@company.com",assignedTo:"You",assignedEmail:"you@company.com",department:"Your Department",date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),lastUpdated:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),simulatedDays:0,likes:0,comments:0,saves:0,commentList:[],savingsLow:tot.low,savingsHigh:tot.high,thumbnail:generateThumbnailSvg(selType,record.title),followUpCount:0,followUpLog:[],followUpHistory:[]};
      setIdeas(prev=>[newIdea,...prev]);showToast("✅","Idea published to the feed!");setChatStep("type");setView("feed");
    }
  }

  function handleKey(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}

  const msgCount=history.filter(h=>h.role==="assistant").length;
  const totalSavings=ideas.filter(i=>i.stage!=="pending").reduce((s,i)=>s+Math.round((i.savingsLow+i.savingsHigh)/2),0);
  const staleCount=ideas.filter(i=>!["archived","implemented","pending"].includes(i.stage)&&i.simulatedDays>=30&&i.followUpCount<2).length;
  const filteredIdeas=ideas.filter(i=>typeFilter==="all"||i.type===typeFilter).filter(i=>!searchQuery||i.title.toLowerCase().includes(searchQuery.toLowerCase())||i.submitter?.toLowerCase().includes(searchQuery.toLowerCase())).sort((a,b)=>{if(feedFilter==="popular")return(b.likes+(likedIds.has(b.id)?1:0))-(a.likes+(likedIds.has(a.id)?1:0));if(feedFilter==="value")return((b.savingsHigh||0)+(b.savingsLow||0))-((a.savingsHigh||0)+(a.savingsLow||0));return 0;});

  const card=(extra={})=>({background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:16,...extra});
  const sLabel={fontSize:9,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",color:C.gold,marginBottom:12};
  const chatInputStyle={flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:9,padding:"10px 13px",color:C.white,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5};

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:C.navy,minHeight:"100vh",color:C.white}}>
      <Header view={view} onNav={v=>{setView(v);if(v==="submit")setChatStep("type");}} staleCount={staleCount}/>

      

      {/* FEED */}
      {view==="feed" && (
        <div style={{maxWidth:980,margin:"0 auto",padding:"24px 16px 80px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12}}>
            <div><div style={{fontSize:9,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:4}}>Innovation Community</div><div style={{fontSize:24,fontWeight:800,letterSpacing:-0.5}}>Idea Feed</div></div>
            <div style={{display:"flex",gap:9,alignItems:"center"}}>
              {staleCount>0&&<div style={{background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:8,padding:"7px 12px",fontSize:12,color:C.purple,fontWeight:600,cursor:"pointer"}} onClick={()=>setView("staleness")}>🔔 {staleCount} stale</div>}
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="🔍 Search ideas…" style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"8px 13px",color:C.white,fontSize:12,fontFamily:"inherit",outline:"none",width:170}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:18,flexWrap:"wrap"}}>
            {[["popular","🔥 Popular"],["value","💰 Top Value"]].map(([key,label])=>(<button key={key} onClick={()=>setFeedFilter(key)} style={{padding:"6px 13px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",border:feedFilter===key?"none":"1px solid rgba(255,255,255,0.1)",background:feedFilter===key?`linear-gradient(135deg,${C.gold},${C.goldLight})`:"rgba(255,255,255,0.05)",color:feedFilter===key?C.navy:C.ice}}>{label}</button>))}
            <div style={{width:1,background:"rgba(255,255,255,0.1)",margin:"0 4px"}}/>
            {[["all","All"],["process","⚙️ Process"],["technology","💡 Tech"],["culture","🤝 Culture"]].map(([key,label])=>(<button key={key} onClick={()=>setTypeFilter(key)} style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${typeFilter===key?(TYPE_COLORS[key]||C.gold):"rgba(255,255,255,0.1)"}`,background:typeFilter===key?`${TYPE_COLORS[key]||C.gold}18`:"rgba(255,255,255,0.04)",color:typeFilter===key?(TYPE_COLORS[key]||C.gold):C.gray}}>{label}</button>))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:22}}>
            {[{label:"Total Ideas",val:ideas.length,accent:C.gold},{label:"Est. Savings",val:`$${totalSavings>=1000?(totalSavings/1000).toFixed(0)+"K":totalSavings}`,accent:C.green},{label:"Stale / Follow-Up",val:staleCount,accent:C.purple},{label:"Archived",val:ideas.filter(i=>i.stage==="archived").length,accent:"#555"}].map(({label,val,accent})=>(<div key={label} style={{...card(),borderBottom:`2px solid ${accent}`,textAlign:"center"}}><div style={{fontSize:9,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gray,marginBottom:6}}>{label}</div><div style={{fontSize:22,fontWeight:800,color:C.white}}>{val}</div></div>))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:16}}>
            {filteredIdeas.map(idea=>(<IdeaCard key={idea.id} idea={idea} onOpen={setSelectedIdea} onLike={toggleLike} onSave={toggleSave} likedIds={likedIds} savedIds={savedIds}/>))}
            {filteredIdeas.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"48px 0",color:C.gray}}><div style={{fontSize:32,marginBottom:12}}>💡</div><div>No ideas match your filter.</div></div>}
          </div>
        </div>
      )}

      {/* SUBMIT */}
      {view==="submit" && (
        <div style={{maxWidth:1020,margin:"0 auto",padding:"24px 16px 80px"}}>
          {chatStep==="type" && (
            <div style={{textAlign:"center",padding:"40px 0 36px"}}>
              <div style={{fontSize:9,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:14}}>AI-Powered Intake</div>
              <h1 style={{fontSize:"clamp(22px,4vw,38px)",fontWeight:800,lineHeight:1.15,marginBottom:14,letterSpacing:-1}}>What kind of idea do you have?</h1>
              
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,maxWidth:680,margin:"0 auto"}}>
                {[{type:"process",icon:"⚙️",bg:"rgba(212,168,67,0.1)",title:"Process Improvement",desc:"Streamline workflows, reduce manual steps."},{type:"technology",icon:"💡",bg:"rgba(45,212,160,0.1)",title:"Technology / Automation",desc:"Replace manual work with apps or digital tools."},{type:"culture",icon:"🤝",bg:"rgba(200,216,240,0.1)",title:"Culture / People",desc:"Improve engagement, training, or collaboration."}].map(({type,icon,bg,title,desc})=>(
                  <div key={type} onClick={()=>startChat(type)} onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(212,168,67,0.5)";e.currentTarget.style.transform="translateY(-3px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.09)";e.currentTarget.style.transform="none";}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"22px 18px",cursor:"pointer",textAlign:"left",transition:"all 0.22s"}}>
                    <div style={{width:42,height:42,borderRadius:11,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,marginBottom:14}}>{icon}</div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:7,color:C.white}}>{title}</div>
                    <div style={{fontSize:12,color:C.gray,lineHeight:1.65}}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {chatStep==="chat" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:16}}>
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,display:"flex",flexDirection:"column",height:575,overflow:"hidden"}}>
                <div style={{padding:"13px 17px",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.02)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:C.navy,fontWeight:700}}>✦</div><div><div style={{fontSize:13,fontWeight:600,color:C.white}}>IdeaForge AI</div><div style={{fontSize:11,color:C.gray}}>Building your {TYPE_LABELS[selType]} record</div></div></div>
                  <div style={{display:"flex",gap:5}}>{[0,1,2,3,4,5].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",transition:"all 0.3s",background:i<msgCount?C.green:i===msgCount?C.gold:"rgba(255,255,255,0.15)",transform:i===msgCount?"scale(1.4)":"none"}}/>)}</div>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
                  {messages.map((msg,i)=>(<div key={i} style={{display:"flex",gap:9,flexDirection:msg.role==="user"?"row-reverse":"row",animation:"fi .25s ease both"}}><style>{`@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style><div style={{width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:msg.role==="ai"?12:9,flexShrink:0,fontWeight:700,background:msg.role==="ai"?`linear-gradient(135deg,${C.gold},${C.goldLight})`:"rgba(255,255,255,0.1)",color:msg.role==="ai"?C.navy:C.ice}}>{msg.role==="ai"?"✦":"ME"}</div><div style={{maxWidth:"80%",padding:"10px 14px",borderRadius:13,fontSize:13,lineHeight:1.65,background:msg.role==="ai"?"rgba(255,255,255,0.06)":"rgba(212,168,67,0.14)",border:`1px solid ${msg.role==="ai"?"rgba(255,255,255,0.08)":"rgba(212,168,67,0.28)"}`,color:msg.role==="ai"?C.ice:C.white,borderTopLeftRadius:msg.role==="ai"?3:13,borderTopRightRadius:msg.role==="user"?3:13}}>{msg.text}</div></div>))}
                  {isTyping&&<div style={{display:"flex",gap:9}}><div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,color:C.navy,fontWeight:700}}>✦</div><div style={{padding:"10px 14px",borderRadius:13,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderTopLeftRadius:3}}><TypingDots/></div></div>}
                  {showStage&&!isTyping&&(<div style={{paddingLeft:37,display:"flex",gap:7,flexWrap:"wrap",marginTop:4}}>{[[C.amber,"thought","💭 Just a Thought"],[C.green,"progress","🔄 In Progress"],[C.gold,"implemented","✅ Implemented"]].map(([col,s,label])=>(<button key={s} onClick={()=>confirmStage(s)} style={{padding:"8px 13px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${col}45`,background:`${col}20`,color:col,fontFamily:"inherit"}}>{label}</button>))}</div>)}
                  <div ref={endRef}/>
                </div>
                <div style={{padding:"12px 14px",borderTop:"1px solid rgba(255,255,255,0.07)",display:"flex",gap:9,alignItems:"flex-end",background:"rgba(255,255,255,0.02)"}}>
                  <textarea ref={inputRef} value={inputVal} onChange={e=>setInputVal(e.target.value)} onKeyDown={handleKey} placeholder={showStage?"Select a stage above…":"Type your response…"} rows={1} disabled={isTyping||showStage} style={{...chatInputStyle,opacity:showStage?0.4:1}}/>
                  <button onClick={sendMessage} disabled={isTyping||!inputVal.trim()||showStage} style={{width:40,height:40,background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,border:"none",borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:(isTyping||!inputVal.trim()||showStage)?0.35:1}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:13}}>
                {selType&&<div style={card()}><div style={sLabel}>Thumbnail Preview</div><div style={{borderRadius:10,overflow:"hidden",marginBottom:8}}><img src={generateThumbnailSvg(selType,record?.title||"")} alt="" style={{width:"100%",height:90,objectFit:"cover"}}/></div><div style={{fontSize:10,color:C.gray}}>Auto-generated · upload custom after submit</div></div>}
                <div style={card()}><div style={sLabel}>Idea Profile</div>{[["ID",ideaId],["Type",TYPE_LABELS[selType]?.split(" / ")[0]],["Date",new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})]].map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:11}}><span style={{color:C.gray}}>{l}</span><span style={{color:C.white,fontFamily:"monospace",fontSize:10}}>{v}</span></div>))}<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:11}}><span style={{color:C.gray}}>Stage</span><StageBadge stage={stage}/></div></div>
                <div style={card()}><div style={sLabel}>Benefit Estimate</div>{sideData.benefits.length?(<>{sideData.benefits.map((b,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:11,gap:8}}><span style={{color:C.gray,flex:1,lineHeight:1.4}}>{b.item}</span><span style={{color:C.green,fontFamily:"monospace",fontSize:10,whiteSpace:"nowrap"}}>${b.low.toLocaleString()}–${b.high.toLocaleString()}</span></div>)}<div style={{display:"flex",justifyContent:"space-between",padding:"9px 0 0",fontSize:12,fontWeight:600}}><span style={{color:C.white}}>Total/yr</span><span style={{color:C.gold,fontFamily:"monospace"}}>${sideData.benefits.reduce((a,b)=>a+b.low,0).toLocaleString()}–${sideData.benefits.reduce((a,b)=>a+b.high,0).toLocaleString()}</span></div></>):<div style={{textAlign:"center",padding:"14px 0",color:C.gray,fontSize:11}}>📊 Estimates appear as we learn more.</div>}</div>
                <div style={card()}><div style={sLabel}>Captured So Far</div>{sideData.facts.length?sideData.facts.slice(0,5).map((f,i)=><div key={i} style={{fontSize:11,color:C.ice,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",lineHeight:1.5}}>✓ {f}</div>):<div style={{textAlign:"center",padding:"14px 0",color:C.gray,fontSize:11}}>📝 Key details captured here.</div>}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* IMPORT */}
      {view==="import" && <ImportView onImport={handleImport} showToast={showToast}/>}

      {/* STALENESS */}
      {view==="staleness" && <StalenessView ideas={ideas} onTriggerFollowUp={triggerFollowUp} onSimulateDays={simulateDays} onArchive={archiveIdea}/>}

      {/* DASHBOARD */}
      {view==="dashboard" && (
        <div style={{maxWidth:900,margin:"0 auto",padding:"26px 16px 80px"}}>
          <div style={{marginBottom:22}}><div style={{fontSize:9,fontWeight:600,letterSpacing:2,textTransform:"uppercase",color:C.gold,marginBottom:5}}>Innovation Portfolio</div><div style={{fontSize:27,fontWeight:800,letterSpacing:-0.5}}>Program Dashboard</div></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:13,marginBottom:18}}>
            {[{label:"Total Ideas",val:ideas.length,sub:"All ideas",accent:C.gold},{label:"Est. Annual Savings",val:totalSavings>=1000?`$${(totalSavings/1000).toFixed(1)}K`:`$${totalSavings}`,sub:"Hard cost",accent:C.green},{label:"Stale / Follow-Up",val:staleCount,sub:"Need attention",accent:C.purple},{label:"Archived",val:ideas.filter(i=>i.stage==="archived").length,sub:"Restorable",accent:"#555"}].map(({label,val,sub,accent})=>(<div key={label} style={{...card(),borderBottom:`2px solid ${accent}`}}><div style={{fontSize:9,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:C.gray,marginBottom:8}}>{label}</div><div style={{fontSize:29,fontWeight:800,lineHeight:1,marginBottom:4,color:C.white}}>{val}</div><div style={{fontSize:11,color:C.gray}}>{sub}</div></div>))}
          </div>
          <div style={{...card(),marginBottom:16}}>
            <div style={sLabel}>🔥 Top Ideas by Engagement</div>
            {[...ideas].filter(i=>i.stage!=="pending").sort((a,b)=>(b.likes+(likedIds.has(b.id)?1:0))-(a.likes+(likedIds.has(a.id)?1:0))).slice(0,5).map(idea=>(<div key={idea.id} onClick={()=>setSelectedIdea(idea)} style={{display:"flex",alignItems:"center",gap:13,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}><img src={idea.thumbnail||generateThumbnailSvg(idea.type,idea.title)} alt="" style={{width:48,height:36,borderRadius:8,objectFit:"cover",flexShrink:0}}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:C.white,marginBottom:2}}>{idea.title}</div><div style={{fontSize:11,color:C.gray}}>{idea.submitter} · {idea.department}</div></div><div style={{display:"flex",gap:12,flexShrink:0,fontSize:12,color:C.gray,alignItems:"center"}}><span>👍 {idea.likes+(likedIds.has(idea.id)?1:0)}</span><span>💬 {idea.comments}</span><span style={{color:C.green,fontFamily:"monospace",fontSize:11}}>${((idea.savingsLow+idea.savingsHigh)/2/1000).toFixed(0)}K</span><StageBadge stage={idea.stage}/></div></div>))}
          </div>
          <div style={card()}>
            <div style={sLabel}>🔖 Saved Ideas ({savedIds.size})</div>
            {savedIds.size?ideas.filter(i=>savedIds.has(i.id)).map(idea=>(<div key={idea.id} onClick={()=>setSelectedIdea(idea)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}><img src={idea.thumbnail||generateThumbnailSvg(idea.type,idea.title)} alt="" style={{width:40,height:30,borderRadius:7,objectFit:"cover",flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.white}}>{idea.title}</div><div style={{fontSize:11,color:C.gray}}>{idea.department}</div></div><StageBadge stage={idea.stage}/></div>)):<div style={{textAlign:"center",padding:"20px 0",color:C.gray,fontSize:12}}>No saved ideas yet.</div>}
          </div>
        </div>
      )}

      {/* MODALS */}
      {selectedIdea && <IdeaDetail idea={selectedIdea} onClose={()=>setSelectedIdea(null)} onLike={toggleLike} onSave={toggleSave} likedIds={likedIds} savedIds={savedIds} onAddComment={addComment} onUpdateThumbnail={updateThumbnail} onTriggerFollowUp={triggerFollowUp} currentUser="You"/>}

      {followUpTarget && !followUpChatIdea && (
        <FollowUpEmailPreview
          idea={followUpTarget.idea}
          attemptNum={followUpTarget.attemptNum}
          onClose={()=>setFollowUpTarget(null)}
          onOpenChat={()=>{setFollowUpChatIdea(followUpTarget);setFollowUpTarget(null);}}
        />
      )}

      {followUpChatIdea && (
        <FollowUpModal
          idea={followUpChatIdea.idea}
          attemptNum={followUpChatIdea.attemptNum}
          onClose={()=>setFollowUpChatIdea(null)}
          onComplete={(response,summary)=>handleFollowUpComplete(followUpChatIdea.idea.id,response,summary)}
        />
      )}

      {toast && <Toast {...toast}/>}
    </div>
  );
}
