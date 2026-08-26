(() => {
  const screens = Array.from(document.querySelectorAll('.screen'));
  const navButtons = Array.from(document.querySelectorAll('[data-go]'));
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const selectedFileEl = document.getElementById('selected-file');
  const notePreviewEl = document.getElementById('note-preview');
  const sampleNoteEl = document.getElementById('sample-note');
  const filePlaceholderEl = document.getElementById('file-placeholder');
  const filePlaceholderTitleEl = document.getElementById('file-placeholder-title');
  const filePlaceholderTextEl = document.getElementById('file-placeholder-text');
  const analyzeButton = document.getElementById('analyze-note');
  const processingTitleEl = document.getElementById('processing-title');
  const procedureTitleEl = document.getElementById('procedure-title');
  const procedureDateEl = document.getElementById('procedure-date');
  const timelineEl = document.getElementById('timeline');
  const extractionNoteEl = document.getElementById('extraction-note');
  const sendDemoButton = document.getElementById('send-demo');
  const sendNoteEl = document.getElementById('send-note');
  const phoneNumberEl = document.getElementById('phone-number');
  const toggles = Array.from(document.querySelectorAll('.toggle'));

  const defaultPlan = {
    procedureType: 'Colonoscopy',
    procedureDate: 'Wed, Sep 16 · 8:00 AM',
    processingTitle: 'Making your\ninstructions clear…',
    extractionNote: 'Check the original note and confirm every instruction with your clinic.',
    smsPreview:
      'Hi Kelvin! Your colonoscopy is in 7 days. Today is a good day to review your medications with your care team. Reply HELP for support.',
    timeline: [
      { step: '1', label: '7 DAYS BEFORE', title: 'Review your medications', body: 'Ask your care team about blood thinners, diabetes medicine, or supplements.' },
      { step: '2', label: 'DAY BEFORE · 8:00 AM', title: 'Switch to clear liquids', body: 'Water, clear broth, apple juice, tea, and gelatin are okay. Avoid red or purple drinks.' },
      { step: '3', label: 'DAY BEFORE · 6:00 PM', title: 'Start your bowel prep', body: 'Follow the exact mixing and drinking instructions from your clinic.' },
      { step: '4', label: 'PROCEDURE DAY · 12:00 AM', title: 'Do not eat solid food', body: 'Follow your clinic’s cutoff time for clear liquids.' }
    ]
  };

  let selectedFile = null;
  let previewUrl = '';

  function showScreen(screenName) {
    screens.forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === screenName));
    navButtons.forEach((button) => {
      if (!button.closest('.nav')) return;
      button.classList.toggle('selected', button.dataset.go === screenName);
    });
    const active = screens.find((screen) => screen.dataset.screen === screenName);
    if (active) active.scrollTop = 0;
  }

  function setTimeline(items) {
    if (!timelineEl) return;
    timelineEl.innerHTML = items
      .map(
        (item) => `
          <li>
            <span class="dot">${item.step}</span>
            <div><small>${item.label}</small><h3>${item.title}</h3><p>${item.body}</p></div>
          </li>`
      )
      .join('');
  }

  function clearPreviewUrl() {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function hideFilePlaceholder() {
    if (filePlaceholderEl) filePlaceholderEl.hidden = true;
  }

  function showFilePlaceholder(file) {
    if (!filePlaceholderEl) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (filePlaceholderTitleEl) filePlaceholderTitleEl.textContent = isPdf ? 'PDF note selected' : 'File selected';
    if (filePlaceholderTextEl) {
      filePlaceholderTextEl.textContent = isPdf
        ? 'PrepPal accepts PDFs. For handwriting, a photo usually gives the best AI result.'
        : 'PrepPal accepts files, photos, and camera images.';
    }
    filePlaceholderEl.hidden = false;
  }

  function renderPlan(plan) {
    const finalPlan = { ...defaultPlan, ...plan };
    if (processingTitleEl) processingTitleEl.innerHTML = finalPlan.processingTitle;
    if (procedureTitleEl) procedureTitleEl.innerHTML = `${finalPlan.procedureType}<br />prep plan`;
    if (procedureDateEl) procedureDateEl.textContent = finalPlan.procedureDate;
    if (extractionNoteEl) extractionNoteEl.textContent = finalPlan.extractionNote;
    setTimeline(finalPlan.timeline);
    const bubble = document.querySelector('.bubble');
    if (bubble) bubble.textContent = finalPlan.smsPreview;
  }

  function updateSelectedFile(file) {
    selectedFile = file;
    clearPreviewUrl();

    if (!file) {
      if (selectedFileEl) selectedFileEl.textContent = 'No note selected yet';
      if (notePreviewEl) {
        notePreviewEl.hidden = true;
        notePreviewEl.removeAttribute('src');
      }
      if (sampleNoteEl) sampleNoteEl.hidden = false;
      hideFilePlaceholder();
      if (analyzeButton) analyzeButton.disabled = true;
      return;
    }

    if (selectedFileEl) selectedFileEl.textContent = file.name;
    if (analyzeButton) analyzeButton.disabled = false;

    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
      if (notePreviewEl) {
        notePreviewEl.src = previewUrl;
        notePreviewEl.hidden = false;
      }
      if (sampleNoteEl) sampleNoteEl.hidden = true;
      hideFilePlaceholder();
      return;
    }

    if (notePreviewEl) {
      notePreviewEl.hidden = true;
      notePreviewEl.removeAttribute('src');
    }
    if (sampleNoteEl) sampleNoteEl.hidden = true;
    showFilePlaceholder(file);
  }

  async function analyzeNote() {
    if (!selectedFile) return;
    showScreen('processing');

    const formData = new FormData();
    formData.append('file', selectedFile);

    let data = null;
    try {
      const response = await fetch('/api/analyze-note', { method: 'POST', body: formData });
      if (response.ok) data = await response.json();
    } catch {
      data = null;
    }

    if (!data) {
      data = { ...defaultPlan, extractionNote: 'Could not reach the AI service, so PrepPal showed the demo plan instead.' };
    }

    renderPlan(data);
    showScreen('plan');
  }

  async function sendDemoReminder() {
    if (!sendDemoButton || !sendNoteEl) return;
    const destination = phoneNumberEl?.value?.trim() || '(336) 740-1136';
    const message = document.querySelector('.bubble')?.textContent || defaultPlan.smsPreview;

    sendDemoButton.disabled = true;
    sendNoteEl.textContent = 'Sending reminder…';

    try {
      const response = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: destination, message })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to send reminder');
      sendDemoButton.textContent = data.mode === 'live' ? 'Sent to phone ✓' : 'Sent in demo mode ✓';
      sendNoteEl.textContent = data.message || `Reminder sent to ${data.phone}.`;
    } catch {
      sendNoteEl.textContent = 'Could not send the SMS yet. Add Twilio keys in Cloudflare and try again.';
    } finally {
      sendDemoButton.disabled = false;
    }
  }

  function wireFileInputs() {
    fileInputs.forEach((input) => input.addEventListener('change', (event) => updateSelectedFile(event.target.files?.[0] || null)));
  }

  function wireNavigation() {
    navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const destination = button.dataset.go;
        if (destination) showScreen(destination);
      });
    });
  }

  function wireButtons() {
    if (analyzeButton) analyzeButton.addEventListener('click', analyzeNote);
    if (sendDemoButton) sendDemoButton.addEventListener('click', sendDemoReminder);
    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('on');
        toggle.setAttribute('aria-label', toggle.classList.contains('on') ? 'Text reminders enabled' : 'Text reminders disabled');
      });
    });
  }

  function init() {
    wireNavigation();
    wireFileInputs();
    wireButtons();
    renderPlan(defaultPlan);
    showScreen('home');
  }

  init();
})();
