// Mock data for the Acadex front end. Replace with API calls when the backend is ready.

export const me = {
  student: { name: 'Aarav Sharma', id: 'EN22CS301045', branch: 'CSE', year: '3rd Year', sem: 'Sem 6', mentor: 'Dr. Neha Verma', cgpa: 7.8 },
  teacher: { name: 'Dr. Neha Verma', id: 'FAC-0231', dept: 'Computer Science', subjects: ['Machine Learning', 'Data Structures'] },
  admin: { name: 'Rakesh Gupta', id: 'ADM-0007', dept: 'Academic Office' },
}

export const subjects = [
  { code: 'CS601', name: 'Machine Learning', faculty: 'Dr. Neha Verma', attendance: 88, marks: 74, assignments: '5/6' },
  { code: 'CS602', name: 'Compiler Design', faculty: 'Prof. Anil Rao', attendance: 71, marks: 58, assignments: '3/6' },
  { code: 'CS603', name: 'Computer Networks', faculty: 'Dr. Priya Nair', attendance: 82, marks: 69, assignments: '4/5' },
  { code: 'CS604', name: 'Software Engineering', faculty: 'Prof. Sameer Khan', attendance: 92, marks: 81, assignments: '6/6' },
  { code: 'CS605', name: 'Cloud Computing', faculty: 'Dr. Meera Joshi', attendance: 64, marks: 52, assignments: '2/5' },
]

export const trend = [
  { month: 'Jan', marks: 62, attendance: 84 },
  { month: 'Feb', marks: 66, attendance: 82 },
  { month: 'Mar', marks: 71, attendance: 79 },
  { month: 'Apr', marks: 69, attendance: 77 },
  { month: 'May', marks: 64, attendance: 75 },
  { month: 'Jun', marks: 63, attendance: 74 },
]

export const todayPlan = [
  { id: 1, time: '09:00', title: 'Machine Learning: revise decision trees', subject: 'CS601', done: true },
  { id: 2, time: '11:30', title: 'Compiler Design: solve LR(1) parsing set', subject: 'CS602', done: false },
  { id: 3, time: '15:00', title: 'Cloud Computing: assignment 3 draft', subject: 'CS605', done: false },
  { id: 4, time: '18:30', title: 'Computer Networks: subnetting practice', subject: 'CS603', done: false },
]

export const alerts = [
  { id: 1, level: 'high', title: 'Cloud Computing attendance is 64%', detail: 'Below the 75% minimum. Attend the next 6 classes to recover.', when: '2h ago' },
  { id: 2, level: 'medium', title: 'Compiler Design marks dropped 9 points', detail: 'Mid-sem 2 score is lower than mid-sem 1.', when: 'Yesterday' },
  { id: 3, level: 'medium', title: '2 assignments missing in Cloud Computing', detail: 'Assignment 2 and 3 are overdue.', when: '2 days ago' },
]

export const doubts = [
  { id: 1, student: 'Aarav Sharma', teacher: 'Dr. Neha Verma', subject: 'Machine Learning', title: 'Why does information gain prefer multi-valued attributes?', body: 'In the ID3 example from class, the attribute with most distinct values always wins. Is gain ratio the fix?', upvotes: 14, solved: true, answer: 'Yes. Information gain is biased towards attributes with many values. Gain ratio normalises by the split information, which penalises such attributes. See slide 23.', replies: 3, when: '3 days ago' },
  { id: 2, student: 'Riya Patel', teacher: 'Prof. Anil Rao', subject: 'Compiler Design', title: 'Difference between LALR and CLR parsing tables?', body: 'Both seem to use lookaheads. Where exactly does the state count differ?', upvotes: 9, solved: false, answer: '', replies: 0, when: '1 day ago' },
  { id: 3, student: 'Kabir Singh', teacher: 'Dr. Priya Nair', subject: 'Computer Networks', title: 'How is the subnet mask chosen for 500 hosts?', body: 'Need 500 usable hosts. Is /23 the right choice?', upvotes: 21, solved: true, answer: '/23 gives 510 usable hosts (2^9 − 2), which covers 500. /24 would only give 254.', replies: 2, when: '5 days ago' },
  { id: 4, student: 'Ananya Das', teacher: 'Dr. Meera Joshi', subject: 'Cloud Computing', title: 'Auto-scaling vs load balancing: are they the same?', body: 'Confused about when each is used in an AWS setup.', upvotes: 6, solved: false, answer: '', replies: 1, when: '6 hours ago' },
]

