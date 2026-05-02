"use strict";

const LICHESS_BASE_URL = process.env.LICHESS_BASE_URL || "https://lichess.org";

class LichessClient {
  constructor(options = {}) {
    this.token = options.token;
    this.baseUrl = options.baseUrl || LICHESS_BASE_URL;
    this.fetchImpl = options.fetchImpl || global.fetch;

    if (!this.token || typeof this.token !== "string") {
      throw new Error("LichessClient requires LICHESS_BOT_TOKEN");
    }

    if (typeof this.fetchImpl !== "function") {
      throw new Error("LichessClient requires fetch implementation");
    }
  }

  authHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/x-ndjson",
    };
  }

  async *streamIncomingEvents(signal) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/stream/event`, {
      method: "GET",
      headers: this.authHeaders(),
      signal,
    });
    yield* parseNdjson(res);
  }

  async *streamGame(gameId, signal) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/bot/game/stream/${gameId}`, {
      method: "GET",
      headers: this.authHeaders(),
      signal,
    });
    yield* parseNdjson(res);
  }

  async makeMove(gameId, move) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/bot/game/${gameId}/move/${move}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`move submission failed (${res.status}): ${body}`);
    }

    return true;
  }

  async getAccount() {
    const res = await this.fetchImpl(`${this.baseUrl}/api/account`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`account fetch failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  async getOnlineBots() {
    const res = await this.fetchImpl(`${this.baseUrl}/api/bot/online`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    const bots = [];
    for await (const row of parseNdjson(res)) {
      bots.push(row);
    }
    return bots;
  }

  async createChallenge(username, options = {}) {
    const rated = options.rated === true ? "true" : "false";
    const clockLimit = Number.isFinite(options.clockLimitSeconds) ? Number(options.clockLimitSeconds) : 60;
    const clockIncrement = Number.isFinite(options.clockIncrementSeconds) ? Number(options.clockIncrementSeconds) : 0;
    const body = `rated=${rated}&clock.limit=${encodeURIComponent(clockLimit)}&clock.increment=${encodeURIComponent(clockIncrement)}`;

    const res = await this.fetchImpl(`${this.baseUrl}/api/challenge/${encodeURIComponent(username)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });

    const payload = await res.text();
    if (!res.ok) {
      const error = new Error(`challenge create failed (${res.status}): ${payload}`);
      error.status = res.status;
      error.body = payload;
      try {
        error.details = payload ? JSON.parse(payload) : null;
      } catch {
        error.details = null;
      }
      throw error;
    }
    return payload ? JSON.parse(payload) : {};
  }

  async acceptChallenge(challengeId) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/challenge/${challengeId}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`challenge accept failed (${res.status}): ${body}`);
    }

    return true;
  }

  async declineChallenge(challengeId, reason = "later") {
    const res = await this.fetchImpl(`${this.baseUrl}/api/challenge/${challengeId}/decline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `reason=${encodeURIComponent(reason)}`,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`challenge decline failed (${res.status}): ${body}`);
    }

    return true;
  }
}

async function *parseNdjson(response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Lichess request failed (${response.status}): ${message}`);
  }

  if (!response.body) {
    const text = await response.text();
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      yield JSON.parse(line);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      yield JSON.parse(trimmed);
    }
  }

  const tail = (buffer + decoder.decode()).trim();
  if (tail) {
    yield JSON.parse(tail);
  }
}

module.exports = {
  LICHESS_BASE_URL,
  LichessClient,
  parseNdjson,
};
