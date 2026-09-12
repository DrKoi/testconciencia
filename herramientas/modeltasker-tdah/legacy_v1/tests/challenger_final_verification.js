/**
 * CHALLENGER FINAL VERIFICATION HARNESS
 * Specific re-verification of:
 * 1. Microstep completion idempotency guard (line 1590)
 * 2. task.id and step.id HTML attribute escaping in all views
 * 3. Regression test suite execution
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { execSync } = require('child_process');

console.log('================================================================');
console.log('   CHALLENGER FINAL VERIFICATION: EMPIRICAL HARNESS');
console.log('================================================================\n');

const htmlPath = path.resolve(__dirname, '../index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

let passCount = 0;
let failCount = 0;

function assertCheck(name, cond, details = '') {
  if (cond) {
    passCount++;
    console.log(`  [PASS] ${name}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${name} — ${details}`);
  }
}

// --------------------------------------------------------------------------
// SECTION 1: Static Code Inspection
// --------------------------------------------------------------------------
console.log('--- SECTION 1: Static Inspection ---');

// Check 1.1: Verify line 1590 (or around it) contains exact idempotency guard
const lines = htmlContent.split('\n');
const line1590 = lines[1589] ? lines[1589].trim() : '';
const nearbyLines = lines.slice(1585, 1595).map(l => l.trim());
const hasIdempotencyGuard = nearbyLines.includes('if (step.completed) return;');

assertCheck(
  'Line 1590 idempotency guard presence',
  hasIdempotencyGuard,
  `Expected "if (step.completed) return;" around line 1590, found: ${line1590}`
);

// Check 1.2: escapeHtml alias exists
assertCheck(
  'escapeHtml alias is defined',
  htmlContent.includes('const escapeHtml = escapeHTML;')
);

// Check 1.3: HTML attribute interpolations of task.id are escaped
const requiredEscapedAttributes = [
  'data-testid="task-item-${escapeHtml(task.id)}"',
  'data-task-id="${escapeHtml(task.id)}"',
  'data-testid="task-focus-btn-${escapeHtml(task.id)}"',
  'data-delete-id="${escapeHtml(task.id)}"',
  'data-testid="parked-item-${escapeHtml(task.id)}"',
  'data-testid="unpark-task-btn-${escapeHtml(task.id)}"',
  'data-testid="victory-item-${escapeHtml(task.id)}"',
  'data-step-id="${currentStep ? escapeHtml(currentStep.id) : \'\'}"'
];

for (const pattern of requiredEscapedAttributes) {
  assertCheck(`Attribute pattern escaped: ${pattern}`, htmlContent.includes(pattern));
}

// Check 1.4: Ensure NO unescaped task.id interpolations remain
const rawTaskIdMatches = htmlContent.match(/\$\{task\.id\}/g) || [];
assertCheck('Zero unescaped ${task.id} interpolations', rawTaskIdMatches.length === 0);

// --------------------------------------------------------------------------
// SECTION 2: Dynamic VM Stress Testing of Idempotency
// --------------------------------------------------------------------------
console.log('\n--- SECTION 2: Dynamic VM Idempotency Stress ---');

function createSandbox() {
  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = '';
      this.attributes = {};
      this.style = {};
      this.value = '';
      this.children = [];
      this.onclick = null;
      this.onsubmit = null;
      this.onchange = null;
    }
    setAttribute(name, val) { this.attributes[name] = String(val); }
    getAttribute(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; }
    hasAttribute(name) { return this.attributes[name] !== undefined; }
    removeAttribute(name) { delete this.attributes[name]; }
    get classList() {
      return {
        add: (...cls) => {
          const cur = this.className ? this.className.split(/\s+/) : [];
          for (const c of cls) if (!cur.includes(c)) cur.push(c);
          this.className = cur.join(' ');
        },
        remove: (...cls) => {
          const cur = this.className ? this.className.split(/\s+/) : [];
          this.className = cur.filter(c => !cls.includes(c)).join(' ');
        },
        toggle: (c, force) => {
          const cur = this.className ? this.className.split(/\s+/) : [];
          const idx = cur.indexOf(c);
          if (force === true || (force === undefined && idx === -1)) {
            if (idx === -1) cur.push(c);
          } else if (force === false || (force === undefined && idx !== -1)) {
            if (idx !== -1) cur.splice(idx, 1);
          }
          this.className = cur.join(' ');
        },
        contains: (c) => (this.className ? this.className.split(/\s+/).includes(c) : false)
      };
    }
    set innerHTML(val) {
      this.innerHTMLValue = val;
      this.children = [];
    }
    get innerHTML() { return this.innerHTMLValue || ''; }
    set textContent(val) { this.textContentValue = val; }
    get textContent() { return this.textContentValue || ''; }
    focus() {}
    select() {}
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    }
    querySelectorAll(sel) {
      const results = [];
      const match = (el) => {
        if (sel.startsWith('.')) {
          if (el.classList.contains(sel.slice(1))) results.push(el);
        } else if (sel.startsWith('#')) {
          if (el.id === sel.slice(1)) results.push(el);
        }
        for (const c of el.children) match(c);
      };
      for (const c of this.children) match(c);
      return results;
    }
    appendChild(c) { this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
    closest() { return null; }
  }

  let storage = {};
  const mockLocalStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
    clear: () => { storage = {}; }
  };

  const registeredElements = {};
  const mockDocument = {
    readyState: 'complete',
    documentElement: new MockElement('HTML'),
    body: new MockElement('BODY'),
    getElementById: id => {
      if (!registeredElements[id]) registeredElements[id] = new MockElement('DIV', id);
      return registeredElements[id];
    },
    querySelector: sel => {
      if (sel.startsWith('#')) return mockDocument.getElementById(sel.slice(1));
      return new MockElement('DIV');
    },
    querySelectorAll: () => [],
    createElement: tag => new MockElement(tag),
    addEventListener: () => {}
  };

  const sandbox = {
    window: {
      localStorage: mockLocalStorage,
      addEventListener: () => {},
      matchMedia: () => ({ matches: false, addEventListener: () => {} }),
      AudioContext: null,
      webkitAudioContext: null,
      URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }
    },
    document: mockDocument,
    localStorage: mockLocalStorage,
    navigator: {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    Date: Date,
    Math: Math,
    JSON: JSON,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Array: Array,
    Object: Object
  };
  sandbox.window.window = sandbox.window;
  const scriptCode = htmlContent.match(/<script>([\s\S]*?)<\/script>/i)[1];
  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);
  sandbox.window.__modeltasker.mockDocument = mockDocument;
  return sandbox.window.__modeltasker;
}



const app = createSandbox();

const state = app.getState();

// Add a task to backlog then focus it
state.tasks.push({
  id: 'task_stress_1',
  title: 'Stress Task 1',
  state: 'active',
  createdAt: Date.now(),
  microSteps: [
    { id: 'ms_1', text: 'Step 1', completed: false, createdAt: Date.now() },
    { id: 'ms_2', text: 'Step 2', completed: false, createdAt: Date.now() }
  ]
});
state.activeTaskId = 'task_stress_1';

const initialStats = state.stats.totalMicroStepsCompleted || 0;

// Complete step 1 once
app.completeMicrostep('ms_1');
assertCheck('First completion increments stat by 1', state.stats.totalMicroStepsCompleted === initialStats + 1);

// Repeated calls (100 times in a loop) on step 1
for (let i = 0; i < 100; i++) {
  app.completeMicrostep('ms_1');
}
assertCheck(
  '100 repeated calls on completed ms_1 do not increment stat (strict idempotency)',
  state.stats.totalMicroStepsCompleted === initialStats + 1,
  `Expected ${initialStats + 1}, got ${state.stats.totalMicroStepsCompleted}`
);

// Call with no argument when ms_1 is completed and ms_2 is incomplete
app.completeMicrostep(); // completes ms_2
assertCheck(
  'Calling completeMicrostep() with next incomplete step increments stat to 2',
  state.stats.totalMicroStepsCompleted === initialStats + 2
);

// Now all steps are completed. Calling completeMicrostep() again with no argument:
for (let i = 0; i < 50; i++) {
  app.completeMicrostep();
}
assertCheck(
  '50 repeated calls with no argument when all steps completed do not increment stat',
  state.stats.totalMicroStepsCompleted === initialStats + 2,
  `Expected ${initialStats + 2}, got ${state.stats.totalMicroStepsCompleted}`
);

// --------------------------------------------------------------------------
// SECTION 3: Dynamic VM Adversarial XSS / Attribute Breakout Injection
// --------------------------------------------------------------------------
console.log('\n--- SECTION 3: Dynamic VM Hostile task.id Attribute Breakout ---');

const hostileIds = [
  'evil" onfocus="alert(1)" autofocus="',
  'hack"><script>alert("XSS")</script><div id="',
  "quote' onclick='bad()'",
  'nested<svg onload="alert(document.cookie)">',
  'complex"&quot;\'&#039;><>&'
];

for (const hostileId of hostileIds) {
  // Test in Backlog
  state.tasks = [{
    id: hostileId,
    title: 'Backlog Hostile Task',
    state: 'backlog',
    createdAt: Date.now(),
    microSteps: []
  }];
  state.activeTaskId = null;
  app.render();
  const backlogHtml = app.mockDocument.getElementById('backlog-list').innerHTML;
  const breaksBacklogAttr = backlogHtml.includes('data-task-id="' + hostileId + '"') ||
    backlogHtml.includes('<script>') ||
    backlogHtml.includes('<img src=x') ||
    backlogHtml.includes('<svg onload=');
  assertCheck(
    `Backlog DOM safely escapes hostile task.id (${hostileId.substring(0, 20)}...)`,
    !breaksBacklogAttr,
    `Raw unescaped markup found in backlog innerHTML`
  );

  // Test in Parking Lot
  state.tasks = [{
    id: hostileId,
    title: 'Parked Hostile Task',
    state: 'parked',
    parkedReason: 'Testing',
    createdAt: Date.now(),
    microSteps: []
  }];
  app.render();
  const parkedHtml = app.mockDocument.getElementById('parking-lot-content').innerHTML;
  const breaksParkedAttr = parkedHtml.includes('data-task-id="' + hostileId + '"') ||
    parkedHtml.includes('<script>') ||
    parkedHtml.includes('<img src=x') ||
    parkedHtml.includes('<svg onload=');
  assertCheck(
    `Parking Lot DOM safely escapes hostile task.id (${hostileId.substring(0, 20)}...)`,
    !breaksParkedAttr,
    `Raw unescaped markup found in parking lot innerHTML`
  );

  // Test in Victory Log
  state.tasks = [{
    id: hostileId,
    title: 'Victory Hostile Task',
    state: 'completed',
    completedAt: Date.now(),
    microSteps: []
  }];
  app.render();
  const victoryHtml = app.mockDocument.getElementById('victory-log-content').innerHTML;
  const breaksVictoryAttr = victoryHtml.includes('data-task-id="' + hostileId + '"') ||
    victoryHtml.includes('<script>') ||
    victoryHtml.includes('<img src=x') ||
    victoryHtml.includes('<svg onload=');
  assertCheck(
    `Victory Log DOM safely escapes hostile task.id (${hostileId.substring(0, 20)}...)`,
    !breaksVictoryAttr,
    `Raw unescaped markup found in victory log innerHTML`
  );
}


// --------------------------------------------------------------------------
// SECTION 4: Regression Test Executions
// --------------------------------------------------------------------------
console.log('\n--- SECTION 4: Regression Suites Execution ---');

try {
  const stressOutput = execSync('node tests/adversarial_stress_suite.js', { encoding: 'utf8' });
  const has141Passes = stressOutput.includes('Passed: 141') && stressOutput.includes('Failed: 0');
  assertCheck('adversarial_stress_suite.js: 141 assertions pass with 0 failures', has141Passes);
} catch (err) {
  assertCheck('adversarial_stress_suite.js execution', false, err.message);
}

try {
  const devOutput = execSync('node .agents/worker_app_1/test_runner.js', { encoding: 'utf8' });
  const hasAllPass = devOutput.includes('ALL VERIFICATION TESTS PASSED SUCCESSFULLY');
  assertCheck('worker_app_1/test_runner.js: all suites pass', hasAllPass);
} catch (err) {
  assertCheck('worker_app_1/test_runner.js execution', false, err.message);
}

console.log('\n================================================================');
console.log(`TOTAL CHECKS: ${passCount + failCount}`);
console.log(`PASSED: ${passCount}`);
console.log(`FAILED: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