export const notes = [
  { id: 1, name: 'ML_Unit3_DecisionTrees.pdf', subject: 'Machine Learning', pages: 32, added: '12 Oct', summary: 'Decision trees split data using impurity measures (entropy, Gini). ID3 uses information gain, C4.5 adds gain ratio and handles continuous attributes, CART builds binary trees. Pruning (pre and post) controls overfitting.', questions: ['Differentiate ID3, C4.5 and CART.', 'Why does pruning reduce overfitting?', 'Compute information gain for the given weather dataset.'], mcqs: [{ q: 'Which measure does CART use by default?', options: ['Entropy', 'Gini index', 'Gain ratio', 'Chi-square'], answer: 1 }, { q: 'Gain ratio fixes bias towards…', options: ['Few-valued attributes', 'Multi-valued attributes', 'Missing values', 'Noise'], answer: 1 }] },
  { id: 2, name: 'CD_LR_Parsing_Handwritten.jpg', subject: 'Compiler Design', pages: 4, added: '10 Oct', summary: 'LR parsers shift-reduce using a DFA of item sets. SLR uses FOLLOW sets, CLR uses full lookaheads, LALR merges CLR states with the same core to save space.', questions: ['Construct the SLR table for the given grammar.', 'What conflicts arise in LALR merging?'], mcqs: [{ q: 'LALR merges states with the same…', options: ['Lookahead', 'Core', 'Goto', 'Action'], answer: 1 }] },
]

export const planner = {
  exams: [
    { id: 1, subject: 'Machine Learning', date: '2026-11-03', topics: 12, done: 7 },
    { id: 2, subject: 'Compiler Design', date: '2026-11-06', topics: 10, done: 3 },
    { id: 3, subject: 'Cloud Computing', date: '2026-11-10', topics: 9, done: 2 },
    { id: 4, subject: 'Computer Networks', date: '2026-11-13', topics: 11, done: 6 },
  ],
  topics: {
    'Machine Learning': ['Linear regression', 'Logistic regression', 'Decision trees', 'Random forests', 'SVM', 'Neural networks', 'Clustering', 'Dimensionality reduction'],
    'Compiler Design': ['Lexical analysis', 'LL(1) parsing', 'LR parsing', 'Syntax-directed translation', 'Code optimisation'],
    'Cloud Computing': ['Virtualisation', 'IaaS / PaaS / SaaS', 'Containers', 'Auto-scaling', 'Cloud security'],
  },
}

export const counsellors = [
  { id: 1, name: 'Dr. Sunita Mehra', area: 'Academic & career', slots: ['Mon 11:00', 'Wed 14:00', 'Fri 10:30'] },
  { id: 2, name: 'Mr. Vikram Sethi', area: 'Personal & wellbeing', slots: ['Tue 12:00', 'Thu 15:30'] },
]

export const careers = [
  { title: 'Machine Learning Engineer', match: 91, skills: ['Python', 'Statistics', 'PyTorch'], courses: ['Deep Learning Specialisation', 'MLOps Fundamentals'], internships: ['Analytics Vidhya Intern', 'Startup ML Intern (Indore)'] },
  { title: 'Full-Stack Developer', match: 84, skills: ['React', 'Node.js', 'SQL'], courses: ['Full-Stack Open', 'System Design Primer'], internships: ['Product Engineering Intern'] },
  { title: 'Cloud / DevOps Engineer', match: 72, skills: ['AWS', 'Docker', 'CI/CD'], courses: ['AWS Cloud Practitioner', 'Kubernetes Basics'], internships: ['Cloud Support Intern'] },
]

export const mentors = [
  { id: 1, name: 'Karan Malhotra', year: 'Final Year · CSE', company: 'Placed at Microsoft', rating: 4.9, topics: ['Placements', 'DSA', 'Resume'], sessions: 48 },
  { id: 2, name: 'Sneha Iyer', year: 'Final Year · IT', company: 'MS applicant (USA)', rating: 4.8, topics: ['Higher studies', 'GRE', 'Research'], sessions: 31 },
  { id: 3, name: 'Rohit Yadav', year: '4th Year · CSE', company: 'Intern at Amazon', rating: 4.6, topics: ['Internships', 'Projects', 'Hackathons'], sessions: 26 },
  { id: 4, name: 'Pooja Chauhan', year: 'Final Year · ECE', company: 'Placed at Texas Instruments', rating: 4.7, topics: ['Core branch', 'GATE', 'Electronics'], sessions: 22 },
]

export const rooms = [
  { id: 'cse-ml', name: 'ML Study Circle', type: 'Course', members: 214 },
  { id: 'cse', name: 'CSE Branch Lounge', type: 'Branch', members: 612 },
  { id: 'placement', name: 'Placement Prep', type: 'General', members: 1304 },
  { id: 'hack', name: 'Hackathons & Events', type: 'General', members: 489 },
]

