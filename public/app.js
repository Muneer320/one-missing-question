const sampleChat = `Mira: Are we still doing a game night this weekend?
Jay: I'd love that. Saturday works for me, but only after 7.
Noor: I can do Saturday! Should we meet at my place?
Mira: Saturday is good. I thought we were going to Jay's?
Jay: I can bring snacks. What time are we thinking?
Noor: Any time after 6 works for me.`;

const chatInput = document.querySelector('#chat-input');
const questionOutput = document.querySelector('#question-output');
const status = document.querySelector('#status');
const analyzeButton = document.querySelector('#analyze-button');
const analyzeLabel = document.querySelector('#analyze-label');
const results = document.querySelector('#results');

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`;
}

function updateCount() {
  document.querySelector('#char-count').textContent = `${chatInput.value.length.toLocaleString()} / 12,000`;
}

function renderItems(list, values, withEvidence = false) {
  list.replaceChildren();
  for (const value of values) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = withEvidence ? value.detail : value;
    item.append(text);
    if (withEvidence) {
      const evidence = document.createElement('small');
      evidence.textContent = `“${value.evidence}”`;
      item.append(evidence);
    }
    list.append(item);
  }
}

function showResults(data) {
  renderItems(document.querySelector('#agreed-list'), data.agreed, true);
  renderItems(document.querySelector('#unclear-list'), data.unclear);
  document.querySelector('#agreed-count').textContent = String(data.agreed.length).padStart(2, '0');
  document.querySelector('#agreed-empty').hidden = data.agreed.length > 0;
  document.querySelector('#unclear-empty').hidden = data.unclear.length > 0;
  document.querySelector('#result-footnote').textContent = data.discarded
    ? `${data.discarded} unsupported “agreed” detail${data.discarded === 1 ? '' : 's'} left out because the quote was missing from the chat.`
    : 'A quote shows what was said. Check whether everyone actually agreed.';
  questionOutput.value = data.question;
  document.querySelector('#empty-state').hidden = true;
  results.hidden = false;
}

document.querySelector('#sample-button').addEventListener('click', () => {
  chatInput.value = sampleChat;
  updateCount();
  setStatus('Sample chat loaded. Ready when you are.');
  chatInput.focus();
});

chatInput.addEventListener('input', updateCount);

analyzeButton.addEventListener('click', async () => {
  const chat = chatInput.value.trim();
  if (chat.length < 25) {
    setStatus('Paste a little more of the conversation first.', 'error');
    chatInput.focus();
    return;
  }

  analyzeButton.disabled = true;
  analyzeLabel.textContent = 'Reading between the lines…';
  setStatus('Asking Gemma to sort the details…');
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not analyze this chat.');
    showResults(data);
    setStatus('Done. Check the quotes and edit the question before sending.', 'success');
    document.querySelector('#results-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    analyzeButton.disabled = false;
    analyzeLabel.textContent = 'Find the missing question';
  }
});

document.querySelector('#copy-button').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(questionOutput.value);
    setStatus('Question copied. You can paste it into your chat.', 'success');
  } catch {
    questionOutput.focus();
    questionOutput.select();
    setStatus('Select and copy the question with your keyboard.', 'error');
  }
});
