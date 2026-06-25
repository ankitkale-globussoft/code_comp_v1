import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Get Groq API Key dynamically from Settings or use default
 */
async function getGroqApiKey() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'GROQ_API_KEY' } });
    if (setting && setting.value) return setting.value;
  } catch (error) {
    console.error("Error fetching GROQ_API_KEY from DB:", error);
  }
  return process.env.GROQ_API_KEY || DEFAULT_GROQ_API_KEY;
}

/**
 * Call Groq chat completion API with JSON mode enabled
 */
async function callGroq(messages) {
  try {
    const apiKey = await getGroqApiKey();
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // high speed, high capability model
        messages: messages,
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error("Error in callGroq:", error);
    throw error;
  }
}

/**
 * Generate a DSA question based on difficulty and topics
 */
export async function generateQuestion(difficulty, topics) {
  const topicString = Array.isArray(topics) ? topics.join(', ') : topics;
  const systemPrompt = `You are an expert DSA (Data Structures and Algorithms) question generator.
Your task is to generate a coding challenge based on the requested topics and difficulty.
You MUST respond with a JSON object containing the following keys:
- "title": (string) Short, descriptive title.
- "difficulty": (string) "Easy", "Medium", or "Hard".
- "topics": (array of strings) The selected topics.
- "description": (string) Clear problem description in Markdown. Include examples, expected input/output behaviors.
- "constraints": (array of strings) List of input constraints (e.g., "1 <= N <= 10^5").
- "inputFormat": (string) Explanation of the inputs.
- "outputFormat": (string) Explanation of the outputs.
- "functionName": (string) The exact name of the entrypoint function (camelCase, e.g. "twoSum").
- "starterCode": (object) Containing keys:
  * "javascript": (string) starter function signature in JavaScript.
  * "python": (string) starter function signature in Python.
  * "java": (string) starter class and method signature in Java (class named Solution).
  * "cpp": (string) starter class and method signature in C++ (class named Solution).
- "sampleTestCase": (object) Keys: "input" (string explanation), "output" (string explanation), "explanation" (string).
- "testCases": (array of 5 objects) Each object must have:
  * "input": (string) A JSON-serialized array of arguments that can be passed directly to the function. For example, if the function is twoSum(nums, target), the input string MUST be a JSON array: "[ [2, 7, 11, 15], 9 ]". If the function is reverseString(s), the input string MUST be: "[ \\"hello\\" ]".
  * "output": (string) JSON-serialized expected output of the function, e.g. "[0, 1]" or "\\"olleh\\"".
  * "isSecret": (boolean) True if it's a hidden test case, false if it's public.
- "solution": (string) Reference JavaScript solution.

CRITICAL: The "input" in "testCases" MUST be a JSON-serialized array of arguments. The starter code for ALL languages must match the functionName exactly.`;

  const userPrompt = `Generate an interesting and high-quality "${difficulty}" level DSA question combining the topics of: "${topicString}". Ensure the test cases are 100% correct, and starter templates for all 4 languages (javascript, python, java, cpp) are included in the starterCode object.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  return await callGroq(messages);
}

/**
 * Simulate the execution of Python, Java, or C++ code against test cases using AI
 */
export async function simulateExecution(problem, code, language) {
  const systemPrompt = `You are an expert compiler and code execution simulator.
Your job is to analyze the user's code written in ${language} and simulate running it against a set of test cases.
You are provided with:
1. The problem description and test cases.
2. The user's code.

You MUST simulate the execution of the user's code for each of the 5 test cases and return a JSON object with a single key "results" containing an array of 5 objects.
Each object in the array MUST represent the run result of a test case and contain:
- "testCaseIndex": (number) 0 to 4.
- "isSecret": (boolean) Match the isSecret property of the test case.
- "passed": (boolean) True if the code executes successfully and returns the exact expected output, false otherwise.
- "input": (string) The test case input (hide as "[HIDDEN]" if isSecret is true).
- "expected": (string) The test case expected output (hide as "[HIDDEN]" if isSecret is true).
- "actual": (string) The actual output returned by the user's code, JSON-serialized (hide as "[HIDDEN]" if isSecret is true, return null if execution failed).
- "error": (string) Null if the code compiled and ran successfully, otherwise the compiler or runtime error message (e.g. "NameError: name 'x' is not defined").
- "logs": (array of strings) Any stdout print logs generated during execution of this test case (simulated print statements).
- "timeTakenMs": (number) Simulated execution time in milliseconds (e.g. 5 to 50).

Be extremely precise. If the code has a syntax error or logic bug, fail the test cases and provide the correct compiler/runtime error message in the "error" field.`;

  const userContent = JSON.stringify({
    problem: {
      title: problem.title,
      description: problem.description,
      testCases: problem.testCases.map(t => ({ input: t.input, output: t.output, isSecret: t.isSecret }))
    },
    userCode: code,
    language: language
  });

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  const data = await callGroq(messages);
  return data.results;
}

/**
 * Evaluate a user's code submission using AI
 */
export async function evaluateSubmission(problem, code, language, runResults) {
  const systemPrompt = `You are an expert DSA code evaluator and reviewer.
Your job is to analyze the user's code submission for a specific problem.
You are provided with:
1. The problem description, constraints, and test cases.
2. The user's code submission.
3. The results of running their code against the test cases (success count, execution times, errors).

You MUST respond with a JSON object containing the following keys:
- "isCorrect": (boolean) True if the code is logically 100% correct, handles edge cases, and has optimal time/space complexity.
- "score": (number) An overall score from 0 to 100 based on correctness (40%), complexity/efficiency (20%), and code quality (40%).
- "codeQualityScore": (number) A dedicated code quality score from 0 to 100 evaluating:
  * Readability & naming conventions (25 points)
  * Code structure & modularity (25 points)
  * Edge case handling & robustness (25 points)
  * Efficiency & idiomatic usage for the chosen language (25 points)
- "qualityFeedback": (string) A brief 2-3 sentence summary of the code quality, highlighting what was done well and what could improve.
- "timeComplexity": (string) The asymptotic time complexity, e.g., "O(N log N)" or "O(N^2)".
- "spaceComplexity": (string) The asymptotic space complexity, e.g., "O(1)" or "O(N)".
- "review": (string) A constructive, professional code review in Markdown. Detail:
  * Strengths of the code.
  * Weaknesses or potential edge case failures.
  * Suggestions for optimizing the time/space complexity or improving readability.
  * A dedicated "Code Quality Assessment" section covering naming, structure, edge-cases, and idioms.
- "modelSolution": (string) A clean, optimal, and commented model solution in the user's selected language.

Be honest, precise, and encouraging in your review. Do not include markdown code block formatting in the main JSON structure, only inside the string fields.`;

  const userContent = JSON.stringify({
    problem: {
      title: problem.title,
      description: problem.description,
      constraints: problem.constraints,
      testCases: problem.testCases.map(t => ({ input: t.input, output: t.output, isSecret: t.isSecret }))
    },
    userCode: code,
    language: language,
    localExecutionResults: runResults
  });

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  return await callGroq(messages);
}
