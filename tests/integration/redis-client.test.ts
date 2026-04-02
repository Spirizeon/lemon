import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Redis } from "ioredis";
import { getRedisClient } from "../src/redis/client";

describe("Redis Client", () => {
  let client: Redis;

  beforeAll(async () => {
    client = getRedisClient();
  });

  afterAll(async () => {
    await client.quit();
  });

  it("should connect and respond to ping", async () => {
    const result = await client.ping();
    expect(result).toBe("PONG");
  });

  it("should return the same instance on subsequent calls", () => {
    const client2 = getRedisClient();
    expect(client2).toBe(client);
  });
});
