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

const validChristian = {
  nationalId: '12345678',
  baptismalName: 'Mary',
  secondName: 'Wanjiku',
  sirName: 'Njeri',
  phone: '0712000000',
  diocese: 'Nairobi',
  parish: 'St. Marys',
  localChurch: 'Downtown Chapel',
  scc: 'Jumuiya 1',
};

describe('Christians - Auth', () => {
  it('GET /api/christians - no auth returns 401', async () => {
    const res = await request(app).get('/api/christians');
    expect(res.status).toBe(401);
  });

  it('POST /api/christians - no auth returns 401', async () => {
    const res = await request(app).post('/api/christians').send(validChristian);
    expect(res.status).toBe(401);
  });

  it('GET /api/christians/:id - no auth returns 401', async () => {
    const res = await request(app).get('/api/christians/00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(401);
  });

  it('PUT /api/christians/:id - no auth returns 401', async () => {
    const res = await request(app).put('/api/christians/00000000-0000-0000-0000-000000000001').send({});
    expect(res.status).toBe(401);
  });

  it('PATCH /api/christians/:id/sacraments - no auth returns 401', async () => {
    const res = await request(app).patch('/api/christians/00000000-0000-0000-0000-000000000001/sacraments').send({});
    expect(res.status).toBe(401);
  });

  it('DELETE /api/christians/:id - no auth returns 401', async () => {
    const res = await request(app).delete('/api/christians/00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(401);
  });
});

describe('Christians - List', () => {
  it('GET /api/christians - returns empty array when no members', async () => {
    const res = await request(app)
      .get('/api/christians')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/christians - returns created members newest first', async () => {
    await request(app).post('/api/christians').set('Authorization', `Bearer ${token}`).send(validChristian);
    await request(app).post('/api/christians').set('Authorization', `Bearer ${token}`).send({
      ...validChristian,
      nationalId: '87654321',
      baptismalName: 'John',
      sirName: 'Kamau',
    });

    const res = await request(app)
      .get('/api/christians')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].baptismalName).toBe('John');
    expect(res.body[1].baptismalName).toBe('Mary');
  });

  it('GET /api/christians - filters by status', async () => {
    await request(app).post('/api/christians').set('Authorization', `Bearer ${token}`).send(validChristian);
    await request(app).post('/api/christians').set('Authorization', `Bearer ${token}`).send({
      ...validChristian,
      nationalId: '87654321',
      sirName: 'Wambui',
    });

    const res = await request(app)
      .get('/api/christians')
      .query({ status: 'Active' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((c: any) => c.status === 'Active')).toBe(true);
  });

  it('GET /api/christians - search by name', async () => {
    await request(app).post('/api/christians').set('Authorization', `Bearer ${token}`).send(validChristian);

    const res = await request(app)
      .get('/api/christians')
      .query({ q: 'Mary' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].baptismalName).toBe('Mary');
  });

  it('GET /api/christians - search is case-insensitive', async () => {
    await request(app).post('/api/christians').set('Authorization', `Bearer ${token}`).send(validChristian);

    const res = await request(app)
      .get('/api/christians')
      .query({ q: 'MARY' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('Christians - Create', () => {
  it('POST /api/christians - creates member with auto-generated regNo', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.regNo).toMatch(/^REG-\d{4}-\d{6}$/);
    expect(res.body.baptismalName).toBe('Mary');
    expect(res.body.status).toBe('Active');
    expect(res.body.nationalId).toBe('12345678');
  });

  it('POST /api/christians - ignores client-supplied regNo (server generates it)', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validChristian, regNo: 'MANUAL-REG-NO' });
    expect(res.status).toBe(201);
    expect(res.body.regNo).toMatch(/^REG-\d{4}-\d{6}$/);
    expect(res.body.regNo).not.toBe('MANUAL-REG-NO');
  });

  it('POST /api/christians - missing required field returns 400', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({ baptismalName: 'Mary' });
    expect(res.status).toBe(400);
  });

  it('POST /api/christians - empty string required field returns 400', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validChristian, nationalId: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/christians - with sacrament data', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validChristian,
        baptism: { date: '2020-01-15', minister: 'Fr. John', place: 'St. Marys' },
      });
    expect(res.status).toBe(201);
    expect(res.body.baptism).toEqual({ date: '2020-01-15', minister: 'Fr. John', place: 'St. Marys' });
  });
});

describe('Christians - Read', () => {
  it('GET /api/christians/:id - returns member by id', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .get(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.baptismalName).toBe('Mary');
  });

  it('GET /api/christians/:id - unknown id returns 404', async () => {
    const res = await request(app)
      .get('/api/christians/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/christians/:id - returns all sacraments', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validChristian,
        baptism: { date: '2020-01-15', minister: 'Fr. John', place: 'St. Marys' },
        confirmation: { date: '2022-06-01', minister: 'Bishop Peter', place: 'Cathedral' },
      });

    const res = await request(app)
      .get(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.baptism).toBeDefined();
    expect(res.body.confirmation).toBeDefined();
    expect(res.body.eucharist).toBeUndefined();
    expect(res.body.marriage).toBeUndefined();
  });
});

