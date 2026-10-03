import fs from "fs";

async function runTest(question: string, repoId: string) {
  console.log(`\n=== Testing: "${question}" ===`);
  const response = await fetch(`http://localhost:5000/api/repositories/${repoId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: question }),
  });
  
  const status = response.status;
  
  if (status !== 200) {
    const errorText = await response.text();
    console.log(`Status: ${status}`);
    console.log(`Error: ${errorText}`);
    return { question, status, error: errorText };
  }
  
  const data: any = await response.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
  
  console.log(`Answer:\n${data.answer}`);
  console.log(`\nSources retrieved: ${data.sources?.length || 0}`);
  if (data.sources && data.sources.length > 0) {
    data.sources.forEach((s: any, i: number) => {
      console.log(`  [${i + 1}] ${s.file} (Lines ${s.startLine}-${s.endLine}) - Score: ${s.score}`);
    });
  }
  console.log(`Is Low Confidence: ${data.isLowConfidence}`);
  
  return { question, status, data };
}

async function main() {
  const repoId = "6f46cd78-9243-4600-bd9e-95192d211a05"; // The roystonfernandes1835/portfolio-website repo ID
  const questions = [
    "What does this project do?",
    "Where is the website styling defined?",
    "Where is the interactive behavior implemented?",
    "What does script.js do?",
    "Explain the main structure of index.html.",
    "Which files contain the main functionality?",
    "What does that function do?",
    "Explain the themeToggler functionality.",
    "How does this repository implement a PostgreSQL authentication service?", // Hallucination test
  ];
  
  const results = [];
  for (const q of questions) {
    const res = await runTest(q, repoId);
    results.push(res);
  }
  
  fs.writeFileSync("C:/Users/Royston/.gemini/antigravity-ide/brain/1e616eed-fc51-45b9-8e14-2a2e88a4cd7e/manual_test_results.json", JSON.stringify(results, null, 2));
  console.log("\nAll tests completed.");
}

main();
