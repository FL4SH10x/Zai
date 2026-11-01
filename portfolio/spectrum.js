/* --- BOOT SEQUENCE --- */
(function initBoot() {
  const bootDiv = document.getElementById('boot-sequence');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hasPlayed = false;

  try { hasPlayed = sessionStorage.getItem('bootPlayed') === 'true'; } catch (e) {}
  if (hasPlayed || prefersReducedMotion) {
    bootDiv.style.display = 'none';
    return;
  }

  const lines = [
    { id: 'boot-1', text: 'INITIALISING SENSOR ARRAY ... OK', delay: 200 },
    { id: 'boot-2', text: 'LOADING SIGNAL CHAIN ... OK', delay: 600 },
    { id: 'boot-3', text: 'CALIBRATING ... OK', delay: 1000 },
    { id: 'boot-4', text: 'LINK ESTABLISHED.', delay: 1400 }
  ];

  lines.forEach(line => { setTimeout(() => { document.getElementById(line.id).textContent = line.text; }, line.delay); });
  const finishBoot = () => {
    bootDiv.classList.add('hidden');
    try { sessionStorage.setItem('bootPlayed', 'true'); } catch (e) {}
    setTimeout(() => { bootDiv.style.display = 'none'; }, 400); 
  };
  setTimeout(finishBoot, 1800);
  window.addEventListener('keydown', finishBoot, { once: true });
  window.addEventListener('click', finishBoot, { once: true });
})();

