/** Demo credentials and seed-data constants (match npm run db:seed:demo). */

export const USERS = {
  admin: {
    email: 'admin@demo.ecclesia.local',
    password: 'AdminDemo123!',
    name: 'Sr. Agnes Wanjiru',
    role: 'admin',
  },
  viewer: {
    email: 'viewer@demo.ecclesia.local',
    password: 'ViewerDemo123!',
    name: 'Mary Wanjiru',
    role: 'viewer',
  },
} as const;

export const NEW_MEMBER = {
  baptismalName: 'Angela',
  secondName: 'Marie',
  sirName: 'TestFlight',
  nationalId: '33000001',
  phone: '0700123456',
};

export const DEMO_DATA = {
  expectedChristianCount: 30,
  knownMembers: ['Peter Kamau', 'Mary Wanjiru', 'John Otieno'],
  knownInventoryItems: 6,
  knownEmployees: 4,
  knownDeposits: 6,
};
