/**
 * ADVERSARIAL STRESS TEST HARNESS — ModelTasker TDAH (index.html)
 * Author: challenger_1 (Empirical Challenger Subagent)
 * Date: 2026-09-11
 *
 * This test runner executes hostile stress tests against the production web application
 * index.html, verifying edge cases, input fuzzing, state machine invariants,
 * microstep lifecycles, persistence resilience, backup security, and offline purity.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// 1. Read index.html
const htmlPath = path.resolve(__dirname, '../index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('FATAL: index.html not found at', htmlPath);
  process.exit(1);
}
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Test statistics
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const findings = [];

function check(desc, condition, details = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${desc}`);
  } else {
    failedAssertions++;
    const errMsg = `FAIL: ${desc}${details ? ' — ' + details : ''}`;
    console.error(`  [FAIL] ${errMsg}`);
    findings.push({ desc, details, severity: 'HIGH' });
  }
}

console.log('================================================================');
console.log('   EMPIRICAL ADVERSARIAL STRESS SUITE: ModelTasker TDAH');
console.log('================================================================\n');

// --------------------------------------------------------------------------
// SUITE 1: Offline Autonomy, Zero-Dependency Purity & Network Isolation
// --------------------------------------------------------------------------
console.log('--- SUITE 1: Offline Autonomy & Zero-Dependency Purity ---');

// 1.1 Remote scripts
const remoteScripts = htmlContent.match(/<script[^>]+src=["'](https?:|\/\/)[^"']+["']/gi) || [];
check('Zero remote <script src="..."> tags', remoteScripts.length === 0, remoteScripts.join(', '));

// 1.2 Remote stylesheets or preconnects
const remoteLinks = htmlContent.match(/<link[^>]+href=["'](https?:|\/\/)[^"']+["']/gi) || [];
check('Zero remote <link href="..."> tags (fonts, stylesheets, CDNs)', remoteLinks.length === 0, remoteLinks.join(', '));

// 1.3 Remote CSS imports or urls
const cssImports = htmlContent.match(/@import[^;]+(https?:|\/\/)[^;]+;/gi) || [];
check('Zero remote @import in CSS', cssImports.length === 0, cssImports.join(', '));

const cssUrls = htmlContent.match(/url\(['"]?(https?:|\/\/)[^'")]+['"]?\)/gi) || [];
check('Zero remote url(...) in CSS', cssUrls.length === 0, cssUrls.join(', '));

// 1.4 Network API usage in JavaScript
const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/i);
check('Embedded <script> tag found', scriptMatch !== null);
const scriptCode = scriptMatch ? scriptMatch[1] : '';

const networkApis = ['fetch(', 'XMLHttpRequest', 'new WebSocket', 'navigator.sendBeacon', 'new EventSource'];
for (const api of networkApis) {
  check(`Zero network API calls: ${api}`, !scriptCode.includes(api), `Found occurrence of ${api}`);
}

// 1.5 Remote HTTP/HTTPS links
const allRemoteUrls = (htmlContent.match(/https?:\/\/[^\s"'>]+/g) || [])
  .filter(u => !u.includes('w3.org')); // W3C namespaces are standard non-network xmlns
check('Zero external tracking, telemetric, or CDN URLs', allRemoteUrls.length === 0, allRemoteUrls.join(', '));


// --------------------------------------------------------------------------
// DOM & BROWSER MOCK HARNESS SETUP
// --------------------------------------------------------------------------

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.attributes = {};
    this.style = {};
    this.value = '';
    this.textContentValue = '';
    this.innerHTMLValue = '';
    this.children = [];
    this.onclick = null;
    this.onsubmit = null;
    this.onchange = null;
    this.oninput = null;
    this.focused = false;
    this.selected = false;
    this.classList = {
      _set: new Set(),
      add: (...classes) => {
        classes.forEach(c => {
          if (c) this.classList._set.add(c);
        });
        this.className = Array.from(this.classList._set).join(' ');
      },
      remove: (...classes) => {
        classes.forEach(c => this.classList._set.delete(c));
        this.className = Array.from(this.classList._set).join(' ');
      },
      contains: (c) => this.classList._set.has(c),
      toggle: (c) => {
        if (this.classList._set.has(c)) {
          this.classList._set.delete(c);
          this.className = Array.from(this.classList._set).join(' ');
          return false;
        }
        this.classList._set.add(c);
        this.className = Array.from(this.classList._set).join(' ');
        return true;
      }
    };
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'id') this.id = String(v);
    if (k === 'class') {
      this.className = String(v);
      this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
    }
  }
  getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'id') this.id = '';
    if (k === 'class') {
      this.className = '';
      this.classList._set.clear();
    }
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  click() {
    if (this.onclick) {
      this.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
    }
  }

  get textContent() { return this.textContentValue; }
  set textContent(v) { this.textContentValue = String(v); }

  get innerHTML() { return this.innerHTMLValue; }
  set innerHTML(html) {
    this.innerHTMLValue = html;
    this.parseDOMFromHTML(html);
  }

  parseDOMFromHTML(html) {
    this.children = [];
    if (!html || typeof html !== 'string') return;

    // Match HTML opening tags and self-closing tags
    const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1];
      const rawAttrs = match[2];
      if (tagName.startsWith('/')) continue; // skip closing tags

      const el = new MockElement(tagName);

      // Parse attributes
      const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
        el.setAttribute(attrName, attrVal);
      }

      this.children.push(el);

      if (el.id) {
        mockDocument.elements[el.id] = el;
      }
      const testid = el.getAttribute('data-testid');
      if (testid) {
        mockDocument.testidElements[testid] = el;
      }
    }
  }

  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll(sel) {
    const results = [];
    const checkEl = (el) => {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        if (el.classList.contains(cls)) results.push(el);
      } else if (sel.startsWith('#')) {
        const id = sel.slice(1);
        if (el.id === id) results.push(el);
      } else if (sel.startsWith('[')) {
        const attrMatch = sel.match(/\[([a-zA-Z0-9\-]+)(?:=["']?([^"']*)["']?)?\]/);
        if (attrMatch) {
          const name = attrMatch[1];
          const val = attrMatch[2];
          if (val !== undefined) {
            if (el.getAttribute(name) === val) results.push(el);
          } else {
            if (el.getAttribute(name) !== null) results.push(el);
          }
        }
      } else {
        if (el.tagName.toLowerCase() === sel.toLowerCase()) results.push(el);
      }
      for (const child of el.children) {
        checkEl(child);
      }
    };

    for (const child of this.children) {
      checkEl(child);
    }
    return results;
  }

  appendChild(el) { this.children.push(el); return el; }
  removeChild(el) { this.children = this.children.filter(c => c !== el); return el; }
  closest() { return null; }
}

let mockStorage = {};
const mockLocalStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(mockStorage, k) ? mockStorage[k] : null),
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { mockStorage = {}; }
};

const windowListeners = {};
const docListeners = {};

const mockDocument = {
  readyState: 'complete',
  documentElement: new MockElement('html'),
  body: new MockElement('body'),
  elements: {},
  testidElements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = new MockElement('div', id);
    }
    return this.elements[id];
  },
  querySelector(sel) {
    if (sel.startsWith('[data-testid="')) {
      const id = sel.slice(14, -2);
      if (this.testidElements[id]) return this.testidElements[id];
      const el = new MockElement('div');
      el.setAttribute('data-testid', id);
      this.testidElements[id] = el;
      return el;
    }
    if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
    if (sel === '.current-microstep-card') return this.getElementById('current-microstep-card');
    return null;
  },
  querySelectorAll() { return []; },
  createElement(tag) { return new MockElement(tag); },
  addEventListener(event, fn) {
    docListeners[event] = docListeners[event] || [];
    docListeners[event].push(fn);
  }
};

const mockWindow = {
  localStorage: mockLocalStorage,
  addEventListener(event, fn) {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(fn);
  },
  AudioContext: null
};

let downloadedBlobContent = null;
let downloadedFileName = null;

class MockFileReader {
  constructor() {
    this.onload = null;
  }
  readAsText(file) {
    if (this.onload) {
      this.onload({ target: { result: file.content } });
    }
  }
}

class MockBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options ? options.type : '';
    this.content = parts.join('');
  }
}

const mockURL = {
  createObjectURL: (blob) => {
    downloadedBlobContent = blob.content;
    return 'blob:mock-url-' + Date.now();
  },
  revokeObjectURL: () => {}
};

function createSandbox() {
  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    setTimeout: (fn, delay) => { fn(); return 1; },
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date: Date,
    Math: Math,
    JSON: JSON,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Array: Array,
    Blob: MockBlob,
    URL: mockURL,
    FileReader: MockFileReader
  };
  vm.createContext(sandbox);
  return sandbox;
}

// Instantiate first sandbox
let activeSandbox = createSandbox();
vm.runInContext(scriptCode, activeSandbox);
const app = mockWindow.__modeltasker;

check('App exposed testing interface window.__modeltasker', typeof app === 'object' && app !== null);
check('App initialized clean state version 1', app.getState().version === 1);


// --------------------------------------------------------------------------
// SUITE 2: Edge Cases & Input Fuzzing (Extreme, Malicious & Boundary Data)
// --------------------------------------------------------------------------
console.log('\n--- SUITE 2: Edge Cases & Input Fuzzing ---');

const captureInput = mockDocument.getElementById('task-capture-input');
const captureForm = mockDocument.getElementById('task-capture-form');

// 2.1 Empty string input
captureInput.value = '';
captureInput.focused = false;
captureForm.onsubmit({ preventDefault: () => {} });
check('Empty string task capture is rejected silently', app.getState().tasks.length === 0);
check('Input retains focus after empty rejection', captureInput.focused === true);

// 2.2 Whitespace-only string input
captureInput.value = '   \t\r\n   ';
captureInput.focused = false;
captureForm.onsubmit({ preventDefault: () => {} });
check('Whitespace-only task capture is rejected silently', app.getState().tasks.length === 0);
check('Input retains focus after whitespace rejection', captureInput.focused === true);

// 2.3 Extreme length task capture (> 5,000 chars)
const extremeLengthText = 'TDAH_EXTREME_' + 'X'.repeat(5000);
captureInput.value = extremeLengthText;
captureForm.onsubmit({ preventDefault: () => {} });
const taskExtreme = app.getState().tasks[0];
check('Extreme length task (>5k chars) captured without truncation', taskExtreme && taskExtreme.title === extremeLengthText);

// 2.4 Multiline string with mixed CRLF
const multilineText = "Línea 1: Revisar correo\r\nLínea 2: Redactar respuesta\nLínea 3: Enviar confirmación";
captureInput.value = multilineText;
captureForm.onsubmit({ preventDefault: () => {} });
const taskMultiline = app.getState().tasks[0];
check('Multiline task captured and preserved', taskMultiline && taskMultiline.title === multilineText);

// 2.5 Unicode, Emojis, RTL, and diacritics
const unicodeText = '🧠 Foco TDAH: ñoño über naïve 漢字 𝕿𝖊𝖘𝖙 👨‍👩‍👧‍👦 RTL: עִבְרִית / العربية 🚀';
captureInput.value = unicodeText;
captureForm.onsubmit({ preventDefault: () => {} });
const taskUnicode = app.getState().tasks[0];
check('Unicode, Emojis, and RTL characters preserved intact', taskUnicode && taskUnicode.title === unicodeText);

// 2.6 Control characters fuzzing
const controlText = 'Task with control \0 \x01 \b \f \u200B \u202E RTL-override';
captureInput.value = controlText;
captureForm.onsubmit({ preventDefault: () => {} });
const taskControl = app.getState().tasks[0];
check('Control characters handled without throwing', taskControl && typeof taskControl.title === 'string');

// 2.7 Malicious XSS Payloads in Task Title
const xssPayloads = [
  '<script>alert("xss1")</script>',
  '<img src="x" onerror="alert(\'xss2\')">',
  '"><svg/onload=alert(1)>',
  '"><iframe src="javascript:alert(1)"></iframe>',
  'javascript:alert("xss5")',
  '\'" onfocus="alert(1)" autofocus'
];

for (let i = 0; i < xssPayloads.length; i++) {
  const payload = xssPayloads[i];
  captureInput.value = payload;
  captureForm.onsubmit({ preventDefault: () => {} });
  const captured = app.getState().tasks[0];
  check(`XSS Payload ${i + 1} captured safely in state`, captured.title === payload);

  // Check that rendered backlog does NOT inject raw unescaped script tag
  const backlogHTML = mockDocument.getElementById('backlog-list').innerHTML;
  check(`XSS Payload ${i + 1} escaped in Backlog DOM (<script> not rendered raw)`,
    !backlogHTML.includes('<script>') && !backlogHTML.includes('<img src="x"') && !backlogHTML.includes('<svg/onload')
  );
}

// 2.8 Micro-step Input Fuzzing
// Focus a task first to activate WIP=1
const taskToFocus = app.getState().tasks.find(t => t.title === unicodeText);
app.focusTask(taskToFocus.id);

const jitInput = mockDocument.getElementById('jit-microstep-input');
const jitForm = mockDocument.getElementById('jit-microstep-form');

// 2.8.1 Empty microstep rejection
const initialStepsCount = taskToFocus.microSteps.length;
jitInput.value = '';
app.addMicrostep();
check('Empty microstep is rejected', taskToFocus.microSteps.length === initialStepsCount);

jitInput.value = '   \t  ';
app.addMicrostep();
check('Whitespace microstep is rejected', taskToFocus.microSteps.length === initialStepsCount);

// 2.8.2 Character warning hint (> 140 chars)
jitInput.value = 'A'.repeat(141);
if (jitInput.oninput) jitInput.oninput();
const jitHint = mockDocument.getElementById('jit-character-hint');
check('Warning hint triggered for microstep > 140 chars', jitHint.textContent.includes('Sugerencia TDAH'));

// 2.8.3 Extreme length microstep (>2k chars)
const extremeStepText = 'STEP_' + 'Y'.repeat(2500);
mockDocument.getElementById('jit-microstep-input').value = extremeStepText;
app.addMicrostep();
check('Extreme length microstep (>2.5k chars) added to task',
  taskToFocus.microSteps.some(s => s.text === extremeStepText)
);

// Complete the extreme step so the next step becomes active
app.completeMicrostep();

// 2.8.4 XSS Payload in microstep
const stepXss = '<b onmouseover=alert(1)>microstep</b>';
mockDocument.getElementById('jit-microstep-input').value = stepXss;
app.addMicrostep();
app.render(); // Ensure active card re-renders with new current step
const activeCardHTML = mockDocument.getElementById('active-wip-container').innerHTML;
check('XSS in microstep is escaped in Active WIP card',
  !activeCardHTML.includes('<b onmouseover') && activeCardHTML.includes('&lt;b onmouseover'),
  `activeCardHTML was: ${activeCardHTML.substring(0, 200)}...`
);


// --------------------------------------------------------------------------
// SUITE 3: State Machine & Strict WIP=1 Invariants
// --------------------------------------------------------------------------
console.log('\n--- SUITE 3: State Machine & Strict WIP=1 Invariants ---');

// Reset to clean test state
app.resetApp();
// Confirm reset via modal confirm button
const resetConfirmBtn = mockDocument.getElementById('modal-confirm-btn');
if (resetConfirmBtn) resetConfirmBtn.click();
check('App successfully reset to virgin state', app.getState().tasks.length === 0);

// Create 3 distinct tasks
captureInput.value = 'Tarea Alfa';
captureForm.onsubmit({ preventDefault: () => {} });
captureInput.value = 'Tarea Beta';
captureForm.onsubmit({ preventDefault: () => {} });
captureInput.value = 'Tarea Gamma';
captureForm.onsubmit({ preventDefault: () => {} });

const [gamma, beta, alfa] = app.getState().tasks;

// 3.1 Activate Tarea Alfa
app.focusTask(alfa.id);
check('Tarea Alfa is active in state', app.getState().activeTaskId === alfa.id && alfa.state === 'active');

// 3.2 Attempt concurrent activation of Tarea Beta while Alfa is active
app.focusTask(beta.id);
const modalContainer = mockDocument.getElementById('modal-container');
check('Modal dialog opened when attempting second active task (WIP=1 invariant check)',
  !modalContainer.classList.contains('hidden') && modalContainer.innerHTML.includes('Límite Estricto WIP=1')
);
check('Tarea Alfa remains active BEFORE modal confirmation', app.getState().activeTaskId === alfa.id);
check('Tarea Beta remains in backlog BEFORE modal confirmation', beta.state === 'backlog');

// 3.3 Confirm modal: Park Alfa and Focus Beta
const modalConfirmBtn = mockDocument.getElementById('modal-confirm-btn');
modalConfirmBtn.click();

check('Tarea Alfa transited to parked state upon confirmation', alfa.state === 'parked' && typeof alfa.parkedAt === 'number');
check('Tarea Beta transited to active state', beta.state === 'active' && app.getState().activeTaskId === beta.id);
check('Strict WIP=1 maintained: Exactly 1 task active',
  app.getState().tasks.filter(t => t.state === 'active').length === 1
);

// 3.4 Idempotency: Focusing the ALREADY active task must not open modal or corrupt state
modalContainer.classList.add('hidden'); // ensure clean slate
app.focusTask(beta.id);
check('Focusing already active task is idempotent (no modal opened)',
  modalContainer.classList.contains('hidden') && app.getState().activeTaskId === beta.id
);

// 3.5 Focus non-existent task ID
app.focusTask('non_existent_id_404');
check('Focusing invalid task ID is safely ignored', app.getState().activeTaskId === beta.id);

// 3.6 Unpark conflict handling (WIP=1 enforcement from Parking Lot)
// Currently Beta is active, Alfa is parked. Attempt to unpark Alfa.
app.unparkTask(alfa.id);
check('Modal opened when attempting to unpark while another task is in focus',
  !modalContainer.classList.contains('hidden') && modalContainer.innerHTML.includes('Conflicto de Foco (WIP=1)')
);

// 3.6.1 Test cancellation of unpark: move to backlog
const modalCancelBtn = mockDocument.getElementById('modal-cancel-btn');
modalCancelBtn.click();
check('Cancelling unpark modal moves target task to backlog', alfa.state === 'backlog');
check('Current active task Beta remains active', beta.state === 'active' && app.getState().activeTaskId === beta.id);

// 3.7 Return to Backlog (unfocusActiveTask)
mockDocument.getElementById('unfocus-task-btn').click();
check('unfocusActiveTask returned Beta to backlog', beta.state === 'backlog');
check('activeTaskId is null (WIP=0)', app.getState().activeTaskId === null);
check('Active WIP container rendered empty', mockDocument.getElementById('active-wip-container').innerHTML === '');

// 3.8 Park and Unpark with WIP=0 (Direct unpark)
app.focusTask(gamma.id);
app.parkActiveTask();
check('parkActiveTask moved Gamma to parked', gamma.state === 'parked' && app.getState().activeTaskId === null);
check('Parking badge count is 1', mockDocument.getElementById('parking-badge-count').textContent === '1');

// Now WIP is 0. Unpark Gamma directly without modal!
app.unparkTask(gamma.id);
check('Direct unpark with WIP=0 activates Gamma without modal',
  gamma.state === 'active' && app.getState().activeTaskId === gamma.id
);

// 3.9 Deleting a task from Backlog via UI delete button
// Gamma is active: return to backlog first
mockDocument.getElementById('unfocus-task-btn').click();
check('Gamma returned to backlog before deletion', gamma.state === 'backlog');

const backlogListEl = mockDocument.getElementById('backlog-list');
const gammaDeleteBtn = backlogListEl.querySelector(`[data-delete-id="${gamma.id}"]`);
check('Delete button exists for Gamma in Backlog', gammaDeleteBtn !== null);
if (gammaDeleteBtn) gammaDeleteBtn.click();
check('Clicking delete button removes Gamma from tasks', !app.getState().tasks.some(t => t.id === gamma.id));
check('activeTaskId remains null after deletion', app.getState().activeTaskId === null);

// 3.10 Rapid Stress Transition Loop (100 sequential cycles)
let loopInvariantViolation = false;
for (let i = 0; i < 50; i++) {
  // Capture
  captureInput.value = `Stress Task ${i}`;
  captureForm.onsubmit({ preventDefault: () => {} });
  const t = app.getState().tasks[0];

  // Focus
  app.focusTask(t.id);
  if (app.getState().activeTaskId !== t.id) loopInvariantViolation = true;

  // Add microstep
  mockDocument.getElementById('jit-microstep-input').value = `Step 1 for ${i}`;
  app.addMicrostep();

  // Complete microstep
  app.completeMicrostep();

  // Park
  app.parkActiveTask();
  if (app.getState().activeTaskId !== null) loopInvariantViolation = true;

  // Unpark
  app.unparkTask(t.id);
  if (app.getState().activeTaskId !== t.id) loopInvariantViolation = true;

  // Complete task
  app.completeActiveTask();
  if (app.getState().activeTaskId !== null) loopInvariantViolation = true;
}

check('Rapid 50-iteration lifecycle stress loop completed with zero invariant violations', !loopInvariantViolation);
check('Victory stats incremented accurately in stress loop', app.getState().stats.totalVictories >= 50);


// --------------------------------------------------------------------------
// SUITE 4: Microstep Lifecycle & Idempotency Audit
// --------------------------------------------------------------------------
console.log('\n--- SUITE 4: Microstep Lifecycle & Idempotency Audit ---');

// Setup a fresh task
captureInput.value = 'Tarea de Micro-pasos';
captureForm.onsubmit({ preventDefault: () => {} });
const microTask = app.getState().tasks[0];
app.focusTask(microTask.id);

// 4.1 Calling completeMicrostep on task with zero steps
const preStats = app.getState().stats.totalMicroStepsCompleted;
app.completeMicrostep();
check('completeMicrostep() with 0 steps is safe no-op',
  app.getState().stats.totalMicroStepsCompleted === preStats
);

// 4.2 Add microstep 1
mockDocument.getElementById('jit-microstep-input').value = 'Paso elemental A';
app.addMicrostep();
const stepA = microTask.microSteps[0];
check('Microstep A added and initially incomplete', stepA.completed === false);

// 4.3 Complete microstep 1 once
app.completeMicrostep(stepA.id);
check('Microstep A marked completed', stepA.completed === true);
const statsAfterOneCompletion = app.getState().stats.totalMicroStepsCompleted;

// 4.4 ADVERSARIAL CHALLENGE: Repeated clicks on ALREADY COMPLETED microstep
app.completeMicrostep(stepA.id);
app.completeMicrostep(stepA.id);
app.completeMicrostep(stepA.id);
const statsAfterRepeatedClicks = app.getState().stats.totalMicroStepsCompleted;

if (statsAfterRepeatedClicks > statsAfterOneCompletion) {
  check('Idempotency of completeMicrostep (repeated clicks overcount stats)', false,
    `BUG DETECTED: totalMicroStepsCompleted incremented from ${statsAfterOneCompletion} to ${statsAfterRepeatedClicks} on already completed step`
  );
} else {
  check('Idempotency of completeMicrostep holds (no overcounting)', true);
}

// 4.5 Complete task directly without remaining microsteps
app.completeActiveTask();
check('Task completed into Victory Log', microTask.state === 'completed');
const victoryHTML = mockDocument.getElementById('victory-log-content').innerHTML;
check('Victory Log renders task item', victoryHTML.includes(`data-testid="victory-item-${microTask.id}"`));


// --------------------------------------------------------------------------
// SUITE 5: Persistence & Corruption Resilience
// --------------------------------------------------------------------------
console.log('\n--- SUITE 5: Persistence & Corruption Resilience ---');

// 5.1 F5 Reload Fidelity Test
// Create a rich state
captureInput.value = 'Backlog Item 1';
captureForm.onsubmit({ preventDefault: () => {} });
captureInput.value = 'Backlog Item 2';
captureForm.onsubmit({ preventDefault: () => {} });
captureInput.value = 'Active Item';
captureForm.onsubmit({ preventDefault: () => {} });
const activeItem = app.getState().tasks[0];
app.focusTask(activeItem.id);
mockDocument.getElementById('jit-microstep-input').value = 'Sub-action 1';
app.addMicrostep();

captureInput.value = 'Parked Item';
captureForm.onsubmit({ preventDefault: () => {} });
const parkedItem = app.getState().tasks[0];
// Focus and park it using official app action
app.focusTask(parkedItem.id);
// Modal confirms parking activeItem and focusing parkedItem
const confirmModalBtn = mockDocument.getElementById('modal-confirm-btn');
if (confirmModalBtn) confirmModalBtn.click();
// Now park parkedItem
app.parkActiveTask();

// Re-focus activeItem
app.unparkTask(activeItem.id);

// State serialized in mockLocalStorage
const preReloadSerialized = mockLocalStorage.getItem('modeltasker_tdah_state_v1');
check('State serialized in localStorage under modeltasker_tdah_state_v1', preReloadSerialized !== null);

// Simulate browser F5 refresh by booting fresh VM sandbox with same localStorage
const f5Sandbox = createSandbox();
vm.runInContext(scriptCode, f5Sandbox);
const reloadedApp = f5Sandbox.window.__modeltasker;
const reloadedState = reloadedApp.getState();

check('F5 Reload restores version 1', reloadedState.version === 1);
check('F5 Reload restores activeTaskId', reloadedState.activeTaskId === activeItem.id);
check('F5 Reload restores tasks count', reloadedState.tasks.length === app.getState().tasks.length);
check('F5 Reload restores parked item',
  reloadedState.tasks.some(t => t.id === parkedItem.id && t.state === 'parked')
);
check('F5 Reload restores active task microstep',
  reloadedState.tasks.find(t => t.id === activeItem.id).microSteps[0].text === 'Sub-action 1'
);

// 5.2 Corrupted JSON Recovery & Backup Creation
mockLocalStorage.setItem('modeltasker_tdah_state_v1', '!!!INVALID_SYNTAX_CORRUPTED_JSON###');
const corruptSandbox = createSandbox();
vm.runInContext(scriptCode, corruptSandbox);
const healedApp = corruptSandbox.window.__modeltasker;
const healedState = healedApp.getState();

check('Corrupted JSON does not crash initialization', healedState && healedState.version === 1);
check('Corrupted JSON initializes clean tasks array', Array.isArray(healedState.tasks) && healedState.tasks.length === 0);

// Check backup key was created
const backupKeys = Object.keys(mockStorage).filter(k => k.startsWith('modeltasker_corrupted_backup_'));
check('Corrupted string preserved in modeltasker_corrupted_backup_<timestamp>',
  backupKeys.length > 0 && mockStorage[backupKeys[0]] === '!!!INVALID_SYNTAX_CORRUPTED_JSON###'
);

// 5.3 Schema Healing for Malformed Object (e.g. tasks is not array or has corrupted elements)
mockLocalStorage.setItem('modeltasker_tdah_state_v1', JSON.stringify({
  version: 1,
  activeTaskId: 'ghost_task_id',
  tasks: [
    null,
    12345,
    "corrupt string item",
    { id: 'custom_1', title: 'Valid healed task', state: 'invalid_state', microSteps: 'not_array' },
    {}
  ],
  preferences: null,
  stats: { totalVictories: 'not_a_number' }
}));

const schemaSandbox = createSandbox();
vm.runInContext(scriptCode, schemaSandbox);
const schemaApp = schemaSandbox.window.__modeltasker;
const schemaState = schemaApp.getState();

check('Malformed tasks list sanitized without crashing', Array.isArray(schemaState.tasks));
check('Null and primitive task items healed into valid Task objects',
  schemaState.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string')
);
const healedTask = schemaState.tasks.find(t => t.id === 'custom_1');
check('Invalid task state defaulted to backlog', healedTask && healedTask.state === 'backlog');
check('Invalid microSteps property normalized to empty array', healedTask && Array.isArray(healedTask.microSteps));
check('Malformed stat counter defaulted to 0', schemaState.stats.totalVictories === 0);

// 5.4 Storage Quota Exceeded (QuotaExceededError) Resilience
const originalSetItem = mockLocalStorage.setItem;
let quotaErrorLogged = false;
mockLocalStorage.setItem = (k, v) => {
  const quotaErr = new Error('The quota has been exceeded.');
  quotaErr.name = 'QuotaExceededError';
  quotaErrorLogged = true;
  throw quotaErr;
};

// Calling captureTask under quota full
try {
  // Use schemaApp
  schemaSandbox.document.getElementById('task-capture-input').value = 'Task during quota full';
  schemaSandbox.document.getElementById('task-capture-form').onsubmit({ preventDefault: () => {} });
  check('QuotaExceededError caught gracefully without crashing execution', quotaErrorLogged === true);
} catch (err) {
  check('QuotaExceededError caught gracefully', false, err.message);
} finally {
  mockLocalStorage.setItem = originalSetItem;
}


// --------------------------------------------------------------------------
// SUITE 6: Backup Export & Import Validation
// --------------------------------------------------------------------------
console.log('\n--- SUITE 6: Backup Export & Import Validation ---');

// Restore working sandbox
activeSandbox = createSandbox();
vm.runInContext(scriptCode, activeSandbox);
const expApp = activeSandbox.window.__modeltasker;

// 6.1 Export Data structure
downloadedBlobContent = null;
expApp.exportData();
check('exportData generated a download blob', downloadedBlobContent !== null);

let parsedExport = null;
try {
  parsedExport = JSON.parse(downloadedBlobContent);
} catch (e) {}

check('Exported blob contains valid JSON', parsedExport !== null);
check('Export schema matches AppStateSchemaV1 (version: 1, tasks, preferences, stats)',
  parsedExport && parsedExport.version === 1 && Array.isArray(parsedExport.tasks) &&
  typeof parsedExport.preferences === 'object' && typeof parsedExport.stats === 'object'
);

// 6.2 Safe Import with valid payload
const validImportPayload = JSON.stringify({
  version: 1,
  activeTaskId: null,
  tasks: [
    { id: 'imp_1', title: 'Imported Backlog Task', state: 'backlog', createdAt: Date.now(), microSteps: [] },
    { id: 'imp_2', title: 'Imported Parked Task', state: 'parked', createdAt: Date.now(), parkedReason: 'Prueba', microSteps: [] }
  ],
  preferences: { theme: 'light', parkingLotExpanded: true, victoryLogExpanded: false, soundEnabled: false },
  stats: { totalVictories: 7, totalMicroStepsCompleted: 15 }
});

const importInput = activeSandbox.document.getElementById('import-json-input');
importInput.onchange({ target: { files: [{ content: validImportPayload }], value: '' } });

check('Valid JSON import updates tasks list', expApp.getState().tasks.length === 2);
check('Valid JSON import updates stats', expApp.getState().stats.totalVictories === 7);
check('Valid JSON import applies theme', expApp.getState().preferences.theme === 'light');

// 6.3 Hostile / Corrupted Import Rejection
const currentTasksCount = expApp.getState().tasks.length;

// 6.3.1 Non-JSON string import
importInput.onchange({ target: { files: [{ content: '<html><body>NOT A JSON</body></html>' }], value: '' } });
check('Non-JSON import rejected, current state preserved', expApp.getState().tasks.length === currentTasksCount);

// 6.3.2 Missing tasks array import
importInput.onchange({ target: { files: [{ content: JSON.stringify({ version: 1, other: 123 }) }], value: '' } });
check('Import missing tasks array rejected, current state preserved', expApp.getState().tasks.length === currentTasksCount);

// 6.3.3 Prototype Pollution attempt in import
const protoPollutionPayload = JSON.stringify({
  version: 1,
  tasks: [{ id: 'pollute_1', title: 'Pollution Test', state: 'backlog' }],
  __proto__: { isAdmin: true }
});
importInput.onchange({ target: { files: [{ content: protoPollutionPayload }], value: '' } });
check('Prototype pollution injection attempt does not pollute Object.prototype',
  Object.prototype.isAdmin === undefined
);

// 6.3.4 ADVERSARIAL CHALLENGE: XSS in task.id in imported JSON
const maliciousIdPayload = JSON.stringify({
  version: 1,
  tasks: [
    {
      id: 'malicious"><img src=x onerror=alert("xss-id")><div id="hack',
      title: 'Task with Malicious ID',
      state: 'backlog',
      microSteps: []
    }
  ]
});
importInput.onchange({ target: { files: [{ content: maliciousIdPayload }], value: '' } });
const renderedBacklogAfterMaliciousId = activeSandbox.document.getElementById('backlog-list').innerHTML;

if (renderedBacklogAfterMaliciousId.includes('<img src=x onerror=')) {
  check('Task ID attribute escaping in HTML templates (Unescaped task.id breakout)', false,
    'BUG DETECTED: task.id is interpolated directly without escapeHTML into data-testid and attributes, allowing HTML injection from imported files!'
  );
} else {
  check('Task ID is safely escaped in HTML templates', true);
}


// --------------------------------------------------------------------------
// SUITE 7: UI & Keyboard Accessibility Ergonomics
// --------------------------------------------------------------------------
console.log('\n--- SUITE 7: UI & Keyboard Ergonomics ---');

// 7.1 Keydown Event Listeners
const keydownListeners = windowListeners['keydown'] || [];
check('Global keydown listener registered', keydownListeners.length > 0);

function simulateKeydown(key, altKey = false, ctrlKey = false, metaKey = false) {
  let defaultPrevented = false;
  const event = {
    key,
    altKey,
    ctrlKey,
    metaKey,
    preventDefault: () => { defaultPrevented = true; }
  };
  keydownListeners.forEach(fn => fn(event));
  return defaultPrevented;
}

// Alt+N focuses capture input
const captureEl = activeSandbox.document.getElementById('task-capture-input');
captureEl.focused = false;
const preventedN = simulateKeydown('n', true);
check('Alt+N focuses task capture input and prevents default', preventedN && captureEl.focused === true);

// Alt+M focuses microstep input
const jitEl = activeSandbox.document.getElementById('jit-microstep-input');
jitEl.focused = false;
const preventedM = simulateKeydown('m', true);
check('Alt+M focuses microstep input and prevents default', preventedM && jitEl.focused === true);

// Alt+P triggers parkActiveTask
let parkClicked = false;
activeSandbox.document.getElementById('park-task-btn').onclick = () => { parkClicked = true; };
const preventedP = simulateKeydown('p', true);
check('Alt+P clicks park-task-btn and prevents default', preventedP && parkClicked === true);

// Alt+C triggers completeActiveTask
let completeClicked = false;
activeSandbox.document.getElementById('complete-task-btn').onclick = () => { completeClicked = true; };
const preventedC = simulateKeydown('c', true);
check('Alt+C clicks complete-task-btn and prevents default', preventedC && completeClicked === true);

// Alt+L toggles parking lot
const preExpanded = expApp.getState().preferences.parkingLotExpanded;
simulateKeydown('l', true);
check('Alt+L toggles parking lot expanded state', expApp.getState().preferences.parkingLotExpanded !== preExpanded);

// Alt+V toggles victory log
const preVicExpanded = expApp.getState().preferences.victoryLogExpanded;
simulateKeydown('v', true);
check('Alt+V toggles victory log expanded state', expApp.getState().preferences.victoryLogExpanded !== preVicExpanded);

// Escape closes open modal
const modal = activeSandbox.document.getElementById('modal-container');
modal.classList.remove('hidden');
modal.innerHTML = '<div class="modal-card">Open modal</div>';
const preventedEsc = simulateKeydown('Escape');
check('Escape key closes open modal dialog and prevents default',
  preventedEsc && modal.classList.contains('hidden') && modal.innerHTML === ''
);

// 7.2 Theme switching
const themeBtn = activeSandbox.document.getElementById('theme-toggle-btn');
const initialTheme = expApp.getState().preferences.theme;
themeBtn.click();
check('theme-toggle-btn toggles theme', expApp.getState().preferences.theme !== initialTheme);
check('document.documentElement data-theme attribute updated',
  activeSandbox.document.documentElement.getAttribute('data-theme') === expApp.getState().preferences.theme
);

// 7.3 One-click Parking Lot Toggle button
const parkingToggleBtn = activeSandbox.document.getElementById('parking-lot-toggle');
const stateBeforeToggle = expApp.getState().preferences.parkingLotExpanded;
parkingToggleBtn.click();
check('parking-lot-toggle toggles visibility preference', expApp.getState().preferences.parkingLotExpanded !== stateBeforeToggle);
const parkingContentEl = activeSandbox.document.getElementById('parking-lot-content');
check('parking-lot-content style.display matches expanded state',
  expApp.getState().preferences.parkingLotExpanded ? parkingContentEl.style.display === 'block' : parkingContentEl.style.display === 'none'
);


// --------------------------------------------------------------------------
// SUITE 8: Strict data-testid Adherence Audit
// --------------------------------------------------------------------------
console.log('\n--- SUITE 8: Strict data-testid Adherence Audit ---');

const requiredIds = [
  'app-root', 'capture-section', 'active-wip-container', 'backlog-container',
  'parking-lot-container', 'parking-lot-content', 'victory-log-container',
  'victory-log-content', 'dopamine-toast', 'task-capture-input', 'task-capture-submit',
  'active-task-title', 'jit-microstep-input', 'jit-microstep-submit',
  'current-microstep-text', 'complete-microstep-btn', 'complete-task-btn',
  'park-task-btn', 'unfocus-task-btn', 'parking-lot-toggle', 'parking-badge-count',
  'victory-log-toggle', 'victory-badge-count', 'export-json-btn', 'import-json-input',
  'theme-toggle-btn', 'reset-app-btn'
];

for (const id of requiredIds) {
  check(`Required data-testid="${id}" exists in markup or runtime templates`,
    htmlContent.includes(`data-testid="${id}"`)
  );
}

const requiredPatterns = [
  'task-item-', 'task-focus-btn-', 'parked-item-', 'unpark-task-btn-', 'victory-item-'
];

for (const pat of requiredPatterns) {
  check(`Dynamic pattern data-testid="${pat}*" exists in template code`,
    htmlContent.includes(`data-testid="${pat}`)
  );
}

// --------------------------------------------------------------------------
// SUITE 9: High-Scale Stress Testing (1,000 Tasks)
// --------------------------------------------------------------------------
console.log('\n--- SUITE 9: High-Scale Stress Testing (1,000 Tasks) ---');

const largeScaleTasks = [];
for (let i = 0; i < 1000; i++) {
  const stateType = i < 500 ? 'backlog' : (i < 750 ? 'parked' : 'completed');
  largeScaleTasks.push({
    id: `scale_task_${i}`,
    title: `Scale Task ${i}: Performance and memory test with unicode 🧠`,
    state: stateType,
    createdAt: Date.now() - i * 1000,
    parkedAt: stateType === 'parked' ? Date.now() - 500 : undefined,
    completedAt: stateType === 'completed' ? Date.now() - 200 : undefined,
    microSteps: [
      { id: `step_${i}_1`, text: `Step 1 of task ${i}`, completed: stateType === 'completed', createdAt: Date.now() }
    ]
  });
}

const scaleStatePayload = JSON.stringify({
  version: 1,
  activeTaskId: null,
  tasks: largeScaleTasks,
  preferences: { theme: 'dark', parkingLotExpanded: true, victoryLogExpanded: true, soundEnabled: false },
  stats: { totalVictories: 250, totalMicroStepsCompleted: 250 }
});

const t0 = Date.now();
mockLocalStorage.setItem('modeltasker_tdah_state_v1', scaleStatePayload);
const scaleSandbox = createSandbox();
vm.runInContext(scriptCode, scaleSandbox);
const scaleApp = scaleSandbox.window.__modeltasker;
const t1 = Date.now();

check('1,000 tasks loaded into state without error', scaleApp.getState().tasks.length === 1000);
check(`1,000 tasks parsed and rendered in acceptable time (< 1500ms, actual: ${t1 - t0}ms)`, (t1 - t0) < 1500);

const serializedSize = mockLocalStorage.getItem('modeltasker_tdah_state_v1').length;
check(`1,000 tasks serialize to localStorage well below 5MB quota (< 500KB, actual: ${Math.round(serializedSize / 1024)}KB)`,
  serializedSize < 500 * 1024
);


// --------------------------------------------------------------------------
// SUMMARY AND VERDICT
// --------------------------------------------------------------------------
console.log('\n================================================================');
console.log('   EMPIRICAL ADVERSARIAL TESTING SUMMARY');
console.log('================================================================');
console.log(`Total Assertions: ${totalAssertions}`);
console.log(`Passed: ${passedAssertions}`);
console.log(`Failed: ${failedAssertions}`);
console.log(`Bugs / Vulnerabilities Found: ${findings.length}`);

if (findings.length > 0) {
  console.log('\nDiscovered Findings:');
  findings.forEach((f, i) => {
    console.log(`  ${i + 1}. [${f.severity}] ${f.desc}`);
    if (f.details) console.log(`     Details: ${f.details}`);
  });
}
console.log('================================================================\n');

process.exit(failedAssertions > 0 ? 1 : 0);
