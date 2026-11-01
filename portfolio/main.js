// --- CLOCK LOGIC ---
function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false });
  const clockEl = document.getElementById('local-time');
  if (clockEl) clockEl.textContent = timeString;
}
setInterval(updateClock, 1000);
updateClock();

// --- LIGHTBOX LOGIC ---
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbCaption = document.getElementById('lb-caption');
const triggers = Array.from(document.querySelectorAll('.lightbox-trigger'));
let currentImageIndex = 0;

function openLightbox(index) {
  if(triggers.length === 0 || !triggers[index].dataset.src) return;
  currentImageIndex = index;
  lbImg.src = triggers[index].dataset.src;
  lbCaption.textContent = triggers[index].dataset.caption || '';
  lightbox.classList.remove('hidden');
}
function closeLightbox() { lightbox.classList.add('hidden'); }
function nextImage() { openLightbox((currentImageIndex + 1) % triggers.length); }
function prevImage() { openLightbox((currentImageIndex - 1 + triggers.length) % triggers.length); }

triggers.forEach((trigger, i) => { trigger.addEventListener('click', () => openLightbox(i)); });
if(document.getElementById('lb-close')) document.getElementById('lb-close').addEventListener('click', closeLightbox);
if(document.getElementById('lb-next')) document.getElementById('lb-next').addEventListener('click', nextImage);
if(document.getElementById('lb-prev')) document.getElementById('lb-prev').addEventListener('click', prevImage);

// --- TERMINAL LOGIC ---
const terminal = document.getElementById('terminal');
const termInput = document.getElementById('terminal-input');
const termOutput = document.getElementById('terminal-output');
const btnCmd = document.getElementById('btn-cmd');

let cmdHistory = [];
let cmdIndex = -1;

function toggleTerminal() {
  if(!terminal) return;
  const isHidden = terminal.classList.contains('hidden');
  if (isHidden) {
    terminal.classList.remove('hidden');
    setTimeout(() => termInput.focus(), 300);
  } else {
    terminal.classList.add('hidden');
    termInput.blur();
  }
}
if(btnCmd) btnCmd.addEventListener('click', toggleTerminal);

function printTerm(text, isHTML = false) {
  if(!termOutput) return;
  const line = document.createElement('div');
  if (isHTML) line.innerHTML = text;
  else line.textContent = text;
  termOutput.appendChild(line);
  termOutput.scrollTop = termOutput.scrollHeight;
}

function pulsePanel(selector) {
  const el = document.querySelector(selector);
  if(!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('highlight-pulse');
  void el.offsetWidth; // trigger reflow
  el.classList.add('highlight-pulse');
}

function processCommand(cmd) {
  const raw = cmd.trim();
  const args = raw.toLowerCase().split(' ');
  const command = args[0];
  if (!command) return;

  cmdHistory.push(raw);
  cmdIndex = cmdHistory.length;
  printTerm(`jai@iiser:~$ ${raw}`);

  switch (command) {
    case 'help':
      printTerm(`Available commands: help, whoami, research, tifr, iitbhu, skills, reel, cv, contact, theme, loop, clear, exit`);
      break;
    case 'whoami':
      printTerm(`Jai Parashar (Zai). BS-MS Physics at IISER Tirupati.`);
      printTerm(`Focus: Quantum materials, devices, and radio astronomy instrumentation.`);
      break;
    case 'research': pulsePanel('#sec-02'); toggleTerminal(); break;
    case 'tifr': pulsePanel('#sec-02 .research-panel:nth-child(2)'); toggleTerminal(); break;
    case 'iitbhu': pulsePanel('#sec-02 .research-panel:nth-child(3)'); toggleTerminal(); break;
    case 'skills': pulsePanel('#sec-04'); toggleTerminal(); break;
    case 'reel': pulsePanel('#sec-05'); toggleTerminal(); break;
    case 'contact': pulsePanel('#sec-06'); toggleTerminal(); break;
    case 'cv': 
      printTerm(`Downloading Jai_Parashar_CV.pdf...`);
      window.open('assets/Jai_Parashar_CV.pdf', '_blank');
      break;
    case 'theme':
      document.body.classList.toggle('theme-amber');
      printTerm(`Theme accent toggled.`);
      break;
    case 'loop':
      window.dispatchEvent(new Event('triggerResetLoop'));
      printTerm(`Signal loop reset initiated.`);
      break;
    case 'clear': termOutput.innerHTML = ''; break;
    case 'exit': toggleTerminal(); break;
    case 'sudo': printTerm(`sudo: nice try, but this incident will be reported to Dr. Dutta.`); break;
    default: printTerm(`command not found: ${command}. type 'help'`);
  }
}

if(termInput) {
  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      processCommand(termInput.value);
      termInput.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdIndex > 0) { cmdIndex--; termInput.value = cmdHistory[cmdIndex]; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdIndex < cmdHistory.length - 1) { cmdIndex++; termInput.value = cmdHistory[cmdIndex]; }
      else { cmdIndex = cmdHistory.length; termInput.value = ''; }
    }
  });
}

// --- GLOBAL KEYBOARD SHORTCUTS ---
const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIndex = 0;

window.addEventListener('keydown', (e) => {
  // Terminal backtick (Uses exact hardware key code to avoid layout issues)
  if (e.code === 'Backquote' || e.key === '`' || e.key === '~') {
    // Stop it from opening if you are typing in the BTK sliders
    if (e.target.tagName === 'INPUT' && e.target.id !== 'terminal-input') return;
    e.preventDefault();
    toggleTerminal();
  }
  
  // Lightbox / Terminal close
  if (e.key === 'Escape') {
    if(lightbox && !lightbox.classList.contains('hidden')) closeLightbox();
    if(terminal && !terminal.classList.contains('hidden')) toggleTerminal();
  }
  
  // Lightbox arrows
  if (lightbox && !lightbox.classList.contains('hidden')) {
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
  }
  
  // Konami Code Easter Egg
  if (e.key === konami[konamiIndex] || e.key.toLowerCase() === konami[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === konami.length) {
      window.dispatchEvent(new Event('triggerResetLoop'));
      konamiIndex = 0;
    }
  } else {
    konamiIndex = 0;
  }
});