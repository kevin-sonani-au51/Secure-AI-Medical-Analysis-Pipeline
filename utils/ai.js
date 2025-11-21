export async function callOpenAIExtract(redactedText) {
  // If mock flag enabled, return deterministic mock response
  try {
    const useMock = String(process.env.USE_MOCK_AI || "").toLowerCase();
    if (useMock === "true") {
      await new Promise((r) => setTimeout(r, 5000));
      return {
        patient_name: "[REDACTED]",
        blood_sugar: { value: 95, unit: "mg/dL", status: "Normal" },
        cholesterol: { value: 210, unit: "mg/dL", status: "High" },
      };
    }
  } catch (e) {
    // ignore and proceed to real OpenAI call
  }

  const prompt = `Extract Blood Sugar and Cholesterol values from this text. Return valid JSON only. If a value is not present, set it to null. Text:\n\n${redactedText}`;

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a JSON extractor. Return valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0,
  };

  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let parsedErr = null;
        try {
          parsedErr = JSON.parse(text);
        } catch (_) {}

        const errorCode = parsedErr?.error?.code || null;
        const errorType = parsedErr?.error?.type || null;
        const errorMessage =
          parsedErr?.error?.message || text || `HTTP ${res.status}`;

        if (
          errorCode === "insufficient_quota" ||
          errorType === "insufficient_quota"
        ) {
          throw new Error(`OpenAI insufficient_quota: ${errorMessage}`);
        }

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          lastErr = new Error(
            `OpenAI transient error: ${res.status} ${errorMessage}`
          );
          const backoff =
            Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        throw new Error(`OpenAI error: ${res.status} ${errorMessage}`);
      }

      const data = await res.json();
      const reply =
        data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? null;
      if (!reply) throw new Error("No content from OpenAI");

      try {
        const parsed = JSON.parse(reply.trim());
        return parsed;
      } catch (err) {
        const maybe = reply.match(/\{[\s\S]*\}/);
        if (maybe) return JSON.parse(maybe[0]);
        throw new Error("Failed to parse JSON from OpenAI response");
      }
    } catch (err) {
      lastErr = err;
      if (String(err).includes("insufficient_quota")) {
        throw err;
      }
      if (attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  throw lastErr || new Error("OpenAI request failed");
}
