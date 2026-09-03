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
  const emailAddressEl = document.getElementById('email-address');
  const toggles = Array.from(document.querySelectorAll('.toggle'));

  const defaultPlan = {
    procedureType: 'Colonoscopy',
    procedureDate: 'Wed, Sep 16 · 8:00 AM',
    processingTitle: 'Making your\ninstructions clear…',
    extractionNote: 'Check the original note and confirm every instruction with your clinic.',
    smsPreview:
      'Hi Kelvin! Your colonoscopy is in 7 days. Today is a good day to review your medications with your care team. Reply HELP for support.',
    timeline: [
      {
        step: '1',
        label: '7 DAYS BEFORE',
        title: 'Review your medications',
        body: 'Ask your care team about blood thinners, diabetes medicine, or supplements.'
      },
      {
        step: '2',
        label: 'DAY BEFORE · 8:00 AM',
        title: 'Switch to clear liquids',
        body: 'Water, clear broth, apple juice, tea, and gelatin are okay. Avoid red or purple drinks.'
      },
      {
        step: '3',
        label: 'DAY BEFORE · 6:00 PM',
        title: 'Start your bowel prep',
        body: 'Follow the exact mixing and drinking instructions from your clinic.'
      },
      {
        step: '4',
        label: 'PROCEDURE DAY · 12:00 AM',
        title: 'Do not eat solid food',
        body: 'Follow your clinic’s cutoff time for clear liquids.'
      }
    ]
  };

  let selectedFile = null;
  let previewUrl = '';
  let reminderSent = false;

  function showScreen(screenName) {
    screens.forEach((screen) => {
      screen.classList.toggle('active', screen.dataset.screen === screenName);
    });

    navButtons.forEach((button) => {
      if (!button.closest('.nav')) return;
      button.classList.toggle('selected', button.dataset.go === screenName);
    });

    const activeScreenEl = screens.find((screen) => screen.dataset.screen === screenName);
    if (activeScreenEl) activeScreenEl.scrollTop = 0;
  }

  function setTimeline(items) {
    if (!timelineEl) return;

    timelineEl.innerHTML = items
      .map(
        (item) => `
          <li>
            <span class="dot">${item.step}</span>
            <div>
              <small>${item.label}</small>
              <h3>${item.title}</h3>
              <p>${item.body}</p>
            </div>
          </li>`
      )
      .join('');
  }

  function clearPreviewUrl() {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function showFilePlaceholder(file) {
    if (!filePlaceholderEl) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const label = isPdf ? 'PDF note selected' : 'File selected';
    const body = isPdf
      ? 'PrepPal accepts PDFs. For best results, use a photo if you want the AI to read handwriting.'
      : 'PrepPal accepts files, photos, and camera images.';

    if (filePlaceholderTitleEl) filePlaceholderTitleEl.textContent = label;
    if (filePlaceholderTextEl) filePlaceholderTextEl.textContent = body;
    filePlaceholderEl.hidden = false;
  }

  function hideFilePlaceholder() {
    if (filePlaceholderEl) filePlaceholderEl.hidden = true;
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

    if (sendNoteEl) sendNoteEl.textContent = 'This prototype simulates an email—it does not send one.';

    reminderSent = false;
    if (sendDemoButton) {
      sendDemoButton.disabled = false;
      sendDemoButton.textContent = 'Send demo email →';
    }
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
      hideFilePlaceholder();
      if (sampleNoteEl) sampleNoteEl.hidden = false;
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
      hideFilePlaceholder();
      if (sampleNoteEl) sampleNoteEl.hidden = true;
    } else {
      if (notePreviewEl) {
        notePreviewEl.hidden = true;
        notePreviewEl.removeAttribute('src');
      }
      if (sampleNoteEl) sampleNoteEl.hidden = true;
      showFilePlaceholder(file);
    }
  }

  async function readJsonResponse(response) {
    const raw = await response.text();
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return { error: raw };
    }
  }

  async function analyzeNote() {
    if (!selectedFile) return;

    showScreen('processing');

    const formData = new FormData();
    formData.append('file', selectedFile);

    let plan = null;
    try {
      const response = await fetch('/api/analyze-note', {
        method: 'POST',
        body: formData
      });
      const payload = await readJsonResponse(response);
      if (response.ok && payload) {
        plan = payload;
      } else if (payload?.extractionNote) {
        plan = payload;
      }
    } catch (error) {
      plan = null;
    }

    if (!plan) {
      plan = {
        ...defaultPlan,
        extractionNote: 'Could not reach the AI service, so PrepPal showed the demo plan instead.'
      };
    }

    renderPlan(plan);
    showScreen('plan');
  }

  async function sendDemoReminder() {
    if (!sendDemoButton || !sendNoteEl) return;

    const destination = emailAddressEl?.value?.trim() || 'kelvin@example.com';
    const text = document.querySelector('.bubble')?.textContent || defaultPlan.smsPreview;

    sendDemoButton.disabled = true;
    sendNoteEl.textContent = 'Sending reminder…';

    try {
      const response = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: destination, message: text })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to send reminder');
      }

      reminderSent = true;
      sendDemoButton.textContent = data.mode === 'live' ? 'Sent to email ✓' : 'Sent in demo mode ✓';
      sendNoteEl.textContent = data.message || `Reminder sent to ${data.email}.`;
    } catch (error) {
      sendNoteEl.textContent = 'Could not send the email yet. Add email settings in Cloudflare and try again.';
    } finally {
      sendDemoButton.disabled = false;
    }
  }

  function wireFileInputs() {
    fileInputs.forEach((input) => {
      input.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        updateSelectedFile(file);
      });
    });
  }

  function wireNavigation() {
    navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const destination = button.dataset.go;
        if (!destination) return;
        showScreen(destination);
      });
    });
  }

  function wireButtons() {
    if (analyzeButton) analyzeButton.addEventListener('click', analyzeNote);
    if (sendDemoButton) sendDemoButton.addEventListener('click', sendDemoReminder);

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('on');
        toggle.setAttribute(
          'aria-label',
          toggle.classList.contains('on') ? 'Email reminders enabled' : 'Email reminders disabled'
        );
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