export const posts = [
  { id: 1, room: 'cse-ml', author: 'Riya Patel', text: 'Shared my handwritten notes for SVM kernels. Covers linear, polynomial and RBF with examples.', tag: 'Notes', upvotes: 32, comments: 6, when: '1h ago' },
  { id: 2, room: 'cse-ml', author: 'Kabir Singh', text: 'Anyone solved the PCA numerical from the 2024 paper? Stuck on the eigenvector step.', tag: 'Question', upvotes: 11, comments: 4, when: '3h ago' },
  { id: 3, room: 'cse', author: 'Ananya Das', text: 'Reminder: Codeathon registration closes on Friday. Teams of 3.', tag: 'Event', upvotes: 40, comments: 2, when: 'Yesterday' },
  { id: 4, room: 'placement', author: 'Karan Malhotra', text: 'Compiled 60 most-asked OS and DBMS questions from this season’s drives.', tag: 'Resource', upvotes: 118, comments: 21, when: '2 days ago' },
]

export const projects = [
  { id: 1, title: 'Smart Attendance via Face Recognition', owner: 'Rohit Yadav', mentor: 'Dr. Neha Verma', stack: ['Python', 'OpenCV', 'Flask'], lookingFor: 2, progress: 60, status: 'In progress', description: 'Mark attendance automatically from classroom camera frames.' },
  { id: 2, title: 'Campus Lost & Found Portal', owner: 'Ananya Das', mentor: 'Prof. Sameer Khan', stack: ['React', 'Node.js', 'MongoDB'], lookingFor: 1, progress: 35, status: 'In progress', description: 'Report, match and claim lost items across the campus.' },
  { id: 3, title: 'AI Study Buddy for Exam Prep', owner: 'Aarav Sharma', mentor: 'Dr. Neha Verma', stack: ['LLM', 'RAG', 'Next.js'], lookingFor: 3, progress: 15, status: 'Idea', description: 'Chat with your own notes and get adaptive practice questions.' },
  { id: 4, title: 'Hostel Mess Feedback Analyzer', owner: 'Pooja Chauhan', mentor: 'Dr. Priya Nair', stack: ['Python', 'NLP', 'Streamlit'], lookingFor: 0, progress: 100, status: 'Completed', description: 'Sentiment dashboard for daily mess feedback.' },
]

export const departments = ['Accounts & Fees', 'Hostel', 'Library', 'IT Services', 'Examination', 'Academic Office']
export const tickets = [
  { id: 'TK-1042', student: 'Aarav Sharma', category: 'Fees', title: 'Fee receipt not showing for Sem 5', dept: 'Accounts & Fees', status: 'In progress', priority: 'High', created: '11 Oct' },
  { id: 'TK-1039', student: 'Riya Patel', category: 'Hostel', title: 'Room heater not working', dept: 'Hostel', status: 'Open', priority: 'Medium', created: '10 Oct' },
  { id: 'TK-1031', student: 'Kabir Singh', category: 'Library', title: 'Need extension on borrowed book', dept: 'Library', status: 'Resolved', priority: 'Low', created: '7 Oct' },
  { id: 'TK-1027', student: 'Ananya Das', category: 'IT', title: 'Wi-Fi login failing in Block C', dept: 'IT Services', status: 'Open', priority: 'High', created: '6 Oct' },
  { id: 'TK-1019', student: 'Rohit Yadav', category: 'Certificates', title: 'Bonafide certificate request', dept: 'Academic Office', status: 'Resolved', priority: 'Low', created: '2 Oct' },
]

// Teacher / admin data
export const classStudents = [
  { id: 'EN22CS301045', name: 'Aarav Sharma', attendance: 77, marks: 67, assignments: 83, risk: 0.34, level: 'Medium', drivers: ['Attendance down 7 pts', 'Cloud Computing assignments missing'] },
  { id: 'EN22CS301012', name: 'Riya Patel', attendance: 91, marks: 82, assignments: 100, risk: 0.08, level: 'Low', drivers: ['Strong recent activity'] },
  { id: 'EN22CS301078', name: 'Kabir Singh', attendance: 58, marks: 44, assignments: 40, risk: 0.86, level: 'High', drivers: ['Attendance 58%', 'Marks fell 14 pts', '3 assignments missing', '12 days since last activity'] },
  { id: 'EN22CS301033', name: 'Ananya Das', attendance: 84, marks: 71, assignments: 90, risk: 0.18, level: 'Low', drivers: ['Steady marks trend'] },
  { id: 'EN22CS301090', name: 'Rohit Yadav', attendance: 66, marks: 53, assignments: 60, risk: 0.67, level: 'High', drivers: ['Late submission ratio 45%', 'Attendance 66%'] },
  { id: 'EN22CS301055', name: 'Pooja Chauhan', attendance: 73, marks: 62, assignments: 75, risk: 0.45, level: 'Medium', drivers: ['Recent engagement dropped', 'Marks flat'] },
  { id: 'EN22CS301101', name: 'Vivaan Mehta', attendance: 95, marks: 88, assignments: 100, risk: 0.04, level: 'Low', drivers: ['Consistent engagement'] },
  { id: 'EN22CS301066', name: 'Ishita Joshi', attendance: 69, marks: 57, assignments: 66, risk: 0.58, level: 'Medium', drivers: ['Days since activity: 6', 'Attendance 69%'] },
]

