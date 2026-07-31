import {
  ChristianRecord,
  CreditorRecord,
  DebtorRecord,
  DepositRecord,
  ExpenseRecord,
  DeathRecord,
  ContributionRecord
} from '../types';

export const INITIAL_CHRISTIANS: ChristianRecord[] = [
  {
    id: 'c1',
    regNo: 'REG-2026-001042',
    nationalId: '12345678',
    baptismalName: 'Maria',
    secondName: 'Magdalene',
    sirName: 'Smith',
    phone: '+254 700 000 000',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'Our Lady of Sorrows',
    scc: 'St. Jude',
    status: 'Active',
    baptism: {
      date: '2010-04-15',
      minister: 'Rev. Fr. Joseph',
      place: "St. Mary's Parish"
    },
    eucharist: {
      date: '2012-05-20',
      minister: 'Rev. Fr. Thomas',
      place: "St. Mary's Parish"
    },
    confirmation: {
      date: '2016-10-12',
      minister: 'His Lordship Bishop Paul',
      place: 'Cathedral of St. Peter'
    },
    marriage: {
      date: '',
      minister: '',
      place: ''
    }
  },
  {
    id: 'c2',
    regNo: 'REG-2026-001043',
    nationalId: '23456789',
    baptismalName: 'Arthur',
    secondName: 'P.',
    sirName: 'Jenkins',
    phone: '+254 711 222 333',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'Our Lady of Sorrows',
    scc: 'St. Francis',
    status: 'Deceased',
    baptism: {
      date: '1965-02-10',
      minister: 'Rev. Fr. Michael',
      place: "St. Mary's Parish"
    }
  },
  {
    id: 'c3',
    regNo: 'REG-2026-001044',
    nationalId: '34567890',
    baptismalName: 'Martha',
    secondName: 'Rose',
    sirName: 'Willoughby',
    phone: '+254 722 333 444',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'St. Peters Center',
    scc: 'St. Anne',
    status: 'Deceased'
  },
  {
    id: 'c4',
    regNo: 'REG-2026-001045',
    nationalId: '45678901',
    baptismalName: 'Adrian',
    secondName: '',
    sirName: 'Thorne',
    phone: '+254 733 444 555',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'Our Lady of Sorrows',
    scc: 'St. Jude',
    status: 'Active'
  },
  {
    id: 'c5',
    regNo: 'REG-2026-001046',
    nationalId: '56789012',
    baptismalName: 'Cecilia',
    secondName: '',
    sirName: 'Vance',
    phone: '+254 744 555 666',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'St. Peters Center',
    scc: 'St. Francis',
    status: 'Active'
  },
  {
    id: 'c6',
    regNo: 'REG-2026-001047',
    nationalId: '67890123',
    baptismalName: 'Elias',
    secondName: '',
    sirName: 'Graves',
    phone: '+254 755 666 777',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'Our Lady of Sorrows',
    scc: 'St. Anne',
    status: 'Active'
  },
  {
    id: 'c7',
    regNo: 'REG-2026-001048',
    nationalId: '78901234',
    baptismalName: 'Julianne',
    secondName: '',
    sirName: 'Sterling',
    phone: '+254 766 777 888',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'St. Peters Center',
    scc: 'St. Jude',
    status: 'Active'
  },
  {
    id: 'c8',
    regNo: 'REG-2026-001049',
    nationalId: '89012345',
    baptismalName: 'Victor',
    secondName: 'Saint',
    sirName: 'Clair',
    phone: '+254 777 888 999',
    diocese: 'Archdiocese of Nairobi',
    parish: "St. Mary's Parish",
    localChurch: 'Our Lady of Sorrows',
    scc: 'St. Francis',
    status: 'Active'
  }
];

export const INITIAL_CREDITORS: CreditorRecord[] = [
  {
    id: 'cr1',
    vendor: 'Liturgical Arts & Supply',
    description: 'Sanctuary Maintenance',
    invoiceNo: '#INV-2024-081',
    amountOwed: 12400.0,
    dueDate: 'Oct 12, 2024',
    status: 'Pending'
  },
  {
    id: 'cr2',
    vendor: 'Beacon Structural Eng.',
    description: 'Roof Restoration',
    invoiceNo: '#BE-9942',
    amountOwed: 28500.0,
    dueDate: 'Sep 28, 2024',
    status: 'Overdue'
  },
  {
    id: 'cr3',
    vendor: 'Evergreen Landscaping',
    description: 'Groundskeeping Monthly',
    invoiceNo: '#EL-0122',
    amountOwed: 1950.0,
    dueDate: 'Oct 30, 2024',
    status: 'Scheduled'
  }
];

export const INITIAL_DEBTORS: DebtorRecord[] = [
  {
    id: 'db1',
    memberName: 'Adrian Thorne',
    contributionType: 'Monthly Tithe',
    amount: 450.0,
    status: 'Outstanding'
  },
  {
    id: 'db2',
    memberName: 'Cecilia Vance',
    contributionType: 'Building Fund',
    amount: 1200.0,
    status: 'Partially Paid'
  },
  {
    id: 'db3',
    memberName: 'Elias Graves',
    contributionType: 'Monthly Tithe',
    amount: 320.0,
    status: 'Paid'
  },
  {
    id: 'db4',
    memberName: 'Julianne Sterling',
    contributionType: 'Mission Pledge',
    amount: 75.0,
    status: 'Outstanding'
  },
  {
    id: 'db5',
    memberName: 'Victor Saint-Clair',
    contributionType: 'Monthly Tithe',
    amount: 2100.0,
    status: 'Outstanding'
  }
];

export const INITIAL_DEPOSITS: DepositRecord[] = [
  {
    id: 'dep1',
    date: '2024-05-18',
    amount: 3450.0,
    bankName: "St. Jude's Mercantile",
    accountNo: 'ac-9081',
    sourceOfCash: 'Weekly Mass Offerings',
    refNo: 'DEP-88391',
    depositedBy: 'Fr. Thomas'
  }
];

export const INITIAL_EXPENSES: ExpenseRecord[] = [
  {
    id: 'exp1',
    date: '2024-05-20',
    category: 'Utilities',
    description: 'Altar Wine Supplies Ltd.',
    amount: 450.0,
    paymentMethod: 'Check / Voucher',
    voucherNo: 'VCH-2024-001'
  }
];

export const INITIAL_DEATHS: DeathRecord[] = [
  {
    id: 'd1',
    christianId: 'c2',
    memberName: 'Arthur P. Jenkins',
    placeOfDeath: 'St. Jude Medical Center',
    dateOfDeath: '2023-10-08',
    dateOfBurial: 'Oct 12, 2023',
    ministerName: 'Fr. Thomas',
    remarks: 'Requiem Mass celebrated with family'
  },
  {
    id: 'd2',
    christianId: 'c3',
    memberName: 'Martha Rose Willoughby',
    placeOfDeath: 'Parish Hospice',
    dateOfDeath: '2023-09-24',
    dateOfBurial: 'Sep 28, 2023',
    ministerName: 'Fr. Thomas',
    remarks: 'Buried in St. Mary Parish Cemetery'
  }
];
