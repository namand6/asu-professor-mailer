// Write one personalised email per professor in data/faculty.json.
// Uses data/topics.json for the line about their research ("" = talk about their
// courses instead, "skip" = don't email them).
//
// Run:  node generate_templates.js      Output: data/email_templates.json

const fs = require("fs");
const path = require("path");

const profilePath = path.join(__dirname, "profile.json");
if (!fs.existsSync(profilePath)) {
  console.error("profile.json is missing: copy profile.example.json to profile.json and fill in your details.");
  process.exit(1);
}
const ME = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
const CV = ME.cv;
// What from your background fits each research area (profile.json "background").
const BACKGROUND = { ...ME.background };
BACKGROUND.cse_general = BACKGROUND.cse_general || BACKGROUND.default;
for (const key of ["bioinformatics", "architecture", "simulation"]) BACKGROUND[key] = BACKGROUND[key] || BACKGROUND.cse_general;

// The research topic is a better guide than the directory's category.
const TOPIC_AREAS = [
  [/database|query|data management|data integration|warehous/i, "databases"],
  [/secur|crypt|privacy|vulnerab|forensic|hacking|censorship|reverse engineering|binary/i, "security"],
  [/llm|language|nlp|agent|reasoning|knowledge|planning|explainab|trustworthy ai|human-ai/i, "ai"],
  [/analytic|data mining|data science|business|visualiz|statistic|data-driven/i, "data"],
  [/robot|haptic|swarm|programmable matter/i, "robotics"],
  [/vision|imaging|visual/i, "vision"],
  [/network|distributed|cloud|blockchain|iot|wireless/i, "networks"],
  [/software|program analysis|devops|compiler/i, "software_eng"],
  [/machine learning|neural|deep learning|reinforcement/i, "ai_ml"],
];

function area(prof, topic) {
  const match = TOPIC_AREAS.find(([re]) => re.test(topic || ""));
  return match ? match[1] : prof.categoryKey;
}

const TEACHING_TITLE = /teaching|instructor|lecturer|clinical|practice|faculty associate/i;

function lastName(name) {
  const parts = name.replace(/\(.*?\)/g, " ").replace(/'[^']*'/g, " ").trim().split(/\s+/);
  return parts[parts.length - 1];
}

// Small, stable variation so two professors in the same lab don't get identical text.
function pick(options, key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

function build(prof, topic) {
  // No title in the directory: go by whether they list research.
  const teaching = prof.title ? TEACHING_TITLE.test(prof.title) : !topic;
  const cvKind = (ME.data_cv_departments || []).includes(prof.department) ? "data" : teaching ? "teaching" : "research";
  const roles = teaching
    ? "grader, TA or IA openings in your courses"
    : "research assistant or project openings in your group, or grader and TA positions";
  const when = ME.when;

  const subject = teaching
    ? pick([
        `Grader / TA / IA for your courses, ${ME.term_label} (${ME.short_title})`,
        `${ME.short_title} interested in grading or TA work in your courses`,
      ], prof.email)
    : pick([
        `${ME.short_title} interested in research and grader roles in your group`,
        `RA / project / grader opportunities, ${ME.term_label} (${ME.short_title})`,
      ], prof.email);

  const gpa = ME.gpa ? ` (GPA ${ME.gpa})` : "";
  const opener = pick([
    `I'm ${ME.name}, an ${ME.program} student at ${ME.university_short}${gpa}, and I'm writing to ask whether you have any ${roles} ${when}.`,
    `My name is ${ME.name}, and I'm an ${ME.program} student at ${ME.university_short}${gpa}. I'd like to ask whether you have any ${roles} ${when}.`,
  ], prof.email + "o");

  const interest = topic
    ? pick([
        `Your work on ${topic} caught my attention, and it connects with what I have been building.`,
        `I came across your work on ${topic}, which is close to the kind of work I enjoy most.`,
      ], prof.email + "i")
    : "I'd be glad to support the courses you teach, whether that's grading assignments, holding office hours or helping in labs.";

  const extras = ME.extras || "";

  const body = [
    `<p>Dear Professor ${lastName(prof.name)},</p>`,
    `<p>${opener}</p>`,
    `<p>${interest} ${BACKGROUND[area(prof, topic)] || BACKGROUND.cse_general}</p>`,
    `<p>${extras ? extras + " " : ""}I've attached my CV, and I'd be happy to meet briefly or apply through whatever channel you prefer.</p>`,
    `<p>Thank you for your time.</p>`,
    `<p>Best regards,<br/>${ME.name}<br/>${ME.program}, ${ME.university}<br/>` +
      [`<a href="mailto:${ME.email}">${ME.email}</a>`,
       ME.linkedin && `<a href="${ME.linkedin}">LinkedIn</a>`,
       ME.portfolio && `<a href="${ME.portfolio}">Portfolio</a>`].filter(Boolean).join(" | ") + `</p>`,
  ].join("\n");

  return { subject, body, cv: CV[cvKind] };
}

const faculty = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "faculty.json"), "utf-8"));
const topicsPath = path.join(__dirname, "data", "topics.json");
if (!fs.existsSync(topicsPath)) {
  console.error("data/topics.json is missing: copy data/topics.example.json and add a line per professor.");
  process.exit(1);
}
const topics = JSON.parse(fs.readFileSync(topicsPath, "utf-8"));

const TEMPLATES = {};
const counts = {};
for (const prof of faculty) {
  const topic = topics[prof.email];
  if (topic === "skip" || topic === undefined) continue;
  TEMPLATES[prof.email] = build(prof, topic);
  counts[TEMPLATES[prof.email].cv] = (counts[TEMPLATES[prof.email].cv] || 0) + 1;
}

fs.writeFileSync(path.join(__dirname, "data", "email_templates.json"), JSON.stringify(TEMPLATES, null, 2));
console.log(`Wrote ${Object.keys(TEMPLATES).length} emails to data/email_templates.json`);
Object.entries(counts).forEach(([cv, n]) => console.log(`  ${n} with ${cv}`));
