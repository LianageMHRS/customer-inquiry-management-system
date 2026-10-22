import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('GET /api/health', () => {
  it('returns a simple healthy response without exposing configuration', async () => {
    const response = await request(createApp()).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { status: 'ok' } })
  })
})