describe('Christians - Update (PUT)', () => {
  it('PUT /api/christians/:id - updates all editable fields', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .put(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ secondName: 'Muthoni', sirName: 'Mbugua', phone: '0799000000' });
    expect(res.status).toBe(200);
    expect(res.body.secondName).toBe('Muthoni');
    expect(res.body.sirName).toBe('Mbugua');
    expect(res.body.phone).toBe('0799000000');
    expect(res.body.baptismalName).toBe('Mary');
  });

  it('PUT /api/christians/:id - partial update preserves other fields', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .put(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0722334455' });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('0722334455');
    expect(res.body.baptismalName).toBe('Mary');
    expect(res.body.sirName).toBe('Njeri');
  });

  it('PUT /api/christians/:id - unknown id returns 404', async () => {
    const res = await request(app)
      .put('/api/christians/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0722334455' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/christians/:id - empty body is valid (no-op partial update)', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .put(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.baptismalName).toBe('Mary');
  });

  it('PUT /api/christians/:id - invalid status value returns 400', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .put(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'InvalidStatus' });
    expect(res.status).toBe(400);
  });
});

describe('Christians - Sacraments (PATCH)', () => {
  it('PATCH /api/christians/:id/sacraments - adds baptism', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .patch(`/api/christians/${created.body.id}/sacraments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ baptism: { date: '2019-12-25', minister: 'Fr. Paul', place: 'St. Josephs' } });
    expect(res.status).toBe(200);
    expect(res.body.baptism).toEqual({ date: '2019-12-25', minister: 'Fr. Paul', place: 'St. Josephs' });
    expect(res.body.confirmation).toBeUndefined();
  });

  it('PATCH /api/christians/:id/sacraments - adds multiple sacraments', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .patch(`/api/christians/${created.body.id}/sacraments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        baptism: { date: '2019-12-25', minister: 'Fr. Paul', place: 'St. Josephs' },
        eucharist: { date: '2021-01-01', minister: 'Fr. Paul', place: 'St. Marys' },
        confirmation: { date: '2023-05-01', minister: 'Bishop James', place: 'Cathedral' },
        marriage: { date: '2025-02-14', minister: 'Fr. John', place: 'St. Marys' },
      });
    expect(res.status).toBe(200);
    expect(res.body.baptism).toBeDefined();
    expect(res.body.eucharist).toBeDefined();
    expect(res.body.confirmation).toBeDefined();
    expect(res.body.marriage).toBeDefined();
  });

  it('PATCH /api/christians/:id/sacraments - partial update (one field only)', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validChristian,
        baptism: { date: '2019-12-25', minister: 'Fr. Paul', place: 'St. Josephs' },
      });

    const res = await request(app)
      .patch(`/api/christians/${created.body.id}/sacraments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmation: { date: '2023-05-01', minister: 'Bishop James', place: 'Cathedral' } });
    expect(res.status).toBe(200);
    expect(res.body.baptism).toBeDefined();
    expect(res.body.confirmation).toEqual({ date: '2023-05-01', minister: 'Bishop James', place: 'Cathedral' });
  });

  it('PATCH /api/christians/:id/sacraments - unknown id returns 404', async () => {
    const res = await request(app)
      .patch('/api/christians/00000000-0000-0000-0000-000000000099/sacraments')
      .set('Authorization', `Bearer ${token}`)
      .send({ baptism: { date: '2020-01-01', minister: 'Fr. John', place: 'Church' } });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/christians/:id/sacraments - empty body is valid', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .patch(`/api/christians/${created.body.id}/sacraments`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe('Christians - Delete (Soft-Delete)', () => {
  it('DELETE /api/christians/:id - sets status to Inactive and soft-deletes', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .delete(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('DELETE /api/christians/:id - soft-deleted member no longer appears in list', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    await request(app)
      .delete(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    const list = await request(app)
      .get('/api/christians')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);
  });

  it('DELETE /api/christians/:id - unknown id returns 404', async () => {
    const res = await request(app)
      .delete('/api/christians/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('DELETE /api/christians/:id - returns 204 with no body', async () => {
    const created = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);

    const res = await request(app)
      .delete(`/api/christians/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

describe('Christians - RegNo Auto-Generation', () => {
  it('regNo increments sequentially across creates', async () => {
    const r1 = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validChristian, nationalId: '11111111' });
    const r2 = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validChristian, nationalId: '22222222' });
    const r3 = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validChristian, nationalId: '33333333' });

    const num1 = parseInt(r1.body.regNo.split('-')[2], 10);
    const num2 = parseInt(r2.body.regNo.split('-')[2], 10);
    const num3 = parseInt(r3.body.regNo.split('-')[2], 10);
    expect(num2).toBe(num1 + 1);
    expect(num3).toBe(num2 + 1);
  });

  it('regNo includes current year', async () => {
    const res = await request(app)
      .post('/api/christians')
      .set('Authorization', `Bearer ${token}`)
      .send(validChristian);
    const year = new Date().getFullYear().toString();
    expect(res.body.regNo).toContain(year);
  });
});
