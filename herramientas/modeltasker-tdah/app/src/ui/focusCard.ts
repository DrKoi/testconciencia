import type { Store } from '../state/store';
import type { Task } from '../types';
import { el, replaceChildren } from '../lib/dom';
import { relativeAge } from '../lib/time';
import { playDopamineChime } from '../lib/sound';
import { showToast } from '../lib/toast';

function focusMicrostepInput(): void {
  setTimeout(() => {
    (document.getElementById('jit-microstep-input') as HTMLInputElement | null)?.focus();
  }, 50);
}

function buildTitleRow(store: Store, task: Task): HTMLElement {
  const titleText = el('h2', {
    id: 'active-task-title',
    className: 'active-task-title',
    tabIndex: 0,
    title: 'Clic para editar el título'
  }, [task.title]);

  const editBtn = el('button', {
    className: 'subtle-btn title-edit-btn',
    title: 'Editar título de la tarea',
    'aria-label': 'Editar título'
  }, ['✏️']);

  const startEdit = () => {
    const input = el('input', {
      className: 'title-edit-input',
      type: 'text',
      value: task.title,
      'aria-label': 'Editar título de la tarea'
    }) as HTMLInputElement;

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      const trimmed = input.value.trim();
      if (trimmed && trimmed !== task.title) {
        store.updateTaskTitle(task.id, trimmed);
      } else {
        input.replaceWith(buildTitleRow(store, task));
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        settled = true;
        input.replaceWith(buildTitleRow(store, task));
      }
    });
    input.addEventListener('blur', commit);
    row.replaceWith(input);
    input.focus();
    input.select();
  };

  titleText.addEventListener('click', startEdit);
  editBtn.addEventListener('click', startEdit);

  const row = el('div', { className: 'active-title-row' }, [titleText, editBtn]);
  return row;
}

function buildNotesSection(store: Store, task: Task): HTMLElement {
  const hasNotes = task.notes.trim().length > 0;
  const wrapper = el('div', { className: 'notes-section' });

  const toggle = el('button', { className: 'subtle-btn notes-toggle-btn' }, [hasNotes ? '📝 Ver nota' : '+ Añadir nota']);
  const box = el('div', { className: 'notes-box hidden' });
  const textarea = el('textarea', {
    className: 'notes-textarea',
    placeholder: 'Nota opcional: contexto, enlaces, por qué importa...',
    rows: '3'
  }) as HTMLTextAreaElement;
  textarea.value = task.notes;
  textarea.addEventListener('blur', () => store.updateTaskNotes(task.id, textarea.value));
  box.appendChild(textarea);

  let expanded = hasNotes;
  const syncVisibility = () => {
    box.classList.toggle('hidden', !expanded);
    toggle.textContent = expanded ? '▾ Ocultar nota' : (task.notes.trim() ? '📝 Ver nota' : '+ Añadir nota');
  };
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    syncVisibility();
    if (expanded) textarea.focus();
  });
  syncVisibility();

  wrapper.appendChild(toggle);
  wrapper.appendChild(box);
  return wrapper;
}

