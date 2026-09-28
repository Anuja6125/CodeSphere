import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { contentHash, embedTexts } from "@/lib/embeddings/voyage";
import { embeddingConfig } from "@/lib/embeddings/config";
import { lexicalScore, toPgVector } from "@/lib/embeddings/vector";

describe("Phase 3 embedding primitives", () => {
  it("uses a stable content hash for duplicate prevention", () => {
    expect(contentHash("same chunk")).toBe(contentHash("same chunk"));
    expect(contentHash("same chunk")).not.toBe(contentHash("changed chunk"));
  });

  it("formats vectors for pgvector", () => {
    expect(toPgVector([0.1, -0.2, 1])).toBe("[0.1,-0.2,1]");
  });

  it("scores exact identifier matches for hybrid ranking", () => {
    const exact = lexicalScore("Where is authenticateUser defined?", "export function authenticateUser() {}", "authenticateUser");
    const unrelated = lexicalScore("Where is authenticateUser defined?", "export function formatDate() {}", "formatDate");
    expect(exact).toBeGreaterThan(unrelated);
  });

  it("requests configured Voyage model and validates dimensions", async () => {
    const vector = Array.from({ length: embeddingConfig.dimensions }, () => 0.01);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: vector }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VOYAGE_API_KEY", "test-key");

    const result = await embedTexts(["function authenticateUser() {}"], "document");
    expect(result[0]).toHaveLength(embeddingConfig.dimensions);
    expect(fetchMock).toHaveBeenCalledOnce();
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe(embeddingConfig.model);
    expect(sent.output_dimension).toBe(embeddingConfig.dimensions);
    expect(sent.input_type).toBe("document");
  });

  it("requests with input_type query", async () => {
    const vector = Array.from({ length: embeddingConfig.dimensions }, () => 0.01);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: vector }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VOYAGE_API_KEY", "test-key");

    const result = await embedTexts(["query text"], "query");
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.input_type).toBe("query");
  });

  it("retries transient rate-limit failures", async () => {
    vi.useFakeTimers();
    const vector = Array.from({ length: embeddingConfig.dimensions }, () => 0.01);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "Rate limited", headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ index: 0, embedding: vector }] }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VOYAGE_API_KEY", "test-key");

    const promise = embedTexts(["retry me"], "query");
    await vi.advanceTimersByTimeAsync(25_000);
    const result = await promise;
    expect(result[0]).toHaveLength(embeddingConfig.dimensions);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("exhausts retries and throws if consistently failing", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
      headers: { get: () => null }
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VOYAGE_API_KEY", "test-key");

    const promise = embedTexts(["fail me"], "query");
    const rejection = expect(promise).rejects.toThrow(/rate-limited/i);
    // Advance timers past all retry delays
    for (let i = 0; i < embeddingConfig.maxRetries; i++) {
      await vi.advanceTimersByTimeAsync(25_000);
    }
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(embeddingConfig.maxRetries);
    vi.useRealTimers();
  }, 30000);

  it("does not retry for permanent errors (e.g. 400 Bad Request)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "Bad request", headers: { get: () => null } });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VOYAGE_API_KEY", "test-key");

    await expect(embedTexts(["bad request"], "query")).rejects.toThrow(/Embedding request failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails dimension validation rather than accepting a bad embedding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ index: 0, embedding: [0.1] }] }),
    }));
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
    await expect(embedTexts(["bad vector"], "document")).rejects.toThrow("unexpected count or dimension");
  });
});
