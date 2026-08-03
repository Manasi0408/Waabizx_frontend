export const CONTENT_MENU = [
  {
    id: 'text',
    label: 'Text',
    icon: 'T',
    options: [
      { type: 'text_large_heading', label: 'Large Heading' },
      { type: 'text_small_heading', label: 'Small Heading' },
      { type: 'text_caption', label: 'Caption' },
      { type: 'text_body', label: 'Body' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    icon: 'img',
    options: [
      { type: 'media_image', label: 'Image' },
      { type: 'media_photo_picker', label: 'PhotoPicker' },
      { type: 'media_document_picker', label: 'DocumentPicker' },
    ],
  },
  {
    id: 'text_answer',
    label: 'Text Answer',
    icon: 'input',
    options: [
      { type: 'text_answer_short', label: 'Short Answer' },
      { type: 'text_answer_paragraph', label: 'Paragraph' },
      { type: 'text_answer_date', label: 'Date Picker' },
      { type: 'text_answer_calendar', label: 'Calender Picker' },
    ],
  },
  {
    id: 'selection',
    label: 'Selection',
    icon: 'list',
    options: [
      { type: 'selection_single', label: 'Single Choice' },
      { type: 'selection_multi', label: 'Multi Choice' },
      { type: 'selection_opt_in', label: 'Opt In' },
      { type: 'selection_dropdown', label: 'Drop Down' },
    ],
  },
];

export function defaultBlockForType(type) {
  const id = `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const base = { id, type, label: '', text: '', required: false, options: ['Option 1', 'Option 2'] };

  switch (type) {
    case 'text_large_heading':
      return { ...base, text: 'Large Heading', label: 'Large Heading' };
    case 'text_small_heading':
      return { ...base, text: 'Small Heading', label: 'Small Heading' };
    case 'text_caption':
      return { ...base, text: 'Caption text', label: 'Caption' };
    case 'text_body':
      return { ...base, text: 'Body text goes here', label: 'Body' };
    case 'media_image':
      return { ...base, label: 'Image', text: '', imageUrl: '' };
    case 'media_photo_picker':
      return { ...base, label: 'Upload Photo', text: 'Choose a photo' };
    case 'media_document_picker':
      return { ...base, label: 'Upload Document', text: 'Choose a document' };
    case 'text_answer_short':
      return { ...base, label: 'Short answer', text: '', placeholder: 'Type your answer' };
    case 'text_answer_paragraph':
      return { ...base, label: 'Paragraph', text: '', placeholder: 'Type your answer' };
    case 'text_answer_date':
      return { ...base, label: 'Date', text: '', placeholder: 'Select date' };
    case 'text_answer_calendar':
      return { ...base, label: 'Calendar', text: '', placeholder: 'Select date' };
    case 'selection_single':
      return { ...base, label: 'Single choice', options: ['Yes', 'No'] };
    case 'selection_multi':
      return { ...base, label: 'Multi choice', options: ['Option A', 'Option B'] };
    case 'selection_opt_in':
      return { ...base, label: 'Opt in', text: 'I agree to receive updates' };
    case 'selection_dropdown':
      return { ...base, label: 'Dropdown', options: ['Select', 'Option 1', 'Option 2'] };
    default:
      return base;
  }
}

export function getTypeLabel(type) {
  for (const group of CONTENT_MENU) {
    const hit = group.options.find((o) => o.type === type);
    if (hit) return hit.label;
  }
  return type;
}
