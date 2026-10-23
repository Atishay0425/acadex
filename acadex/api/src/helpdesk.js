// Help Center routing rules. Each category goes to one department; admins can re-route.
export const CATEGORIES = [
  { id: 'fees', label: 'Fees', department: 'Accounts & Fees' },
  { id: 'hostel', label: 'Hostel', department: 'Hostel' },
  { id: 'library', label: 'Library', department: 'Library' },
  { id: 'it', label: 'IT', department: 'IT Services' },
  { id: 'certificates', label: 'Certificates', department: 'Academic Office' },
  { id: 'academics', label: 'Academics', department: 'Examination' },
]
export const DEPARTMENTS = CATEGORIES.map((c) => c.department)
export const departmentFor = (category) => CATEGORIES.find((c) => c.id === category).department

// Urgent wording bumps priority; admins can change it afterwards.
export const suggestPriority = (text) => (/\b(urgent|urgently|emergency|asap|immediately|today|tomorrow|deadline)\b/i.test(text) ? 'high' : 'medium')
export const ticketNumber = (id) => `TK-${1000 + id}`
