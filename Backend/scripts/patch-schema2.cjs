const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');
const oldStr = `  announcements Announcement[]
  registrations Registration[]

  @@index([status])`;
const newStr = `  announcements Announcement[]
  registrations Registration[]
  phaseSchedules PhaseSchedule[]

  @@index([status])`;
if (!s.includes(oldStr)) throw new Error('PATTERN NOT FOUND');
s = s.split(oldStr).join(newStr);
fs.writeFileSync(p, s);
console.log('OK');