/* --- SPECTROMETER DSP & ANIMATION --- */
(function initSpectrometer() {
  // Physical alignment: 0 to 983.04 MHz mapped to 256 bins.
  // Bin spacing = 3.84 MHz/bin
  const M = 512; 
  const P = 4;   
  const N = M * P; 
  const MAX_ACC = 64;

  const canvasTime = document.getElementById('canvas-time');
  const canvasFreq = document.getElementById('canvas-freq');
  const ctxTime = canvasTime.getContext('2d', { alpha: false });
  const ctxFreq = canvasFreq.getContext('2d', { alpha: false });
  
  let signalBuffer = new Float64Array(N);
  let pfbOut = new Float64Array(M);
  let real = new Float64Array(M);
  let imag = new Float64Array(M);
  let power = new Float64Array(M/2);
  let accumulatedPower = new Float64Array(M/2);
  
  let accumulations = 0;
  let framesProcessed = 0; // Tracks total frames including warm-up
  let showSpurs = false;
  let isAnimating = false;
  let activeNode = -1;
  let loopCount = 0;
  let tickTimeout = null; 

  const filter = new Float64Array(N);
  for (let m = 0; m < N; m++) {
    let x = (m - (M * P) / 2) / M;
    let sinc = (x === 0) ? 1.0 : Math.sin(Math.PI * x) / (Math.PI * x);
    let hann = 0.5 * (1 - Math.cos((2 * Math.PI * m) / (N - 1)));
    filter[m] = sinc * hann;
  }

  const bitRev = new Uint16Array(M);
  const cosT = new Float64Array(M/2);
  const sinT = new Float64Array(M/2);
  let bits = Math.log2(M);
  for (let i = 0; i < M; i++) {
    let rev = 0, num = i;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | (num & 1);
      num >>= 1;
    }
    bitRev[i] = rev;
  }
  for (let i = 0; i < M/2; i++) {
    cosT[i] = Math.cos(-2 * Math.PI * i / M);
    sinT[i] = Math.sin(-2 * Math.PI * i / M);
  }

  function doFFT() {
    for (let i = 0; i < M; i++) {
      let j = bitRev[i];
      if (j > i) {
        let tr = real[i], ti = imag[i];
        real[i] = real[j]; imag[i] = imag[j];
        real[j] = tr; imag[j] = ti;
      }
    }
    for (let size = 2; size <= M; size *= 2) {
      let halfsize = size / 2;
      let tablestep = M / size;
      for (let i = 0; i < M; i += size) {
        for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
          let tr = real[j + halfsize] * cosT[k] - imag[j + halfsize] * sinT[k];
          let ti = real[j + halfsize] * sinT[k] + imag[j + halfsize] * cosT[k];
          real[j + halfsize] = real[j] - tr;
          imag[j + halfsize] = imag[j] - ti;
          real[j] += tr;
          imag[j] += ti;
        }
      }
    }
  }

  let spareRandom = null;
  function randn() {
    if (spareRandom !== null) { let v = spareRandom; spareRandom = null; return v; }
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); while(v === 0) v = Math.random();
    let mag = Math.sqrt(-2.0 * Math.log(u));
    spareRandom = mag * Math.cos(2.0 * Math.PI * v);
    return mag * Math.sin(2.0 * Math.PI * v);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    [canvasTime, canvasFreq].forEach(c => {
      let rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
    });
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas(); 

  // Clickable canvas labels
  const labelLinks = [
    { bin: 40, text: 'RESEARCH', target: '#sec-02' },
    { bin: 155, text: 'INSTRUMENT', target: '#sec-03' },
    { bin: 215, text: 'FIELD KIT', target: '#sec-04' },
    { bin: 245, text: 'OFF-DUTY', target: '#sec-05' }
  ];
  
  canvasFreq.addEventListener('mousemove', (e) => {
    if (accumulations < MAX_ACC) return;
    const rect = canvasFreq.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let isHover = labelLinks.some(l => {
      let lx = (l.bin / (M/2)) * rect.width;
      return (Math.abs(x - lx) < 30 && y > rect.height - 40);
    });
    canvasFreq.style.cursor = isHover ? 'pointer' : 'default';
  });

  canvasFreq.addEventListener('click', (e) => {
    if (accumulations < MAX_ACC) return;
    const rect = canvasFreq.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    labelLinks.forEach(l => {
      let lx = (l.bin / (M/2)) * rect.width;
      if (Math.abs(x - lx) < 30 && y > rect.height - 40) {
        document.querySelector(l.target).scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  function processFrame() {
    if (accumulations >= MAX_ACC) return; 

    // Tone parameters adjusted for visibility scaling
    const toneAmp = 0.11; 
    
    // Bin placements mapped directly to the 256-bin physical spectrum
    const binToFreq = (b) => (b / (M/2)) * (M/2);
    
    for (let i = 0; i < N - M; i++) { signalBuffer[i] = signalBuffer[i + M]; }
    
    const offset = framesProcessed * M;
    for (let i = 0; i < M; i++) {
      let n = offset + i;
      let val = randn(); 
      // Main Tone (Bin 102.4 = 393.216 MHz)
      val += toneAmp * Math.sin(2 * Math.PI * binToFreq(102.4) * n / M);
      
      // Secondary markers
      val += 0.04 * Math.sin(2 * Math.PI * binToFreq(40) * n / M); 
      val += 0.04 * Math.sin(2 * Math.PI * binToFreq(155) * n / M); 
      val += 0.04 * Math.sin(2 * Math.PI * binToFreq(215) * n / M); 
      val += 0.04 * Math.sin(2 * Math.PI * binToFreq(245) * n / M); 

      // 245.76 MHz Clock spurs (Bins 64, 128, 192)
      if (showSpurs) {
        val += 0.04 * Math.sin(2 * Math.PI * binToFreq(64) * n / M);
        val += 0.04 * Math.sin(2 * Math.PI * binToFreq(128) * n / M);
        val += 0.04 * Math.sin(2 * Math.PI * binToFreq(192) * n / M);
      }
      signalBuffer[(N - M) + i] = val;
    }

    for (let i = 0; i < M; i++) {
      let sum = 0;
      for (let p = 0; p < P; p++) { sum += signalBuffer[i + p * M] * filter[i + p * M]; }
      pfbOut[i] = sum;
      real[i] = sum;
      imag[i] = 0;
    }
    doFFT();
    for (let i = 0; i < M/2; i++) { power[i] = (real[i]*real[i] + imag[i]*imag[i]); }

    // Drop first P-1 frames to avoid warm-up noise drag
    framesProcessed++;
    if (framesProcessed >= P) {
      accumulations++;
      for (let i = 0; i < M/2; i++) { accumulatedPower[i] += power[i]; }
    }
    updateReadouts();
  }

  function updateReadouts() {
    document.getElementById('spec-accum').textContent = `ACCUMULATIONS: ${accumulations} / ${MAX_ACC}`;
    
    if (accumulations > 0) {
      // Find median noise for accurate SNR calculation
      let powers = [];
      let peak = 0;
      for(let i=10; i < M/2 - 10; i++) { 
        let p = accumulatedPower[i] / accumulations;
        powers.push(p);
        if(p > peak) peak = p;
      }
      powers.sort((a,b) => a - b);
      let medianNoise = powers[Math.floor(powers.length / 2)];
      let snr = 10 * Math.log10(peak / medianNoise);
      document.getElementById('spec-snr').textContent = `PEAK/MEAN ≈ ${snr.toFixed(1)} dB`;
    }

    if(accumulations > 0 && accumulations < 10) {
      if(activeNode !== -1) document.getElementById(`node-${activeNode}`).classList.remove('active');
      activeNode = (activeNode + 1) % 6;
      document.getElementById(`node-${activeNode}`).classList.add('active');
    } else if (activeNode !== -1) {
      document.getElementById(`node-${activeNode}`).classList.remove('active');
      activeNode = -1;
    }
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const wT = canvasTime.width, hT = canvasTime.height;
    ctxTime.fillStyle = '#04070b';
    ctxTime.fillRect(0, 0, wT, hT);
    
    ctxTime.beginPath(); ctxTime.strokeStyle = '#6b8794'; ctxTime.lineWidth = 1 * dpr;
    const yCenter = hT / 2; const scaleT = hT / 8; 
    
    for (let i = 0; i < M; i++) {
      let x = (i / M) * wT;
      let y = yCenter - (signalBuffer[(N - M) + i] * scaleT);
      if (i === 0) ctxTime.moveTo(x, y); else ctxTime.lineTo(x, y);
    }
    ctxTime.stroke();

    const wF = canvasFreq.width, hF = canvasFreq.height;
    ctxFreq.fillStyle = '#04070b'; ctxFreq.fillRect(0, 0, wF, hF);
    
    ctxFreq.strokeStyle = 'rgba(27, 58, 74, 0.4)'; ctxFreq.beginPath();
    for(let i=1; i<4; i++) { let y = i * hF / 4; ctxFreq.moveTo(0, y); ctxFreq.lineTo(wF, y); }
    ctxFreq.stroke();
    
    ctxFreq.save();
    ctxFreq.fillStyle = '#6b8794'; ctxFreq.font = `${10*dpr}px 'JetBrains Mono'`;
    ctxFreq.textAlign = 'left';
    ctxFreq.fillText('FREQUENCY (ILLUSTRATIVE)', 10*dpr, hF - 10*dpr);
    ctxFreq.restore();
    
    ctxFreq.beginPath(); ctxFreq.strokeStyle = '#3fe0ff'; ctxFreq.lineWidth = 1.5 * dpr;
    
    for (let i = 0; i < M/2; i++) {
      let avgP = (accumulations > 0) ? (accumulatedPower[i] / accumulations) : 0.001;
      let db = 10 * Math.log10(avgP + 1e-10); 
      let mappedY = hF - ((db - 15) / 30) * hF;
      let x = (i / (M/2)) * wF;
      if (i === 0) ctxFreq.moveTo(x, mappedY); else ctxFreq.lineTo(x, mappedY);
    }
    ctxFreq.stroke();

    if (accumulations === MAX_ACC) {
      ctxFreq.save();
      ctxFreq.fillStyle = '#ffb347'; ctxFreq.textAlign = 'center';
      
      const drawLabel = (bin, text, isPrimary = false) => {
        let x = (bin / (M/2)) * wF;
        let avgP = accumulatedPower[bin] / accumulations;
        let y = hF - ((10 * Math.log10(avgP) - 15) / 30) * hF - 10*dpr; 
        ctxFreq.fillText(text, x, y);
        if(isPrimary) {
           ctxFreq.font = `${8*dpr}px 'JetBrains Mono'`;
           ctxFreq.fillText('(as in TIFR loopback test)', x, y + 12*dpr);
           ctxFreq.font = `${10*dpr}px 'JetBrains Mono'`;
        }
      };

      labelLinks.forEach(l => drawLabel(l.bin, l.text));
      drawLabel(102, 'TEST TONE 393.216 MHz', true);
      ctxFreq.restore();
    }
  }

  function tick() {
    if (isAnimating) {
      processFrame();
      draw();
      if (accumulations < MAX_ACC) {
        clearTimeout(tickTimeout);
        tickTimeout = setTimeout(() => requestAnimationFrame(tick), 50); 
      } else {
        document.getElementById('btn-reset-loop').style.display = 'inline-block';
      }
    }
  }

  function softClear() {
    const wasFinished = (accumulations >= MAX_ACC);
    accumulatedPower.fill(0);
    signalBuffer.fill(0);
    accumulations = 0;
    framesProcessed = 0;
    activeNode = -1;
    document.getElementById('btn-reset-loop').style.display = 'none';
    
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      while(accumulations < MAX_ACC) { processFrame(); }
      draw();
      document.getElementById('btn-reset-loop').style.display = 'inline-block';
    } else {
      if (wasFinished && isAnimating) tick(); 
      else if (!isAnimating) { isAnimating = true; tick(); }
    }
  }

  function hardReset() {
    softClear(); 
    loopCount++;
    const lc = document.getElementById('loop-counter');
    lc.textContent = `LOOP ${String(loopCount).padStart(4, '0')}`;
    lc.style.display = 'inline';
    
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let flash = document.createElement('div');
      flash.className = 'flash-overlay flash-anim';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 600);
    }
  }

  window.addEventListener('triggerResetLoop', hardReset);

  document.addEventListener('visibilitychange', () => {
    isAnimating = !document.hidden;
    if (isAnimating && accumulations < MAX_ACC) tick();
  });

  const observer = new IntersectionObserver((entries) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    entries.forEach(entry => {
      isAnimating = entry.isIntersecting && !document.hidden;
      if (isAnimating && accumulations < MAX_ACC) tick();
    });
  }, { threshold: 0.1 });
  observer.observe(document.getElementById('sec-01'));
  
  document.getElementById('btn-spurs').addEventListener('click', (e) => {
    showSpurs = !showSpurs;
    e.target.textContent = showSpurs ? 'HIDE CLOCK SPURS' : 'SHOW CLOCK SPURS';
    if (accumulations === MAX_ACC) softClear();
  });
  document.getElementById('btn-replay').addEventListener('click', softClear);
  document.getElementById('btn-reset-loop').addEventListener('click', hardReset);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    while(accumulations < MAX_ACC) { processFrame(); }
    draw();
    document.getElementById('btn-reset-loop').style.display = 'inline-block';
  }
})();