const API_BASE = '/api/tasks';

const form = document.getElementById('task-form');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const list = document.getElementById('task-list');
const countLabel = document.getElementById('task-count');
const emptyState = document.getElementById('empty-state');

async function loadTasks() {
  const res = await fetch(API_BASE);
  const tasks = await res.json();
  renderTasks(tasks);
}

function renderTasks(tasks) {
  list.innerHTML = '';
  emptyState.hidden = tasks.length > 0;
  const open = tasks.filter((t) => !t.completed).length;
  countLabel.textContent = tasks.length
    ? `${open} open · ${tasks.length - open} done`
    : '';

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = task.completed ? 'completed' : '';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => toggleComplete(task));

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.title;
    if (task.description) {
      const desc = document.createElement('span');
      desc.className = 'task-description';
      desc.textContent = ` — ${task.description}`;
      text.appendChild(desc);
    }
    text.addEventListener('click', () => editTask(task));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    item.append(checkbox, text, deleteBtn);
    list.appendChild(item);
  }
}

async function createTask(title, description) {
  await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, completed: false }),
  });
  await loadTasks();
}

async function toggleComplete(task) {
  await fetch(`${API_BASE}/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...task, completed: !task.completed }),
  });
  await loadTasks();
}

async function editTask(task) {
  const newTitle = prompt('Edit title', task.title);
  if (newTitle === null || newTitle.trim() === '') return;
  await fetch(`${API_BASE}/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...task, title: newTitle.trim() }),
  });
  await loadTasks();
}

async function deleteTask(id) {
  await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  await loadTasks();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  if (!title) return;
  createTask(title, description);
  titleInput.value = '';
  descriptionInput.value = '';
});

// Theme toggle: overrides prefers-color-scheme and remembers the choice.
const themeToggle = document.getElementById('theme-toggle');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || (systemPrefersDark.matches ? 'dark' : 'light');
}

function syncThemeToggleLabel() {
  const isDark = currentTheme() === 'dark';
  themeToggle.textContent = isDark ? '☀' : '☾';
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

themeToggle.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  syncThemeToggleLabel();
});

syncThemeToggleLabel();
loadTasks();
