(function initBTK() {
  // --- NEW: FETCH BdG DATA ---
  let bdgData = null;
  fetch('assets/bdg_data.json')
    .then(response => response.json())
    .then(data => {
      bdgData = data;
      drawAll(); // Redraw once data loads
    })
    .catch(err => console.warn("BdG data not found yet. Overlay disabled."));
  function calcBTK(E_over_D, Z) {
    let A, B, C, D, G;
    const E = Math.max(1e-9, E_over_D);
    const Z2 = Z * Z;

    if (Math.abs(E - 1.0) < 1e-6) {
      A = 1; B = 0; C = 0; D = 0;
    } else if (E < 1.0) {
      const denom = (E * E) + (1 - E * E) * Math.pow(1 + 2 * Z2, 2);
      A = 1 / denom; B = 1 - A; C = 0; D = 0;
    } else {
      const u02 = 0.5 * (1 + Math.sqrt(E * E - 1) / E);
      const v02 = 1 - u02;
      const u02_v02 = u02 - v02;
      const gamma2 = Math.pow(u02 + Z2 * u02_v02, 2);
      
      A = (u02 * v02) / gamma2;
      B = Math.pow(u02_v02, 2) * Z2 * (1 + Z2) / gamma2;
      C = u02 * u02_v02 * (1 + Z2) / gamma2;
      D = v02 * u02_v02 * Z2 / gamma2;
    }
    G = (1 + A - B) * (1 + Z2);
    return { A, B, C, D, G };
  }

  function runSelfChecks() {
    let passed = true;
    for(let i=0; i<1000; i++) {
      let res = calcBTK(Math.random() * 3, Math.random() * 5);
      if (Math.abs(res.A + res.B + res.C + res.D - 1) > 1e-9) passed = false;
    }
    let res2 = calcBTK(0.5, 0);
    if (Math.abs(res2.A - 1) > 1e-9 || Math.abs(res2.B) > 1e-9 || Math.abs(res2.G - 2) > 1e-9) passed = false;
    
    [0, 0.5, 1, 2, 5].forEach(z => {
      let r1 = calcBTK(1 - 1e-9, z), r2 = calcBTK(1 + 1e-9, z);
      if (Math.abs(r1.A - 1) > 1e-6 || Math.abs(r2.A - 1) > 1e-6) passed = false;
    });

    if (Math.abs(calcBTK(1000, 2).G - 1) > 1e-3) passed = false;
    if (!passed) console.warn("BTK checks failed!");
  }
  runSelfChecks();

  const elZ = document.getElementById('btk-z'), elE = document.getElementById('btk-e');
  const valZ = document.getElementById('val-z'), valE = document.getElementById('val-e');
  const sumReadout = document.getElementById('val-sum');
  
  let currentZ = parseFloat(elZ.value), currentE = parseFloat(elE.value);
  let probs = calcBTK(currentE, currentZ);

  const cSch = document.getElementById('btk-schematic');
  const cAB = document.getElementById('btk-plot-ab');
  const cG = document.getElementById('btk-plot-g');
  const ctxSch = cSch.getContext('2d'), ctxAB = cAB.getContext('2d'), ctxG = cG.getContext('2d');

  cSch.setAttribute('aria-label', 'Animation of electron hitting N-S interface');
  cAB.setAttribute('aria-label', 'Plot of reflection and transmission probabilities vs energy');
  cG.setAttribute('aria-label', 'Plot of normalized conductance vs energy');
  
  const ariaAnnouncer = document.createElement('div');
  ariaAnnouncer.setAttribute('aria-live', 'polite');
  ariaAnnouncer.style.cssText = 'position:absolute; left:-9999px;';
  document.body.appendChild(ariaAnnouncer);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    [cSch, cAB, cG].forEach(c => {
      let r = c.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
    });
    drawAll();
  }
  window.addEventListener('resize', resize);

  let history = [], particles = [], isAnimating = false, cooperFlash = 0;
  
  function drawPlots() {
    const dpr = window.devicePixelRatio || 1;
    const w = cAB.width, h = cAB.height;
    ctxAB.clearRect(0, 0, w, h); ctxG.clearRect(0, 0, w, h);
    
    // Axes & Ticks
    ctxAB.strokeStyle = ctxG.strokeStyle = 'rgba(27, 58, 74, 0.4)';
    ctxAB.beginPath(); ctxG.beginPath();
    [ctxAB, ctxG].forEach(ctx => { ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.moveTo(0, 0); ctx.lineTo(0, h); ctx.stroke(); });
    
    let maxG = 2.0;
    for(let i=0; i<=100; i++) maxG = Math.max(maxG, calcBTK(i/100 * 3, currentZ).G);
    maxG = Math.ceil(maxG * 1.1);

    ctxAB.fillStyle = ctxG.fillStyle = '#6b8794'; 
    ctxAB.font = ctxG.font = `${10*dpr}px 'JetBrains Mono'`;
    ctxAB.fillText('PROBABILITIES', 4*dpr, 12*dpr);
    ctxG.fillText(`CONDUCTANCE G (Max: ${maxG.toFixed(1)})`, 4*dpr, 12*dpr);

    ctxAB.lineWidth = ctxG.lineWidth = 1.5 * dpr;
    const paths = { A: new Path2D(), B: new Path2D(), C: new Path2D(), D: new Path2D(), G: new Path2D() };
    
    for(let i=0; i<=100; i++) {
      let E_val = Math.max(1e-9, (i / 100) * 3);
      let res = calcBTK(E_val, currentZ);
      let x = (E_val / 3) * w;
      
      let yA = h - (res.A * h * 0.9), yB = h - (res.B * h * 0.9);
      let yC = h - (res.C * h * 0.9), yD = h - (res.D * h * 0.9);
      let yG = h - ((res.G / maxG) * h * 0.9);
      
      if(i===0) { paths.A.moveTo(x,yA); paths.B.moveTo(x,yB); paths.C.moveTo(x,yC); paths.D.moveTo(x,yD); paths.G.moveTo(x,yG); }
      else { paths.A.lineTo(x,yA); paths.B.lineTo(x,yB); paths.C.lineTo(x,yC); paths.D.lineTo(x,yD); paths.G.lineTo(x,yG); }
    }
    
    ctxAB.strokeStyle = '#ff5a3c'; ctxAB.stroke(paths.A); // A (Red)
    ctxAB.strokeStyle = '#3fe0ff'; ctxAB.stroke(paths.B); // B (Cyan)
    ctxAB.strokeStyle = '#cfe8f2'; ctxAB.stroke(paths.C); // C (White)
    ctxAB.strokeStyle = '#ffb347'; ctxAB.stroke(paths.D); // D (Amber)
    ctxG.strokeStyle = '#ffb347'; ctxG.stroke(paths.G);
    
    let curX = (currentE / 3) * w;
    ctxAB.strokeStyle = ctxG.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctxAB.setLineDash([4, 4]); ctxG.setLineDash([4, 4]);
    ctxAB.beginPath(); ctxAB.moveTo(curX, 0); ctxAB.lineTo(curX, h); ctxAB.stroke();
    ctxG.beginPath(); ctxG.moveTo(curX, 0); ctxG.lineTo(curX, h); ctxG.stroke();
    ctxAB.setLineDash([]); ctxG.setLineDash([]);
    (function initBTK() {
  // --- NEW: FETCH BdG DATA ---
  let bdgData = null;
  fetch('assets/bdg_data.json')
    .then(response => response.json())
    .then(data => {
      bdgData = data;
      drawAll(); // Redraw once data loads
    })
    .catch(err => console.warn("BdG data not found yet. Overlay disabled."));
  }

  function drawSchematic() {
    const dpr = window.devicePixelRatio || 1;
    const w = cSch.width, h = cSch.height;
    ctxSch.clearRect(0, 0, w, h);
    
    ctxSch.fillStyle = 'rgba(63, 224, 255, 0.05)'; ctxSch.fillRect(0, 0, w/2, h);
    ctxSch.fillStyle = 'rgba(255, 179, 71, 0.05)'; ctxSch.fillRect(w/2, 0, w/2, h);
    
    let bWidth = Math.max(2, currentZ * 10 * dpr);
    ctxSch.fillStyle = '#6b8794'; ctxSch.fillRect(w/2 - bWidth/2, 0, bWidth, h);
    
    ctxSch.fillStyle = '#cfe8f2'; ctxSch.font = `${12*dpr}px 'JetBrains Mono'`;
    ctxSch.fillText('NORMAL (N)', 10*dpr, 20*dpr); ctxSch.fillText('SUPERCONDUCTOR (S)', w/2 + 10*dpr, 20*dpr);
    
    if (cooperFlash > 0) {
      ctxSch.fillStyle = `rgba(255, 179, 71, ${cooperFlash})`;
      ctxSch.fillText('2e-', w/2 + 10*dpr, h/2 - 10*dpr);
      cooperFlash -= 0.05;
    }
    
    for(let i=particles.length-1; i>=0; i--) {
      let p = particles[i];
      p.x += p.vx;
      
      // Collision Logic
      if (p.type === 'in' && p.x >= w/2 - bWidth/2) {
        p.type = p.outcome;
        if(p.type === 'A') { p.vx = -p.speed; p.color = '#ff5a3c'; cooperFlash = 1.0; } 
        else if(p.type === 'B') { p.vx = -p.speed; p.color = '#3fe0ff'; } 
        else if(p.type === 'C') { p.vx = p.speed; p.color = '#cfe8f2'; } 
        else { p.vx = p.speed; p.color = '#ffb347'; } 
      }

      ctxSch.beginPath(); ctxSch.arc(p.x, h/2 + p.yOffset, 4*dpr, 0, Math.PI*2);
      ctxSch.fillStyle = p.color; ctxSch.fill();
      if(p.x < 0 || p.x > w) particles.splice(i, 1);
    }
  }

  function updateTally() {
    let counts = {A:0, B:0, C:0, D:0};
    history.forEach(r => counts[r]++);
    let total = history.length || 1;
    document.querySelector('.btk-tally .dim').textContent = `LAST ${history.length} SHOTS (OBSERVED / EXACT)`;
    ['A','B','C','D'].forEach(id => {
      document.getElementById('tally-'+id).textContent = `${(counts[id]/total).toFixed(2)} / ${probs[id].toFixed(2)}`;
    });
  }

  function drawAll() { drawPlots(); drawSchematic(); }

  function animate() {
    if (particles.length > 0 || cooperFlash > 0) {
      drawSchematic(); requestAnimationFrame(animate);
    } else {
      isAnimating = false;
    }
  }

  function onInput() {
    currentZ = parseFloat(elZ.value); currentE = parseFloat(elE.value);
    valZ.textContent = currentZ.toFixed(2); valE.textContent = currentE.toFixed(2);
    probs = calcBTK(currentE, currentZ);
    sumReadout.textContent = (probs.A + probs.B + probs.C + probs.D).toFixed(4);
    history = []; updateTally(); drawPlots(); drawSchematic();
  }

  elZ.addEventListener('input', onInput); elE.addEventListener('input', onInput);

  document.getElementById('btn-fire').addEventListener('click', () => {
    let r = Math.random(), outcome = 'A';
    if(r > probs.A) outcome = 'B';
    if(r > probs.A + probs.B) outcome = 'C';
    if(r > probs.A + probs.B + probs.C) outcome = 'D';
    
    history.push(outcome); if(history.length > 200) history.shift();
    updateTally();
    
    const outcomeNames = {A: "Andreev reflection", B: "Normal reflection", C: "Electron transmission", D: "Hole transmission"};
    ariaAnnouncer.textContent = `Electron fired. Result: ${outcomeNames[outcome]}.`;
    
    const speed = 4 * (window.devicePixelRatio || 1);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
       cooperFlash = outcome === 'A' ? 1.0 : 0;
       drawSchematic();
    } else {
       particles.push({ x: 0, speed: speed, vx: speed, yOffset: (Math.random()-0.5)*10, color: '#3fe0ff', type: 'in', outcome: outcome });
       if (!isAnimating) { isAnimating = true; requestAnimationFrame(animate); }
    }
  });

  resize(); onInput();
})();