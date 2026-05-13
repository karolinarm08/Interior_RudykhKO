const request = require('supertest');

describe('API testing', () => {

  test('GET /api/products', async () => {

    const response = await request('http://localhost:3000')
      .get('/api/products');

    expect(response.statusCode).toBe(200);
  });

});