export function renderActiveWip(store: Store): void {
  const container = document.getElementById('active-wip-container');
  if (!container) return;
  const task = store.getActiveTask();

  if (!task) {
    container.innerHTML = '';
    return;
  }

  const uncompletedSteps = task.microSteps.filter((s) => !s.completed);
  const completedSteps = task.microSteps.filter((s) => s.completed);
  const currentStep = uncompletedSteps[0] ?? (completedSteps.length ? completedSteps[completedSteps.length - 1] : null);

  const topBar = el('div', { className: 'focus-top-bar' }, [
    el('span', { className: 'focus-badge' }, ['⚡ EN FOCO AHORA (WIP=1)']),
    el('span', { className: 'age-badge', title: 'Antigüedad de la tarea' }, [relativeAge(task.createdAt)]),
    el('button', {
      id: 'unfocus-task-btn',
      className: 'subtle-btn',
      title: 'Volver al Backlog sin aparcar',
      onclick: () => {
        store.unfocusActiveTask();
        showToast('Tarea devuelta al Backlog.');
      }
    }, ['Volver al Backlog'])
  ]);

  const jitInput = el('input', {
    type: 'text',
    id: 'jit-microstep-input',
    className: 'jit-input',
    placeholder: 'Ej: Abrir archivo, escribir 1 párrafo, enviar correo...',
    autocomplete: 'off'
  }) as HTMLInputElement;

  const jitHint = el('p', { className: 'jit-hint' });
  jitInput.addEventListener('input', () => {
    if (jitInput.value.length > 140) {
      jitHint.textContent = '💡 Sugerencia: si parece muy grande, busca una acción física de < 5 min (ej. "Abrir archivo")';
      jitHint.className = 'jit-hint warn';
    } else {
      jitHint.textContent = '';
      jitHint.className = 'jit-hint';
    }
  });

  const jitForm = el('form', {
    id: 'jit-microstep-form',
    className: 'jit-form',
    onsubmit: (e: Event) => {
      e.preventDefault();
      if (store.addMicrostep(jitInput.value)) {
        jitInput.value = '';
        jitHint.textContent = '';
        showToast('Micro-paso añadido. ¡Un pequeño empujón físico!');
      } else {
        jitInput.focus();
      }
    }
  }, [
    el('div', { className: 'input-action-row' }, [
      jitInput,
      el('button', { type: 'submit', id: 'jit-microstep-submit', className: 'secondary-btn' }, ['Añadir Micro-paso'])
    ]),
    jitHint
  ]);

  const currentStepCard = el('div', {
    className: 'current-microstep-card',
    style: currentStep ? '' : 'display:none;'
  }, [
    el('button', {
      id: 'complete-microstep-btn',
      className: 'microstep-checkbox' + (currentStep?.completed ? ' is-completed' : ''),
      'aria-label': 'Completar micro-paso',
      title: 'Marcar micro-paso como completado',
      onclick: () => {
        if (!currentStep || currentStep.completed) return;
        store.completeMicrostep(currentStep.id);
        playDopamineChime();
        showToast('¡Micro-paso completado! Tu cerebro avanza. 🚀');
      }
    }, [currentStep?.completed ? '✓' : '']),
    el('span', {
      id: 'current-microstep-text',
      className: 'microstep-text' + (currentStep?.completed ? ' completed' : '')
    }, [currentStep?.text ?? ''])
  ]);

  const jitBox = el('div', { className: 'jit-prompt-box' }, [
    el('label', { for: 'jit-microstep-input', className: 'jit-prompt-label' }, ['¿Cuál es el siguiente micro-paso de < 5 minutos?']),
    el('p', { className: 'jit-prompt-sublabel' }, ['Descompón la resistencia inicial. Solo importa la siguiente acción física observable.']),
    jitForm,
    currentStepCard,
    completedSteps.length > 0
      ? el('div', { className: 'microsteps-history' }, [
          el('span', { className: 'history-title' }, [`Micro-pasos completados en esta sesión (${completedSteps.length}):`]),
          el('ul', { className: 'microsteps-pill-list' }, completedSteps.map((s) =>
            el('li', { className: 'microstep-pill completed' }, [
              el('span', { className: 'check-icon' }, ['✓']),
              el('span', {}, [s.text])
            ])
          ))
        ])
      : null
  ]);

  const actionsRow = el('div', { className: 'active-actions-row' }, [
    el('button', {
      id: 'complete-task-btn',
      className: 'success-btn',
      title: 'Completar tarea completa y registrar victoria (Alt+C)',
      onclick: () => {
        store.completeActiveTask();
        playDopamineChime();
        showToast('🎉 ¡Victoria completada! Tarea registrada en tu historial.');
      }
    }, ['🎉 Completar Tarea']),
    el('button', {
      id: 'park-task-btn',
      className: 'parking-btn',
      title: 'Aparcar en Parking Lot (Alt+P)',
      onclick: () => {
        store.parkActiveTask();
        showToast('Tarea aparcada en el Parking Lot. Retómala cuando quieras sin culpa. ⏸');
      }
    }, ['⏸ Aparcar Tarea'])
  ]);

  const card = el('div', { className: 'active-focus-card' }, [
    topBar,
    buildTitleRow(store, task),
    buildNotesSection(store, task),
    jitBox,
    actionsRow
  ]);

  replaceChildren(container, card);
  if (uncompletedSteps.length === 0) focusMicrostepInput();
}
