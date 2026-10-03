async function main() {
  const base =
    (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1")
      .replace(/\/+$/, "");

  const model =
    process.env.LLM_MODEL || "openai/gpt-oss-20b";

  if (!process.env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is missing");
  }

  const tools = [
    {
      type: "function",
      function: {
        name: "get_order_details",
        description: "Look up an Aura Skincare order.",
        parameters: {
          type: "object",
          properties: {
            order_id: {
              type: "string"
            }
          },
          required: ["order_id"]
        }
      }
    }
  ];

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
          content: "Where is my order ORD-101?"
        }
      ],
      tools,
      tool_choice: "auto",
      temperature: 0,
      max_completion_tokens: 100
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