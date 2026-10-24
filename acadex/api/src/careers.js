// Career Guidance engine: a fixed catalogue of paths and a transparent matcher. A match score is built from
// skills you already have (60), interests (30) and CGPA fit (10), so the "why" can always be shown.
// The catalogue is general guidance, not a promise of openings at any named company.

export const PATHS = [
  { id: 'ml-engineer', title: 'Machine Learning Engineer', skills: ['python', 'statistics', 'machine learning', 'pytorch', 'sql'], interests: ['machine learning', 'ai', 'data', 'research', 'deep learning'], minCgpa: 7.5,
    courses: ['Deep Learning Specialisation', 'MLOps Fundamentals', 'Statistics for Data Science'], internships: ['Machine learning or data science intern', 'Research assistant under a faculty member'], projects: ['A classifier on a public dataset with a written error analysis', 'An end-to-end model served behind an API'] },
  { id: 'full-stack', title: 'Full-Stack Developer', skills: ['javascript', 'react', 'node.js', 'sql', 'git'], interests: ['web development', 'web', 'design', 'product', 'startups'], minCgpa: 6.5,
    courses: ['Full-Stack Open', 'System Design Primer', 'Web Performance Basics'], internships: ['Product engineering intern', 'Web developer intern at a startup'], projects: ['A CRUD app with login, a database and deployment', 'A real-time feature such as chat or live notifications'] },
  { id: 'backend', title: 'Backend Developer', skills: ['java', 'sql', 'data structures', 'apis', 'git'], interests: ['backend', 'systems', 'databases', 'scalability'], minCgpa: 7,
    courses: ['Database Internals', 'REST and API Design', 'Distributed Systems Basics'], internships: ['Backend or platform engineering intern'], projects: ['A REST API with authentication, tests and rate limiting', 'A job queue or caching layer for an existing app'] },
  { id: 'data-analyst', title: 'Data Analyst', skills: ['sql', 'excel', 'python', 'statistics', 'data visualisation'], interests: ['data', 'business', 'analytics', 'statistics'], minCgpa: 6.5,
    courses: ['SQL for Analysts', 'Data Visualisation with Python', 'Business Statistics'], internships: ['Business or data analyst intern'], projects: ['A dashboard answering a real question from public data', 'A cleaned dataset with a short analysis report'] },
  { id: 'cloud-devops', title: 'Cloud / DevOps Engineer', skills: ['linux', 'docker', 'aws', 'ci/cd', 'networking'], interests: ['cloud', 'devops', 'infrastructure', 'automation', 'networks'], minCgpa: 6.5,
    courses: ['AWS Cloud Practitioner', 'Kubernetes Basics', 'Linux Administration'], internships: ['Cloud support or DevOps intern'], projects: ['Containerise an app and deploy it with a CI pipeline', 'Infrastructure written as code for a small stack'] },
  { id: 'security', title: 'Cybersecurity Analyst', skills: ['networking', 'linux', 'python', 'cryptography', 'security'], interests: ['security', 'cybersecurity', 'ethical hacking', 'networks', 'cryptography'], minCgpa: 6.5,
    courses: ['Network Security Fundamentals', 'Web Application Security', 'Applied Cryptography'], internships: ['Security operations or penetration testing intern'], projects: ['Capture-the-flag write-ups published on GitHub', 'A vulnerability scan report for a deliberately vulnerable app'] },
  { id: 'mobile', title: 'Mobile App Developer', skills: ['kotlin', 'swift', 'react native', 'apis', 'git'], interests: ['mobile', 'apps', 'design', 'android', 'ios'], minCgpa: 6.5,
    courses: ['Android or iOS Development Basics', 'Mobile UI Patterns'], internships: ['Mobile developer intern'], projects: ['An app published to a store or shared as a test build', 'A mobile client for an existing public API'] },
  { id: 'embedded', title: 'Embedded / IoT Engineer', skills: ['c', 'c++', 'electronics', 'microcontrollers', 'linux'], interests: ['electronics', 'iot', 'robotics', 'hardware', 'embedded'], minCgpa: 7,
    courses: ['Embedded Systems with ARM', 'RTOS Fundamentals', 'IoT Protocols'], internships: ['Embedded software or hardware intern'], projects: ['A sensor node that reports data to a dashboard', 'A small RTOS-based controller with documented timing'] },
  { id: 'higher-studies', title: 'Higher Studies (MS / M.Tech)', skills: ['research', 'mathematics', 'statistics', 'writing', 'python'], interests: ['research', 'higher studies', 'academia', 'gate', 'gre'], minCgpa: 8,
    courses: ['GATE or GRE preparation course', 'Research Methods', 'Technical Writing'], internships: ['Research internship at an institute or lab'], projects: ['A small research paper or reproducibility study', 'A well-documented open-source contribution'] },
]

