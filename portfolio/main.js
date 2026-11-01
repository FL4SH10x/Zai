// --- CLOCK LOGIC ---
function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false });
  const clockEl = document.getElementById('local-time');
  if (clockEl) clockEl.textContent = timeString;
}
setInterval(updateClock, 1000);
updateClock();

// --- SCROLL SPY FOR NAVIGATION ---
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav-link');
const observerOpts = { root: null, rootMargin: '0px', threshold: 0.3 };
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    }
  });
}, observerOpts);
sections.forEach(sec => sectionObserver.observe(sec));

// --- LIGHTBOX LOGIC ---
const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbCaption = document.getElementById('lb-caption');
const triggers = Array.from(document.querySelectorAll('.lightbox-trigger'));
let currentImageIndex = 0;
let lastFocusedElement = null;

function openLightbox(index) {
  if(triggers.length === 0 || !triggers[index].dataset.src) return;
  lastFocusedElement = document.activeElement;
  currentImageIndex = index;
  lbImg.src = triggers[index].dataset.src;
  lbCaption.textContent = triggers[index].dataset.caption || '';
  lightbox.classList.remove('hidden');
  lightbox.inert = false;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  document.getElementById('lb-close').focus();
}

function closeLightbox() { 
  lightbox.classList.add('hidden'); 
  lightbox.inert = true;
  if(lastFocusedElement) lastFocusedElement.focus();
}

function nextImage() { openLightbox((currentImageIndex + 1) % triggers.length); }
function prevImage() { openLightbox((currentImageIndex - 1 + triggers.length) % triggers.length); }

triggers.forEach((trigger, i) => { trigger.addEventListener('click', () => openLightbox(i)); });
if(document.getElementById('lb-close')) document.getElementById('lb-close').addEventListener('click', closeLightbox);
if(document.getElementById('lb-next')) document.getElementById('lb-next').addEventListener('click', nextImage);
if(document.getElementById('lb-prev')) document.getElementById('lb-prev').addEventListener('click', prevImage);

// Trap focus inside lightbox
lightbox.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    const focusable = lightbox.querySelectorAll('button');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// --- TERMINAL LOGIC ---
const terminal = document.getElementById('terminal');
const termInput = document.getElementById('terminal-input');
const termOutput = document.getElementById('terminal-output');
const btnCmd = document.getElementById('btn-cmd');

let cmdHistory = [];
let cmdIndex = -1;
let termLastFocus = null;

// Initialize inert state
if (terminal) terminal.inert = true;
if (lightbox) lightbox.inert = true;

function toggleTerminal() {
  if(!terminal) return;
  const isHidden = terminal.classList.contains('hidden');
  if (isHidden) {
    termLastFocus = document.activeElement;
    terminal.classList.remove('hidden');
    terminal.inert = false;
    setTimeout(() => termInput.focus(), 300);
  } else {
    terminal.classList.add('hidden');
    terminal.inert = true;
    if(termLastFocus) termLastFocus.focus();
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
  void el.offsetWidth; 
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
    case 'help': printTerm(`Available commands: help, whoami, research, tifr, iitbhu, skills, reel, cv, contact, loop, clear, exit`); break;
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
    case 'loop':
      window.dispatchEvent(new Event('triggerResetLoop'));
      printTerm(`Signal loop reset initiated.`);
      break;
    case 'clear': termOutput.innerHTML = ''; break;
    case 'exit': toggleTerminal(); break;
    case 'sudo': printTerm(`sudo: this incident will be reported.`); break;
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
  // Ignore shortcuts if typing in an input
  const isInput = (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

  if (e.code === 'Backquote' || e.key === '`' || e.key === '~') {
    if (isInput && e.target.id !== 'terminal-input') return;
    e.preventDefault();
    toggleTerminal();
  }
  
  if (e.key === 'Escape') {
    if(lightbox && !lightbox.classList.contains('hidden')) closeLightbox();
    if(terminal && !terminal.classList.contains('hidden')) toggleTerminal();
  }
  
  if (lightbox && !lightbox.classList.contains('hidden')) {
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
  }
  
  if (!isInput) {
    if (e.key === konami[konamiIndex] || e.key.toLowerCase() === konami[konamiIndex]) {
      konamiIndex++;
      if (konamiIndex === konami.length) {
        window.dispatchEvent(new Event('triggerResetLoop'));
        konamiIndex = 0;
      }
    } else {
      konamiIndex = 0;
    }
  }
});