import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, seedTestUser, cleanupTestData } from './helpers.js';
import type { Express } from 'express';

let app: Express;
let token: string;

beforeAll(async () => {
  app = createTestApp();
  const seeded = await seedTestUser();
  token = seeded.token;
});

beforeEach(async () => {
  await cleanupTestData();
  const seeded = await seedTestUser();
  token = seeded.token;
});

// =============================================================================
// EMPLOYEES
// =============================================================================

describe('HR - Employees', () => {
  const empData = {
    nationalId: '12345678',
    surname: 'Mwangi',
    firstName: 'John',
    middleName: 'Kamau',
    designation: 'Secretary',
    hireDate: '2024-01-15',
    email: 'john@parish.org',
    phone: '+254700000000',
    nextOfKinName: 'Jane Mwangi',
    nextOfKinRelation: 'Wife',
    nextOfKinPhone: '+254711111111',
  };

  it('POST /api/hr/employees - creates employee', async () => {
    const res = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(empData);
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('EMP-0001');
    expect(res.body.name).toBe('John Kamau Mwangi');
    expect(res.body.role).toBe('Secretary');
    expect(res.body.email).toBe('john@parish.org');
  });

  it('GET /api/hr/employees - lists employees', async () => {
    await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(empData);

    const res = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBe('EMP-0001');
  });

  it('GET /api/hr/employees/:id - gets single employee', async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(empData);

    const res = await request(app)
      .get(`/api/hr/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('John Kamau Mwangi');
  });

  it('PUT /api/hr/employees/:id - updates employee', async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(empData);

    const res = await request(app)
      .put(`/api/hr/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'Head Secretary', phone: '+254722222222' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Head Secretary');
    expect(res.body.phone).toBe('+254722222222');
  });

  it('DELETE /api/hr/employees/:id - soft deletes employee', async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(empData);

    const res = await request(app)
      .delete(`/api/hr/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const list = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });

  it('POST /api/hr/employees - no auth returns 401', async () => {
    const res = await request(app)
      .post('/api/hr/employees')
      .send(empData);
    expect(res.status).toBe(401);
  });

  it('POST /api/hr/employees - invalid email returns 400', async () => {
    const res = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...empData, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('auto-generates sequential employee codes', async () => {
    await request(app).post('/api/hr/employees').set('Authorization', `Bearer ${token}`).send(empData);
    await request(app).post('/api/hr/employees').set('Authorization', `Bearer ${token}`).send({
      ...empData,
      email: 'second@parish.org',
      surname: 'Kamau',
      firstName: 'Peter',
    });

    const list = await request(app)
      .get('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body[0].code).toBe('EMP-0001');
    expect(list.body[1].code).toBe('EMP-0002');
  });
});

// =============================================================================
// PAYROLL
// =============================================================================

describe('HR - Payroll', () => {
  let employeeId: string;

  beforeEach(async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surname: 'Test',
        firstName: 'Employee',
        designation: 'Staff',
        hireDate: '2024-01-01',
        email: 'test@parish.org',
        phone: '+254700000000',
        nationalId: '11111111',
      });
    employeeId = created.body.id;
  });

  it('POST /api/hr/payrolls - creates payroll record', async () => {
    const res = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        period: '2024-06',
        basicSalary: 50000,
        allowances: 5000,
        deductions: 2000,
      });
    expect(res.status).toBe(201);
    expect(res.body.netPay).toBe(53000);
    expect(res.body.status).toBe('Draft');
    expect(res.body.employee.name).toBe('Employee Test');
  });

  it('GET /api/hr/payrolls - lists payroll records', async () => {
    await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId, period: '2024-06', basicSalary: 50000 });

    const res = await request(app)
      .get('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('PUT /api/hr/payrolls/:id - updates payroll', async () => {
    const created = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId, period: '2024-06', basicSalary: 50000, allowances: 5000, deductions: 2000 });
    expect(created.status).toBe(201);

    const res = await request(app)
      .put(`/api/hr/payrolls/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ basicSalary: 55000, allowances: 3000, deductions: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.basicSalary).toBe(55000);
    expect(res.body.allowances).toBe(3000);
    expect(res.body.deductions).toBe(1000);
    expect(res.body.netPay).toBe(57000);
  });

  it('PATCH /api/hr/payrolls/:id/approve - approves payroll', async () => {
    const created = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId, period: '2024-06', basicSalary: 50000 });

    const res = await request(app)
      .patch(`/api/hr/payrolls/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Approved');
  });

  it('PATCH /api/hr/payrolls/:id/pay - marks payroll as paid', async () => {
    const created = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId, period: '2024-06', basicSalary: 50000 });

    await request(app)
      .patch(`/api/hr/payrolls/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .patch(`/api/hr/payrolls/${created.body.id}/pay`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Paid');
  });

  it('DELETE /api/hr/payrolls/:id - soft deletes payroll', async () => {
    const created = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId, period: '2024-06', basicSalary: 50000 });

    const res = await request(app)
      .delete(`/api/hr/payrolls/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('calculates netPay correctly with zero allowances/deductions', async () => {
    const res = await request(app)
      .post('/api/hr/payrolls')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId, period: '2024-06', basicSalary: 40000 });
    expect(res.body.netPay).toBe(40000);
  });
});

// =============================================================================
// LEAVE
// =============================================================================

describe('HR - Leave', () => {
  let employeeId: string;

  beforeEach(async () => {
    const created = await request(app)
      .post('/api/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surname: 'Leave',
        firstName: 'Tester',
        designation: 'Staff',
        hireDate: '2024-01-01',
        email: 'leave@parish.org',
        phone: '+254700000000',
        nationalId: '22222222',
      });
    employeeId = created.body.id;
  });

  it('POST /api/hr/leaves - creates leave request', async () => {
    const res = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Annual Leave',
        startDate: '2024-07-01',
        endDate: '2024-07-14',
        days: 14,
        reason: 'Family vacation',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    expect(res.body.type).toBe('Annual Leave');
    expect(res.body.days).toBe(14);
    expect(res.body.employee.name).toBe('Tester Leave');
  });

  it('GET /api/hr/leaves - lists leave records', async () => {
    await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Sick Leave',
        startDate: '2024-07-01',
        endDate: '2024-07-03',
        days: 3,
        reason: 'Illness',
      });

    const res = await request(app)
      .get('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('PATCH /api/hr/leaves/:id/approve - approves leave', async () => {
    const created = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Annual Leave',
        startDate: '2024-07-01',
        endDate: '2024-07-14',
        days: 14,
        reason: 'Vacation',
      });

    const res = await request(app)
      .patch(`/api/hr/leaves/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Approved');
    expect(res.body.approvedBy).toBe('Test Admin');
  });

  it('PATCH /api/hr/leaves/:id/reject - rejects leave', async () => {
    const created = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Annual Leave',
        startDate: '2024-07-01',
        endDate: '2024-07-14',
        days: 14,
        reason: 'Vacation',
      });

    const res = await request(app)
      .patch(`/api/hr/leaves/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Insufficient staffing during peak season' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Rejected');
    expect(res.body.notes).toBe('Insufficient staffing during peak season');
  });

  it('PUT /api/hr/leaves/:id - updates leave', async () => {
    const created = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Annual Leave',
        startDate: '2024-07-01',
        endDate: '2024-07-14',
        days: 14,
        reason: 'Vacation',
      });

    const res = await request(app)
      .put(`/api/hr/leaves/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ days: 7, endDate: '2024-07-07', reason: 'Shortened vacation' });
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(res.body.reason).toBe('Shortened vacation');
  });

  it('DELETE /api/hr/leaves/:id - soft deletes leave', async () => {
    const created = await request(app)
      .post('/api/hr/leaves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId,
        type: 'Annual Leave',
        startDate: '2024-07-01',
        endDate: '2024-07-14',
        days: 14,
        reason: 'Vacation',
      });

    const res = await request(app)
      .delete(`/api/hr/leaves/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

// =============================================================================
// RECRUITMENT
// =============================================================================

describe('HR - Recruitment', () => {
  it('POST /api/hr/recruitments - creates recruitment', async () => {
    const res = await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Assistant Catechist',
        department: 'Religious Education',
        description: 'Assist with catechism classes for children and adults',
        requirements: 'Catholic faith, prior teaching experience preferred',
        datePosted: '2024-06-01',
        closingDate: '2024-06-30',
      });
    expect(res.status).toBe(201);
    expect(res.body.position).toBe('Assistant Catechist');
    expect(res.body.status).toBe('Open');
    expect(res.body.applicants).toHaveLength(0);
  });

  it('GET /api/hr/recruitments - lists recruitments', async () => {
    await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Secretary',
        department: 'Administration',
        description: 'Parish office secretary',
        datePosted: '2024-06-01',
      });

    const res = await request(app)
      .get('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('PUT /api/hr/recruitments/:id - closes recruitment', async () => {
    const created = await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Secretary',
        department: 'Administration',
        description: 'Parish office secretary',
        datePosted: '2024-06-01',
      });

    const res = await request(app)
      .put(`/api/hr/recruitments/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Closed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Closed');
  });

  it('DELETE /api/hr/recruitments/:id - soft deletes', async () => {
    const created = await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Secretary',
        department: 'Administration',
        description: 'Parish office secretary',
        datePosted: '2024-06-01',
      });

    const res = await request(app)
      .delete(`/api/hr/recruitments/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('POST /api/hr/recruitments/:id/applicants - adds applicant', async () => {
    const recruitment = await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Secretary',
        department: 'Administration',
        description: 'Parish office secretary',
        datePosted: '2024-06-01',
      });

    const res = await request(app)
      .post(`/api/hr/recruitments/${recruitment.body.id}/applicants`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mary Wanjiku',
        email: 'mary@email.com',
        phone: '+254733333333',
        cvSummary: '5 years office admin experience',
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Mary Wanjiku');
    expect(res.body.status).toBe('Pending');
  });

  it('PUT /api/hr/applicants/:id - updates applicant status', async () => {
    const recruitment = await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Secretary',
        department: 'Administration',
        description: 'Parish office secretary',
        datePosted: '2024-06-01',
      });

    const applicant = await request(app)
      .post(`/api/hr/recruitments/${recruitment.body.id}/applicants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mary', email: 'mary@email.com' });

    const res = await request(app)
      .put(`/api/hr/applicants/${applicant.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Interviewed', notes: 'Good communication skills' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Interviewed');
  });

  it('recruitment includes applicants count', async () => {
    const recruitment = await request(app)
      .post('/api/hr/recruitments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        position: 'Secretary',
        department: 'Administration',
        description: 'Parish office secretary',
        datePosted: '2024-06-01',
      });

    await request(app)
      .post(`/api/hr/recruitments/${recruitment.body.id}/applicants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Applicant 1', email: 'a1@email.com' });

    await request(app)
      .post(`/api/hr/recruitments/${recruitment.body.id}/applicants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Applicant 2', email: 'a2@email.com' });

    const res = await request(app)
      .get(`/api/hr/recruitments/${recruitment.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.applicants).toHaveLength(2);
  });
});