const ALIASES = { js: 'javascript', ts: 'typescript', node: 'node.js', nodejs: 'node.js', ml: 'machine learning', ai: 'ai', 'c plus plus': 'c++', cpp: 'c++', 'ci cd': 'ci/cd', cicd: 'ci/cd', 'data viz': 'data visualisation', 'data visualization': 'data visualisation', 'web dev': 'web development', postgres: 'sql', postgresql: 'sql', mysql: 'sql', k8s: 'kubernetes', 'react.js': 'react', reactjs: 'react', 'deep-learning': 'deep learning' }
export const norm = (s) => { const t = s.toLowerCase().trim().replace(/\s+/g, ' '); return ALIASES[t] ?? t }
export const cleanList = (arr) => [...new Set(arr.map(norm).filter(Boolean))]

const round = (n) => Math.round(n)
const overlaps = (have, wanted) => wanted.filter((w) => have.some((h) => h === w || h.includes(w) || w.includes(h)))

export function match(profile, path) {
  const skills = cleanList(profile.skills), interests = cleanList(profile.interests)
  const gotSkills = overlaps(skills, path.skills)
  const gotInterests = overlaps(interests, path.interests)
  const cgpaFit = profile.cgpa == null ? 0.7 : Math.min(1, Math.max(0, Number(profile.cgpa) / path.minCgpa))
  const score = round((gotSkills.length / path.skills.length) * 60 + Math.min(1, gotInterests.length / 2) * 30 + cgpaFit * 10)
  return { score, matchedSkills: gotSkills, missingSkills: path.skills.filter((s) => !gotSkills.includes(s)), matchedInterests: gotInterests, cgpaOk: profile.cgpa == null ? null : Number(profile.cgpa) >= path.minCgpa }
}

// Paths ranked by match. Paths with no skill and no interest overlap are left out.
export function suggest(profile, top = 5) {
  return PATHS.map((p) => ({ path: p, ...match(profile, p) }))
    .filter((m) => m.matchedSkills.length || m.matchedInterests.length)
    .sort((a, b) => b.score - a.score || a.path.title.localeCompare(b.path.title)).slice(0, top)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const span = (start, n) => { const a = MONTHS[start % 12], b = MONTHS[(start + n - 1) % 12]; return a === b ? a : `${a} – ${b}` }

// Four three-month phases starting this month: close the biggest skill gaps, build, apply, convert.
export function roadmap(profile, path, today = new Date().toISOString().slice(0, 10)) {
  const m = match(profile, path)
  const start = Number(today.slice(5, 7)) - 1
  const gaps = m.missingSkills.slice(0, 3)
  return [
    { when: span(start, 3), title: 'Close the gaps', steps: [gaps.length ? `Learn ${gaps.join(', ')}.` : 'Deepen the skills you already have with harder problems.', `Take: ${path.courses[0]}.`] },
    { when: span(start + 3, 3), title: 'Build proof', steps: path.projects.slice(0, 2).map((p) => `Project: ${p}.`).concat('Publish everything on GitHub with a clear README.') },
    { when: span(start + 6, 3), title: 'Get experience', steps: [`Apply for: ${path.internships[0]}.`, 'Do two mock interviews and ask a senior mentor to review your resume.'] },
    { when: span(start + 9, 3), title: 'Convert', steps: ['Prepare for campus drives: aptitude, DSA, and your project walkthroughs.', 'Keep your CGPA above the cut-offs recruiters set.'] },
  ]
}
