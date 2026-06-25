import vm from 'vm';

/**
 * Deep equality helper for comparing outputs
 */
function deepEqual(a, b) {
  if (a === b) return true;

  // Float comparison helper
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-6;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Run a JavaScript user submission against test cases in a sandboxed VM
 */
export function runJavaScript(code, functionName, testCases) {
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const logs = [];
    let passed = false;
    let actualOutput = null;
    let error = null;
    let timeTakenMs = 0;

    // Setup sandboxed console to capture logs
    const sandboxConsole = {
      log: (...args) => {
        logs.push(args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '));
      },
      error: (...args) => {
        logs.push("[ERROR] " + args.join(' '));
      },
      warn: (...args) => {
        logs.push("[WARN] " + args.join(' '));
      }
    };

    const sandbox = {
      console: sandboxConsole,
      // Add standard global JS helper classes
      Array, Object, String, Number, Math, Map, Set, RegExp, Date,
      parseInt, parseFloat, isNaN, isFinite
    };

    try {
      let args = [];
      try {
        args = JSON.parse(tc.input);
        if (!Array.isArray(args)) {
          args = [args]; // Fallback if input is not wrapped in array
        }
      } catch (e) {
        throw new Error(`Failed to parse test case input: ${tc.input}. Input must be a valid JSON array of arguments.`);
      }

      let expected = null;
      try {
        expected = JSON.parse(tc.output);
      } catch (e) {
        expected = tc.output; // fallback to raw string if it's not JSON
      }

      // Compile and run code inside a VM context
      const context = vm.createContext(sandbox);
      
      const startTime = performance.now();
      
      // Execute the user's code in the context to define the function
      vm.runInContext(code, context, { timeout: 2000 });

      // Retrieve the function
      const fn = sandbox[functionName];
      if (typeof fn !== 'function') {
        throw new Error(`Function '${functionName}' is not defined. Please check your function signature.`);
      }

      // Call the function with the parsed arguments
      actualOutput = fn.apply(null, args);
      
      const endTime = performance.now();
      timeTakenMs = parseFloat((endTime - startTime).toFixed(3));

      // Compare actual vs expected
      passed = deepEqual(actualOutput, expected);

    } catch (e) {
      error = e.message || String(e);
    }

    results.push({
      testCaseIndex: i,
      isSecret: tc.isSecret,
      passed,
      input: tc.isSecret ? "[HIDDEN]" : tc.input,
      expected: tc.isSecret ? "[HIDDEN]" : tc.output,
      actual: error ? null : JSON.stringify(actualOutput),
      error,
      logs: logs.slice(0, 50), // cap logs at 50 statements
      timeTakenMs
    });
  }

  return results;
}
