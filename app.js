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
  const noteTextEl = document.getElementById('note-text');
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
    procedureTitle: 'Colonoscopy prep plan',
    procedureDate: 'Wed, Sep 16 · 8:00 AM',
    processingTitle: 'Making your\ninstructions clear…',
    extractionNote: 'Check the original note and confirm every instruction with your clinic.',
    smsPreview: 'Hi Kelvin! Your colonoscopy is in 7 days. Today is a good day to review your medications with your care team. Reply HELP for support.',
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
  let activeScreen = 'home';
  let reminderSent = false;

  function getNoteText() {
    return noteTextEl ? noteTextEl.value.trim() : '';
  }

  function updateAnalyzeButtonState() {
    if (!analyzeButton) return;
    analyzeButton.disabled = !selectedFile && !getNoteText();
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

  function showScreen(screenName) {
    activeScreen = screenName;
    screens.forEach((screen) => {
      screen.classList.toggle('active', screen.dataset.screen === screenName);
    });

    navButtons.forEach((button) => {
      const destination = button.dataset.go;
      if (button.closest('.nav')) {
        button.classList.toggle('selected', destination === screenName);
      }
    });

    const activeScreenEl = screens.find((screen) => screen.dataset.screen === screenName);
    if (activeScreenEl) {
      activeScreenEl.scrollTop = 0;
    }
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

  function renderPlan(plan) {
    const finalPlan = { ...defaultPlan, ...plan };
    if (processingTitleEl) {
      processingTitleEl.innerHTML = finalPlan.processingTitle;
    }
    if (procedureTitleEl) {
      procedureTitleEl.innerHTML = finalPlan.procedureType + '<br />prep plan';
    }
    if (procedureDateEl) {
      procedureDateEl.textContent = finalPlan.procedureDate;
    }
    if (extractionNoteEl) {
      extractionNoteEl.textContent = finalPlan.extractionNote;
    }
    setTimeline(finalPlan.timeline);

    const bubble = document.querySelector('.bubble');
    if (bubble) {
      bubble.textContent = finalPlan.smsPreview;
    }

    if (sendNoteEl) {
      sendNoteEl.textContent = 'This prototype simulates an email—it does not send one.';
    }

    reminderSent = false;
    if (sendDemoButton) {
      sendDemoButton.textContent = 'Send demo email →';
      sendDemoButton.disabled = false;
    }
  }

  function updateSelectedFile(file) {
    selectedFile = file;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = '';
    }

    if (!file) {
      if (selectedFileEl) selectedFileEl.textContent = 'No note selected yet';
      if (notePreviewEl) {
        notePreviewEl.hidden = true;
        notePreviewEl.removeAttribute('src');
      }
      if (sampleNoteEl) sampleNoteEl.hidden = false;
      if (filePlaceholderEl) filePlaceholderEl.hidden = true;
      updateAnalyzeButtonState();
      return;
    }

    if (selectedFileEl) selectedFileEl.textContent = file.name;
    updateAnalyzeButtonState();

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isImage) {
      previewUrl = URL.createObjectURL(file);
      if (notePreviewEl) {
        notePreviewEl.src = previewUrl;
        notePreviewEl.hidden = false;
      }
      if (sampleNoteEl) sampleNoteEl.hidden = true;
      if (filePlaceholderEl) filePlaceholderEl.hidden = true;
    } else {
      if (notePreviewEl) {
        notePreviewEl.hidden = true;
        notePreviewEl.removeAttribute('src');
      }
      if (sampleNoteEl) sampleNoteEl.hidden = true;
      if (filePlaceholderEl) {
        filePlaceholderEl.hidden = false;
        if (filePlaceholderTitleEl) {
          filePlaceholderTitleEl.textContent = isPdf ? 'PDF note selected' : 'File selected';
        }
        if (filePlaceholderTextEl) {
          filePlaceholderTextEl.textContent = isPdf
            ? 'PrepPal accepts PDFs. For best results, use a photo if you want the AI to read handwriting.'
            : 'PrepPal accepts files, photos, and camera images.';
        }
      }
    }
  }

  async function analyzeNote() {
    const noteText = getNoteText();
    if (!selectedFile && !noteText) return;

    showScreen('processing');

    if (processingTitleEl) {
      processingTitleEl.innerHTML = 'Making your\ninstructions clear…';
    }

    const formData = new FormData();
    if (selectedFile) {
      formData.append('file', selectedFile);
    }
    if (noteText) {
      formData.append('noteText', noteText);
    }

    let data = null;
    try {
      const response = await fetch('/api/analyze-note', {
        method: 'POST',
        body: formData
      });

      const payload = await readJsonResponse(response);
      if (response.ok && payload) {
        data = payload;
      } else if (payload?.extractionNote) {
        data = payload;
      }
    } catch (error) {
      data = null;
    }

    if (!data) {
      data = {
        ...defaultPlan,
        extractionNote: 'Could not reach the AI service, so PrepPal showed the demo plan instead.'
      };
    }

    renderPlan(data);
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

      const raw = await response.text();
      let data = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { ok: false, error: raw || 'Unable to send reminder' };
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Unable to send reminder');
      }

      reminderSent = true;
      sendDemoButton.textContent = data.mode === 'live' ? 'Sent to email ✓' : 'Sent in demo mode ✓';
      sendNoteEl.textContent = data.message || `Reminder sent to ${data.email}.`;
    } catch (error) {
      sendNoteEl.textContent = error instanceof Error && error.message
        ? error.message
        : 'Could not send the email yet. Check your email settings and try again.';
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

  function wireNoteText() {
    if (!noteTextEl) return;

    noteTextEl.addEventListener('input', () => {
      updateAnalyzeButtonState();
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
    if (analyzeButton) {
      analyzeButton.addEventListener('click', analyzeNote);
    }

    if (sendDemoButton) {
      sendDemoButton.addEventListener('click', sendDemoReminder);
    }

    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('on');
        const enabled = toggle.classList.contains('on');
        toggle.setAttribute('aria-label', enabled ? 'Email reminders enabled' : 'Email reminders disabled');
      });
    });
  }

  function init() {
    wireNavigation();
    wireFileInputs();
    wireNoteText();
    wireButtons();
    renderPlan(defaultPlan);
    updateAnalyzeButtonState();
    showScreen('home');
  }

init();
})();
