async function main() {
  const base =
    (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1")
      .replace(/\/+$/, "");

  const model =
    process.env.LLM_MODEL || "openai/gpt-oss-20b";

  if (!process.env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is missing");
  }

  console.log("BASE:", base);
  console.log("MODEL:", model);
  console.log("API KEY:", "present");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LLM_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: "Say exactly: HELLO ARIA"
        }
      ],
      temperature: 0,
      max_completion_tokens: 50
    })
  });

  const text = await res.text();

  console.log("STATUS:", res.status);
  console.log("RESPONSE:", text);
}

main().catch((error) => {
  console.error("TEST FAILED:", error);
  process.exit(1);
});
export {};