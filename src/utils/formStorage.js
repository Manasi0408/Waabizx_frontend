const STORAGE_KEY = 'waabizx_forms_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(forms) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
}

export function listForms() {
  return readAll().sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

export function getFormById(id) {
  return readAll().find((f) => String(f.id) === String(id)) || null;
}

export function saveForm(form) {
  const forms = readAll();
  const idx = forms.findIndex((f) => String(f.id) === String(form.id));
  const next = { ...form, updatedAt: new Date().toISOString() };
  if (idx === -1) {
    forms.unshift(next);
  } else {
    forms[idx] = next;
  }
  writeAll(forms);
  return next;
}

export function deleteForm(id) {
  writeAll(readAll().filter((f) => String(f.id) !== String(id)));
}

export function createEmptyForm() {
  const id = `form_${Date.now()}`;
  return {
    id,
    name: 'Untitled Form',
    category: 'SURVEY',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    responses: 0,
    linkedTemplates: [],
    screens: [
      {
        id: `screen_${Date.now()}`,
        title: 'Update Details',
        footerButton: 'Submit',
        content: [],
      },
    ],
  };
}