export const riskDistribution = [
  { name: 'Low', value: 142, color: '#2e9e6b' },
  { name: 'Medium', value: 58, color: '#e0a21c' },
  { name: 'High', value: 27, color: '#a21d2e' },
]

export const weeklyEngagement = [
  { day: 'Mon', students: 1120, doubts: 64, notes: 210 },
  { day: 'Tue', students: 1240, doubts: 81, notes: 244 },
  { day: 'Wed', students: 1190, doubts: 72, notes: 230 },
  { day: 'Thu', students: 1310, doubts: 95, notes: 281 },
  { day: 'Fri', students: 1260, doubts: 88, notes: 262 },
  { day: 'Sat', students: 740, doubts: 41, notes: 118 },
  { day: 'Sun', students: 560, doubts: 33, notes: 97 },
]

export const featureImportance = [
  { feature: 'Assessment trend', value: 0.31 },
  { feature: 'On-time ratio', value: 0.22 },
  { feature: 'Recent engagement', value: 0.19 },
  { feature: 'Days since activity', value: 0.14 },
  { feature: 'Attendance proxy', value: 0.09 },
  { feature: 'Planner / support use', value: 0.05 },
]

export const modelMetrics = { recall: 0.84, precision: 0.77, f1: 0.8, prauc: 0.86, rocauc: 0.91, accuracy: 0.85 }
export const modelTrend = [
  { month: 'May', recall: 0.78, precision: 0.74 },
  { month: 'Jun', recall: 0.8, precision: 0.75 },
  { month: 'Jul', recall: 0.81, precision: 0.76 },
  { month: 'Aug', recall: 0.82, precision: 0.76 },
  { month: 'Sep', recall: 0.83, precision: 0.77 },
  { month: 'Oct', recall: 0.84, precision: 0.77 },
]

export const moduleUsage = [
  { module: 'Doubt Desk', value: 86 },
  { module: 'Study Planner', value: 74 },
  { module: 'Smart Notes', value: 69 },
  { module: 'Performance', value: 64 },
  { module: 'Community', value: 58 },
  { module: 'Help Center', value: 41 },
  { module: 'Mentorship', value: 37 },
  { module: 'Project Hub', value: 29 },
  { module: 'Career', value: 26 },
  { module: 'Counselling', value: 14 },
]

export const interventions = [
  { id: 1, student: 'Kabir Singh', action: 'Mentor call + recovery plan', by: 'Dr. Neha Verma', status: 'Student responded', outcome: 'Attendance +6 pts', when: '2 days ago' },
  { id: 2, student: 'Rohit Yadav', action: 'Assignment reminder + extension', by: 'Dr. Neha Verma', status: 'Sent', outcome: 'Pending', when: 'Yesterday' },
  { id: 3, student: 'Ishita Joshi', action: 'Counselling referral', by: 'Mr. Vikram Sethi', status: 'Booked', outcome: 'Pending', when: 'Today' },
]

export const users = [
  { id: 'EN22CS301045', name: 'Aarav Sharma', role: 'Student', dept: 'CSE', status: 'Active' },
  { id: 'FAC-0231', name: 'Dr. Neha Verma', role: 'Teacher', dept: 'CSE', status: 'Active' },
  { id: 'FAC-0118', name: 'Prof. Anil Rao', role: 'Teacher', dept: 'CSE', status: 'Active' },
  { id: 'MNT-0044', name: 'Karan Malhotra', role: 'Mentor', dept: 'CSE', status: 'Active' },
  { id: 'CNS-0003', name: 'Dr. Sunita Mehra', role: 'Counsellor', dept: 'Student Affairs', status: 'Active' },
  { id: 'EN22IT302011', name: 'Sneha Iyer', role: 'Student', dept: 'IT', status: 'Suspended' },
]

export const deptLoad = [
  { dept: 'Accounts & Fees', open: 18, resolved: 64 },
  { dept: 'Hostel', open: 12, resolved: 41 },
  { dept: 'Library', open: 4, resolved: 28 },
  { dept: 'IT Services', open: 15, resolved: 52 },
  { dept: 'Examination', open: 9, resolved: 33 },
  { dept: 'Academic Office', open: 7, resolved: 38 },
]

export const branchRisk = [
  { branch: 'CSE', low: 142, medium: 58, high: 27 },
  { branch: 'IT', low: 118, medium: 49, high: 21 },
  { branch: 'ECE', low: 96, medium: 52, high: 30 },
  { branch: 'ME', low: 88, medium: 44, high: 25 },
  { branch: 'CE', low: 74, medium: 36, high: 17 },
]
