// Collect faculty from ASU's public directory for the departments below.
// Run:  node scrape_faculty.js      Output: data/faculty.json
const https = require("https");
const fs = require("fs");
const path = require("path");

const DEPARTMENTS = {
  "1661": "School of Computing and Augmented Intelligence",
  "1715": "Department of Information Systems",
  "239927": "Data Science and Analytics",
  "35493": "Information Technology, The Polytechnic School",
};
// Titles that don't hire students (emeritus, staff with faculty titles).
const SKIP_TITLES = /emerit|retired|dean\b|director of|staff/i;

function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "search.asu.edu", path, method: "GET",
      headers: {
        "Accept": "application/json",
        "Referer": "https://faculty.engineering.asu.edu/",
        "Origin": "https://faculty.engineering.asu.edu",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error: " + data.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Map research text to a research area
function categorize(text) {
  const t = (text || "").toLowerCase();
  if (/robot|autonomous|drone|uav|swarm|control|actuator/.test(t))
    return { category: "Robotics and Autonomous Systems", categoryKey: "robotics" };
  if (/machine learning|deep learning|neural network|reinforcement|llm|language model|generative|nlp|natural language/.test(t))
    return { category: "AI and Machine Learning", categoryKey: "ai_ml" };
  if (/artificial intelligence|planning|reasoning|knowledge|expert system|cognitive/.test(t))
    return { category: "Artificial Intelligence", categoryKey: "ai" };
  if (/computer vision|image|visual|3d reconstruction|point cloud|rendering/.test(t))
    return { category: "Computer Vision and Graphics", categoryKey: "vision" };
  if (/security|privacy|cryptograph|cyber|vulnerabil|malware|intrusion|forensic/.test(t))
    return { category: "Security and Privacy", categoryKey: "security" };
  if (/network|distributed|cloud|edge|internet of things|iot|wireless|5g|protocol/.test(t))
    return { category: "Networks and Distributed Systems", categoryKey: "networks" };
  if (/data science|analytics|business intelligence|information systems|statistic/.test(t))
    return { category: "Data Science and Analytics", categoryKey: "data" };
  if (/database|data management|query|sql|nosql|big data|data warehouse/.test(t))
    return { category: "Data Management and Databases", categoryKey: "databases" };
  if (/human.computer|hci|user interface|usability|accessibility|interaction design/.test(t))
    return { category: "Human-Computer Interaction", categoryKey: "hci" };
  if (/software engineer|testing|verification|formal method|program analysis|compil/.test(t))
    return { category: "Software Engineering", categoryKey: "software_eng" };
  if (/algorithm|complexity|graph theory|combinatorial|optimization|theoretical/.test(t))
    return { category: "Theory and Algorithms", categoryKey: "theory" };
  if (/bioinformatics|computational biology|genomic|health informatics|medical/.test(t))
    return { category: "Bioinformatics and Health", categoryKey: "bioinformatics" };
  if (/architecture|vlsi|fpga|embedded|hardware|chip|circuit/.test(t))
    return { category: "Computer Architecture and Hardware", categoryKey: "architecture" };
  if (/simulation|modeling|scientific computing|hpc|high performance/.test(t))
    return { category: "Simulation and HPC", categoryKey: "simulation" };
  return { category: "Computer Science and Engineering", categoryKey: "cse_general" };
}

async function fetchDepartment(deptId) {
  const params = new URLSearchParams({
    dept_ids: deptId,
    employee_types: "Faculty,Faculty w/Admin Appointment",
    size: "300",
  });
  const json = await get("/api/v1/webdir-profiles/faculty-staff/filtered?" + params.toString());
  return json.results || [];
}

async function main() {
  const seen = new Set();
  const faculty = [];
  for (const [deptId, deptName] of Object.entries(DEPARTMENTS)) {
    const results = await fetchDepartment(deptId);
    let added = 0;
    for (const p of results) {
      const name = p.display_name?.raw || "";
      const email = (p.email_address?.raw || "").trim();
      const titles = p.primary_title?.raw || p.titles?.raw || [];
      const title = Array.isArray(titles) ? titles[0] || "" : titles;
      if (!name || !email || seen.has(email.toLowerCase()) || SKIP_TITLES.test(title)) continue;
      seen.add(email.toLowerCase());
      const research = [
        stripHtml(p.research_interests?.raw || ""),
        p.short_bio?.raw || "",
        (p.expertise_areas?.raw || []).join(", "),
        stripHtml(p.bio?.raw || "").slice(0, 300),
      ].filter(Boolean).join(" | ").slice(0, 800);
      const eid = p.eid?.raw || "";
      faculty.push({
        name, email, title, department: deptName, research, ...categorize(research),
        profileUrl: eid ? `https://search.asu.edu/profile/${eid}` : null,
        website: p.website?.raw || null,
      });
      added++;
    }
    console.log(`${deptName}: ${added} faculty`);
  }
  faculty.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(__dirname, "data", "faculty.json"), JSON.stringify(faculty, null, 2));
  const byArea = {};
  faculty.forEach(f => byArea[f.category] = (byArea[f.category] || 0) + 1);
  console.log(`\nSaved ${faculty.length} faculty to data/faculty.json`);
  Object.entries(byArea).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}  ${k}`));
}

main().catch(err => { console.error(err); process.exit(1); });
