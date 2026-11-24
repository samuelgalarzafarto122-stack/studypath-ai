// Concept lessons for the built-in tutor. Each one is Socratic: it asks what the student knows,
// teaches one small idea at a time, and checks understanding with a question.
// `expect` lists words that show the student got the idea.

export const CONCEPTS = [
  // ---------------- Biology ----------------
  {
    id: 'photosynthesis',
    subject: 'Biology',
    title: 'Photosynthesis',
    keys: ['photosynthesis', 'chlorophyll', 'chloroplast', 'how do plants make food', 'plants make energy'],
    prime: 'Before I explain: what do you already know about how plants get their energy?',
    steps: [
      { say: 'Think of photosynthesis as a recipe. Plants take in three ingredients: light, water (through the roots) and carbon dioxide (from the air). What do you think they make with them?', expect: ['glucose', 'sugar', 'food', 'energy'], yes: 'Exactly, they make glucose, a sugar that stores energy.', no: 'They make glucose, a sugar that stores energy.' },
      { say: 'While making glucose, the plant releases a gas as a leftover. Which gas do you think it is? (Hint: we breathe it in.)', expect: ['oxygen', 'o2'], yes: 'Yes, oxygen!', no: 'It\'s oxygen, the gas we breathe in.' },
      { say: 'This happens in a green organelle inside plant cells. The green pigment that catches light is chlorophyll. Can you name the organelle?', expect: ['chloroplast'], yes: 'Right, the chloroplast.', no: 'It\'s the chloroplast.' },
      { say: 'Check yourself: try writing the word equation. carbon dioxide + water → ___ + ___ (using light energy).', expect: ['glucose', 'sugar', 'oxygen'], yes: 'Perfect: carbon dioxide + water → glucose + oxygen.', no: 'It\'s carbon dioxide + water → glucose + oxygen. Try writing it once from memory.' },
    ],
    quiz: [
      { q: 'What gas do plants release during photosynthesis?', a: ['oxygen', 'o2'] },
      { q: 'In which organelle does photosynthesis happen?', a: ['chloroplast'] },
      { q: 'Name one of the three things plants need for photosynthesis.', a: ['light', 'sun', 'water', 'carbon dioxide', 'co2'] },
    ],
  },
  {
    id: 'respiration',
    subject: 'Biology',
    title: 'Cellular respiration',
    keys: ['cellular respiration', 'respiration', 'mitochondria', 'atp'],
    prime: 'Quick question first: where do you think your cells get the energy to work?',
    steps: [
      { say: 'Cellular respiration is how cells release the energy stored in glucose. It\'s kind of the reverse of photosynthesis. If photosynthesis makes glucose and oxygen, what do you think respiration uses?', expect: ['glucose', 'oxygen', 'sugar'], yes: 'Yes, it uses glucose and oxygen.', no: 'It uses glucose and oxygen.' },
      { say: 'It releases carbon dioxide and water, and stores the energy in a molecule called ATP. Which organelle is known as the "powerhouse of the cell"?', expect: ['mitochondria', 'mitochondrion'], yes: 'Right, the mitochondria.', no: 'The mitochondria.' },
      { say: 'Check yourself: glucose + oxygen → ___ + ___ + energy (ATP). What are the two blanks?', expect: ['carbon dioxide', 'co2', 'water'], yes: 'Perfect.', no: 'Carbon dioxide and water. Try writing the full equation from memory.' },
    ],
    quiz: [
      { q: 'What molecule stores the energy cells use?', a: ['atp'] },
      { q: 'Which organelle does cellular respiration?', a: ['mitochondria', 'mitochondrion'] },
    ],
  },
  {
    id: 'mitosis',
    subject: 'Biology',
    title: 'Mitosis',
    keys: ['mitosis', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cell division', 'cell cycle'],
    prime: 'What do you think happens when one cell becomes two?',
    steps: [
      { say: 'Mitosis is how one cell divides into two identical cells. Why do you think your body needs that? Think about growing or a cut on your skin.', expect: ['grow', 'repair', 'heal', 'replace'], yes: 'Exactly: growth and repair.', no: 'Mainly for growth and repair, like healing a cut.' },
      { say: 'Before dividing, the cell copies its DNA. Then come four phases: Prophase, Metaphase, Anaphase, Telophase. A memory trick is "PMAT". In which phase do you think the chromosomes line up in the middle? (M for middle!)', expect: ['metaphase'], yes: 'Yes, metaphase: M for middle.', no: 'Metaphase: M for middle.' },
      { say: 'In anaphase the copies are pulled apart (A for apart). In telophase two new nuclei form. Check yourself: how many cells do you get at the end, and are they identical?', expect: ['two', '2', 'identical', 'same'], yes: 'Right: two identical cells.', no: 'Two identical cells, each with the full set of chromosomes.' },
    ],
    quiz: [
      { q: 'What does PMAT stand for?', a: ['prophase', 'metaphase', 'anaphase', 'telophase'] },
      { q: 'In which phase are chromosomes pulled apart?', a: ['anaphase'] },
      { q: 'Mitosis makes how many cells?', a: ['two', '2'] },
    ],
  },
  {
    id: 'meiosis',
    subject: 'Biology',
    title: 'Meiosis',
    keys: ['meiosis', 'gamete', 'haploid', 'diploid', 'sex cells'],
    prime: 'Do you know the difference between body cells and sex cells (sperm and egg)?',
    steps: [
      { say: 'Meiosis makes sex cells (gametes). Each one has half the chromosomes of a normal cell. Why do you think they need only half?', expect: ['fertiliz', 'combine', 'join', 'egg', 'sperm', 'half'], yes: 'Exactly: when egg and sperm join, the baby gets a full set.', no: 'Because when egg and sperm join, the two halves make a full set.' },
      { say: 'Meiosis has two rounds of division, so one cell becomes four cells. Are those four cells identical, like in mitosis?', expect: ['no', 'different', 'not'], yes: 'Right, they\'re all different. That\'s why siblings look different.', no: 'No, they\'re all genetically different, which is why siblings aren\'t identical.' },
      { say: 'Check yourself: mitosis gives ___ identical cells; meiosis gives ___ different cells with half the chromosomes.', expect: ['2', 'two', '4', 'four'], yes: 'Perfect: 2 and 4.', no: 'Mitosis: 2 identical. Meiosis: 4 different, each with half.' },
    ],
    quiz: [
      { q: 'How many cells does meiosis produce?', a: ['four', '4'] },
      { q: 'What are the cells made by meiosis called?', a: ['gamete', 'sex cell', 'sperm', 'egg'] },
    ],
  },
  {
    id: 'dna',
    subject: 'Biology',
    title: 'DNA',
    keys: ['dna', 'double helix', 'base pair', 'nucleotide', 'replication'],
    prime: 'What do you already know about what DNA does?',
    steps: [
      { say: 'DNA is the instruction manual for building and running living things. Its shape is a twisted ladder. Do you know the name of that shape?', expect: ['double helix', 'helix'], yes: 'Yes, a double helix.', no: 'It\'s called a double helix.' },
      { say: 'The ladder\'s steps are pairs of bases: A, T, C and G. A always pairs with T, and C always pairs with G. So if one side reads A-C-G, what does the other side read?', expect: ['tgc', 't-g-c', 't g c'], yes: 'Exactly: T-G-C.', no: 'T-G-C, because A↔T and C↔G.' },
      { say: 'Check yourself: what is the partner of G?', expect: ['c'], yes: 'Right.', no: 'C. G always pairs with C.' },
    ],
    quiz: [
      { q: 'Which base pairs with A?', a: ['t', 'thymine'] },
      { q: 'What is the shape of DNA called?', a: ['double helix', 'helix'] },
    ],
  },
  {
    id: 'evolution',
    subject: 'Biology',
    title: 'Natural selection',
    keys: ['natural selection', 'evolution', 'darwin', 'adaptation', 'survival of the fittest'],
    prime: 'What do you think "survival of the fittest" means?',
    steps: [
      { say: 'In any population, individuals are a little different (variation). Some differences help them survive in their environment. What happens to the individuals with helpful traits?', expect: ['surviv', 'live', 'reproduc', 'offspring'], yes: 'Exactly: they survive and reproduce more.', no: 'They survive longer and have more offspring.' },
      { say: 'Those survivors pass the helpful traits to their offspring. Over many generations, what happens to how common the trait is?', expect: ['more common', 'increase', 'spread', 'more'], yes: 'Right, it becomes more common.', no: 'It becomes more common in the population.' },
      { say: 'Check yourself: name the three ingredients of natural selection: ___ (differences), ___ (passed to offspring), and ___ (more survive and reproduce).', expect: ['variation', 'inherit', 'heredit', 'selection', 'surviv'], yes: 'Perfect: variation, inheritance, selection.', no: 'Variation, inheritance, and selection.' },
    ],
    quiz: [{ q: 'Does an individual evolve during its life, or does a population evolve over generations?', a: ['population', 'generation'] }],
  },
  {
    id: 'organelles',
    subject: 'Biology',
    title: 'Cell organelles',
    keys: ['organelle', 'nucleus', 'ribosome', 'cell membrane', 'cell wall', 'golgi', 'endoplasmic', 'vacuole'],
    prime: 'Think of a cell as a city. What jobs does a city need done?',
    steps: [
      { say: 'The nucleus is like city hall: it holds the DNA instructions. Ribosomes are like factories. What do you think ribosomes make?', expect: ['protein'], yes: 'Yes, proteins.', no: 'They make proteins.' },
      { say: 'The cell membrane is like the city border with security: it controls what goes in and out. Plant cells also have a stiff layer outside the membrane. What is it called?', expect: ['cell wall', 'wall'], yes: 'Right, the cell wall.', no: 'The cell wall.' },
      { say: 'Check yourself: which organelle makes energy (ATP), and which one does photosynthesis in plants?', expect: ['mitochondria', 'chloroplast'], yes: 'Perfect.', no: 'Mitochondria make ATP; chloroplasts do photosynthesis.' },
    ],
    quiz: [
      { q: 'Which organelle holds the DNA?', a: ['nucleus'] },
      { q: 'What do ribosomes make?', a: ['protein'] },
    ],
  },
  {
    id: 'osmosis',
    subject: 'Biology',
    title: 'Diffusion and osmosis',
    keys: ['osmosis', 'diffusion', 'concentration gradient', 'hypertonic', 'hypotonic', 'isotonic'],
    prime: 'If someone sprays perfume in a corner of a room, what happens to the smell over time?',
    steps: [
      { say: 'That\'s diffusion: particles spread from where there are many (high concentration) to where there are few (low concentration). Does diffusion need energy from the cell?', expect: ['no', 'passive', 'not'], yes: 'Right, it\'s passive.', no: 'No, it\'s passive: it happens on its own.' },
      { say: 'Osmosis is the diffusion of WATER across a membrane. Water moves toward the side with more dissolved stuff (like salt). If you put a cell in very salty water, does water move into or out of the cell?', expect: ['out'], yes: 'Exactly, out of the cell, so it shrinks.', no: 'Out of the cell, so the cell shrinks.' },
      { say: 'Check yourself: in pure water, what happens to an animal cell?', expect: ['swell', 'burst', 'bigger', 'in'], yes: 'Yes, water moves in and it swells, maybe even bursts.', no: 'Water moves in, and it swells (it can even burst).' },
    ],
    quiz: [{ q: 'Osmosis is the movement of which molecule?', a: ['water', 'h2o'] }],
  },
  {
    id: 'genetics',
    subject: 'Biology',
    title: 'Punnett squares',
    keys: ['punnett', 'dominant', 'recessive', 'genotype', 'phenotype', 'allele', 'heterozygous', 'homozygous'],
    prime: 'Do you remember what dominant and recessive mean?',
    steps: [
      { say: 'Each parent gives one allele for a trait. A dominant allele (capital, like B) shows up even if there\'s only one. A recessive one (lowercase b) shows only with two copies. Would Bb show the dominant or recessive trait?', expect: ['dominant'], yes: 'Right, dominant.', no: 'Dominant, because one B is enough.' },
      { say: 'In a Punnett square you put one parent\'s alleles on top and the other\'s on the side, then fill each box. For Bb × Bb, what are the four boxes?', expect: ['bb', 'bb'], yes: 'Yes: BB, Bb, Bb, bb.', no: 'BB, Bb, Bb, bb.' },
      { say: 'Check yourself: from Bb × Bb, what fraction of the offspring show the recessive trait?', expect: ['1/4', '25', 'one fourth', 'quarter'], yes: 'Exactly, 1 in 4 (25%).', no: '1/4, only the bb box.' },
    ],
    quiz: [{ q: 'Is Bb homozygous or heterozygous?', a: ['heterozygous'] }],
  },
  // ---------------- Chemistry ----------------
  {
    id: 'balancing',
    subject: 'Chemistry',
    title: 'Balancing equations',
    keys: ['balance', 'balancing', 'chemical equation', 'coefficient', 'conservation of mass', '->', '→'],
    prime: 'Why do you think chemical equations need to be balanced?',
    steps: [
      { say: 'Atoms can\'t be created or destroyed in a reaction (conservation of mass). So each element needs the same number of atoms on both sides. In H₂ + O₂ → H₂O, count the oxygen atoms on each side. What do you get?', expect: ['2', 'two', '1', 'one'], yes: 'Right: 2 on the left, 1 on the right. Not balanced yet.', no: '2 on the left (O₂) and 1 on the right (H₂O).' },
      { say: 'You can only change the big numbers in front (coefficients), never the small ones (subscripts). What coefficient could you put in front of H₂O to fix the oxygen?', expect: ['2', '2h2o', '2 h2o'], yes: 'Yes, 2H₂O.', no: 'Put a 2: 2H₂O.' },
      { say: 'Now count hydrogen: 2H₂O has 4 H atoms. How can you get 4 H on the left? Then write the balanced equation.', expect: ['2h2', '2 h2', '2h₂', 'two'], yes: 'Perfect: 2H₂ + O₂ → 2H₂O.', no: 'Put a 2 in front of H₂: 2H₂ + O₂ → 2H₂O.' },
    ],
    quiz: [{ q: 'When balancing, which numbers are you allowed to change: coefficients or subscripts?', a: ['coefficient'] }],
  },
  {
    id: 'mole',
    subject: 'Chemistry',
    title: 'The mole',
    keys: ['mole', 'moles', 'avogadro', 'molar mass', 'stoichiometry'],
    prime: 'A dozen means 12. Do you know what number a "mole" means?',
    steps: [
      { say: 'A mole is just a counting word, like dozen, but huge: 6.02 × 10²³ particles (Avogadro\'s number). Why would chemists need such a big number?', expect: ['small', 'tiny', 'atoms'], yes: 'Exactly: atoms are tiny, so you need a lot of them to have a useful amount.', no: 'Because atoms are so tiny that even a spoonful has trillions of trillions.' },
      { say: 'Molar mass is the mass of one mole, in grams. You find it on the periodic table. Carbon is about 12. So 1 mole of carbon weighs about how much?', expect: ['12'], yes: 'Right, about 12 grams.', no: 'About 12 grams.' },
      { say: 'To go from grams to moles, divide by the molar mass. Check yourself: how many moles are in 24 g of carbon? (Don\'t just tell me the number: tell me the calculation.)', expect: ['24/12', '24 / 12', 'divide', '2'], yes: 'Yes: 24 ÷ 12.', no: 'Divide grams by molar mass: 24 ÷ 12.' },
    ],
    quiz: [{ q: 'To convert grams to moles, do you multiply or divide by the molar mass?', a: ['divide'] }],
  },
  {
    id: 'periodic',
    subject: 'Chemistry',
    title: 'Periodic table trends',
    keys: ['periodic table', 'periodic trend', 'atomic radius', 'electronegativity', 'ionization energy', 'valence electron', 'group', 'period'],
    prime: 'What do you notice about how the periodic table is organized?',
    steps: [
      { say: 'Rows are called periods and columns are called groups. Elements in the same group act alike because they have the same number of outer (valence) electrons. Why might that make them act alike?', expect: ['electron', 'bond', 'react'], yes: 'Right: outer electrons decide how atoms react and bond.', no: 'Outer electrons decide how an atom reacts and bonds.' },
      { say: 'Atomic size gets BIGGER going down a group (more electron shells). Going left to right across a period, atoms get smaller. Which is bigger: lithium (top) or cesium (bottom of the same group)?', expect: ['cesium', 'cs'], yes: 'Yes, cesium.', no: 'Cesium: it\'s lower, with more shells.' },
      { say: 'Electronegativity (how strongly an atom pulls electrons) goes UP toward the top right. Check yourself: which element is the most electronegative?', expect: ['fluorine', 'f'], yes: 'Perfect, fluorine.', no: 'Fluorine, at the top right (not counting noble gases).' },
    ],
    quiz: [{ q: 'What are the columns of the periodic table called?', a: ['group', 'famil'] }],
  },
  {
    id: 'bonds',
    subject: 'Chemistry',
    title: 'Ionic and covalent bonds',
    keys: ['ionic', 'covalent', 'chemical bond', 'metallic bond', 'ion'],
    prime: 'What do you think holds atoms together in a compound?',
    steps: [
      { say: 'In an ionic bond, one atom GIVES electrons to another. It usually happens between a metal and a nonmetal. In NaCl (table salt), which atom do you think gives away an electron?', expect: ['na', 'sodium'], yes: 'Right, sodium (the metal).', no: 'Sodium, the metal, gives an electron to chlorine.' },
      { say: 'In a covalent bond, atoms SHARE electrons, usually between two nonmetals, like in H₂O. Is water ionic or covalent?', expect: ['covalent'], yes: 'Yes, covalent.', no: 'Covalent: oxygen and hydrogen are both nonmetals.' },
      { say: 'Check yourself: give vs share. Which word goes with ionic?', expect: ['give', 'transfer'], yes: 'Perfect.', no: 'Ionic = give (transfer). Covalent = share.' },
    ],
    quiz: [{ q: 'A bond between two nonmetals is usually ionic or covalent?', a: ['covalent'] }],
  },
  {
    id: 'acids',
    subject: 'Chemistry',
    title: 'Acids, bases and pH',
    keys: ['acid', 'base', 'ph', 'alkaline', 'neutraliz'],
    prime: 'Can you name something acidic you eat or drink?',
    steps: [
      { say: 'The pH scale goes from 0 to 14. Below 7 is acidic, above 7 is basic, and exactly 7 is neutral. Pure water is pH 7. Is lemon juice (pH 2) acidic or basic?', expect: ['acid'], yes: 'Right, acidic.', no: 'Acidic, because 2 is below 7.' },
      { say: 'Each step on the pH scale is 10 times stronger. So pH 3 is how many times more acidic than pH 4?', expect: ['10', 'ten'], yes: 'Exactly, 10 times.', no: '10 times, because each step is ×10.' },
      { say: 'When an acid and a base react, they neutralize each other and form water and a salt. Check yourself: what pH would a perfectly neutralized solution have?', expect: ['7', 'seven', 'neutral'], yes: 'Perfect, 7.', no: 'About 7: neutral.' },
    ],
    quiz: [{ q: 'Is pH 10 acidic or basic?', a: ['basic', 'base', 'alkaline'] }],
  },
  // ---------------- Physics ----------------
  {
    id: 'newton',
    subject: 'Physics',
    title: 'Newton\'s laws',
    keys: ['newton', 'inertia', 'f=ma', 'f = ma', 'net force', 'action reaction', 'law of motion'],
    prime: 'When a bus stops suddenly, what happens to the passengers? Why?',
    steps: [
      { say: 'That\'s the first law (inertia): objects keep doing what they\'re doing unless a force acts on them. The bus stops, but your body keeps moving. Which way do you lean?', expect: ['forward', 'front'], yes: 'Right, forward.', no: 'Forward: your body keeps moving.' },
      { say: 'The second law is F = m × a: force equals mass times acceleration. If you push a shopping cart and a car with the same force, which accelerates more?', expect: ['cart'], yes: 'Yes, the cart, because it has less mass.', no: 'The cart, because it has less mass.' },
      { say: 'Third law: every action has an equal and opposite reaction. Check yourself: when you jump, you push down on the ground. What does the ground do?', expect: ['push', 'up'], yes: 'Perfect: it pushes you up.', no: 'It pushes back up on you with an equal force.' },
    ],
    quiz: [
      { q: 'Which law is F = ma?', a: ['second', '2'] },
      { q: 'What is the tendency to keep moving called?', a: ['inertia'] },
    ],
  },
  {
    id: 'motion',
    subject: 'Physics',
    title: 'Speed, velocity and acceleration',
    keys: ['velocity', 'acceleration', 'speed', 'displacement', 'm/s'],
    prime: 'What\'s the difference between saying "60 mph" and "60 mph north"?',
    steps: [
      { say: 'Speed is how fast. Velocity is how fast AND in which direction. Speed = distance ÷ time. If you walk 100 m in 50 s, how would you find your speed? (Tell me the calculation.)', expect: ['100/50', '100 / 50', 'divide', '2'], yes: 'Right: 100 ÷ 50.', no: 'Distance ÷ time: 100 ÷ 50.' },
      { say: 'Acceleration is how fast velocity changes: (final velocity − starting velocity) ÷ time. Is slowing down also acceleration?', expect: ['yes', 'negative'], yes: 'Yes, it\'s negative acceleration.', no: 'Yes, slowing down is acceleration too (negative).' },
      { say: 'Check yourself: a car turns a corner at a constant 30 mph. Is it accelerating? (Think about direction.)', expect: ['yes', 'direction'], yes: 'Perfect: its direction changes, so its velocity changes.', no: 'Yes: the direction changes, so velocity changes.' },
    ],
    quiz: [{ q: 'Which one includes direction: speed or velocity?', a: ['velocity'] }],
  },
  {
    id: 'energy',
    subject: 'Physics',
    title: 'Kinetic and potential energy',
    keys: ['kinetic', 'potential energy', 'conservation of energy', 'joule'],
    prime: 'Where do you think a roller coaster gets its energy?',
    steps: [
      { say: 'Kinetic energy is the energy of motion. Potential energy is stored energy, like height. At the top of a hill, does a roller coaster have more kinetic or potential energy?', expect: ['potential'], yes: 'Right, potential.', no: 'Potential, because it\'s high up.' },
      { say: 'As it goes down, potential energy turns into kinetic energy. Where is it fastest?', expect: ['bottom', 'lowest'], yes: 'Yes, at the bottom.', no: 'At the bottom, where most potential has become kinetic.' },
      { say: 'Energy is never created or destroyed, only changed (conservation of energy). Check yourself: some energy also turns into heat and sound. Does that break the rule?', expect: ['no', 'not'], yes: 'Perfect: it just changed form.', no: 'No, it just changed into other forms.' },
    ],
    quiz: [{ q: 'The energy of motion is called...?', a: ['kinetic'] }],
  },
  {
    id: 'ohm',
    subject: 'Physics',
    title: 'Ohm\'s law',
    keys: ['ohm', 'voltage', 'current', 'resistance', 'circuit', 'v=ir', 'v = ir'],
    prime: 'Have you heard of comparing electricity to water in pipes?',
    steps: [
      { say: 'Voltage is like water pressure, current is like how much water flows, and resistance is like how narrow the pipe is. If the pipe gets narrower (more resistance), does more or less water flow?', expect: ['less'], yes: 'Right, less.', no: 'Less flows.' },
      { say: 'Ohm\'s law: V = I × R (voltage = current × resistance). If you know V and R, how do you find I?', expect: ['v/r', 'divide', 'v / r'], yes: 'Yes: I = V ÷ R.', no: 'Divide: I = V ÷ R.' },
      { say: 'Check yourself: if you double the voltage and keep resistance the same, what happens to the current?', expect: ['double', 'twice', '2'], yes: 'Perfect, it doubles.', no: 'It doubles.' },
    ],
    quiz: [{ q: 'What is the unit of resistance?', a: ['ohm', 'Ω'] }],
  },
  // ---------------- English ----------------
  {
    id: 'thesis',
    subject: 'English',
    title: 'Writing a thesis statement',
    keys: ['thesis', 'claim', 'main argument', 'argumentative'],
    prime: 'What is your essay about? Tell me the topic in a few words.',
    steps: [
      { say: 'A thesis is your main argument in one or two sentences. It takes a position someone could disagree with. "Social media exists" is a fact. What would make it an argument?', expect: ['should', 'because', 'harm', 'help', 'better', 'worse', 'opinion', 'position'], yes: 'Exactly: take a side someone could argue with.', no: 'Add a position, like "Social media harms teens\' sleep because..."' },
      { say: 'A strong thesis also gives your reasons, which become your body paragraphs. Try writing YOUR thesis as: [topic] + [your position] + because [reason 1], [reason 2], and [reason 3].', expect: ['because'], yes: 'Nice structure. Now check: could someone disagree with it?', no: 'Try to include "because" and two or three reasons. I\'ll help you sharpen it, but the words should be yours.' },
      { say: 'Check yourself: does your thesis (1) answer the prompt, (2) take a side, and (3) preview your reasons? Which of the three needs work?', expect: [], yes: '', no: '' },
    ],
    quiz: [{ q: 'True or false: a thesis should be a fact everyone agrees with.', a: ['false'] }],
  },
  {
    id: 'essay',
    subject: 'English',
    title: 'Paragraph and essay structure',
    keys: ['essay', 'paragraph', 'topic sentence', 'body paragraph', 'conclusion', 'introduction', 'peel', 'cer'],
    prime: 'What part of writing the essay feels hardest right now: starting, organizing, or explaining your evidence?',
    steps: [
      { say: 'A strong body paragraph follows C-E-R: Claim (your point), Evidence (a quote or fact), Reasoning (explain HOW the evidence proves your claim). Which part do students skip most often, do you think?', expect: ['reason', 'explain'], yes: 'Yes, the reasoning. That\'s where the points are.', no: 'The reasoning. Explaining how the evidence proves your point is where you earn points.' },
      { say: 'Try it now: write just your Claim for one paragraph, in one sentence. I\'ll give you feedback, but I won\'t write it for you.', expect: [], yes: '', no: '' },
      { say: 'Good. Now, what evidence (a quote, a fact, an example) supports it? After that, write 2 sentences explaining why that evidence proves your claim.', expect: [], yes: '', no: '' },
    ],
    quiz: [{ q: 'What does the R in C-E-R stand for?', a: ['reason'] }],
  },
  {
    id: 'evidence',
    subject: 'English',
    title: 'Using evidence and quotes',
    keys: ['quote', 'citation', 'cite', 'evidence', 'textual evidence', 'mla'],
    prime: 'Do you have a quote picked out already, or are you looking for one?',
    steps: [
      { say: 'Never drop a quote alone. Use a "quote sandwich": introduce it (who says it and when), give the quote, then explain it. Why do you think the explanation matters most?', expect: ['prove', 'connect', 'show', 'claim', 'why'], yes: 'Exactly: it connects the quote to your claim.', no: 'Because it shows how the quote proves your claim.' },
      { say: 'Pick evidence that is specific. A short quote that hits your point beats a long one. Look at your quote: which 3 to 8 words matter most?', expect: [], yes: '', no: '' },
      { say: 'Check yourself: after your quote, do you have at least two sentences of your own explaining it?', expect: [], yes: '', no: '' },
    ],
    quiz: [{ q: 'What are the three parts of a quote sandwich?', a: ['introduc', 'explain', 'quote'] }],
  },
  {
    id: 'theme',
    subject: 'English',
    title: 'Theme and literary devices',
    keys: ['theme', 'symbol', 'symbolism', 'metaphor', 'simile', 'foreshadow', 'irony', 'literary device', 'personification'],
    prime: 'What book or text are you working on?',
    steps: [
      { say: 'A theme is a message about life, written as a full sentence, not one word. "Friendship" is a topic. What would turn it into a theme?', expect: ['friend', 'sentence', 'can', 'should', 'is'], yes: 'Yes: a full statement, like "True friendship means sacrifice."', no: 'Turn it into a statement, like "Loneliness makes people desperate for connection."' },
      { say: 'Authors build themes with devices: symbols, metaphors, foreshadowing, irony. A simile compares using "like" or "as". Is "her voice was music" a simile or a metaphor?', expect: ['metaphor'], yes: 'Right, a metaphor (no like/as).', no: 'A metaphor: there\'s no "like" or "as".' },
      { say: 'Check yourself: pick one symbol from your text. What could it represent, and what evidence supports that?', expect: [], yes: '', no: '' },
    ],
    quiz: [{ q: 'A comparison using "like" or "as" is called a...?', a: ['simile'] }],
  },
  // ---------------- History & social studies ----------------
  {
    id: 'ww1',
    subject: 'History',
    title: 'Causes of World War I',
    keys: ['world war i', 'world war 1', 'wwi', 'ww1', 'great war', 'franz ferdinand', 'alliances'],
    prime: 'What do you already know about how World War I started?',
    steps: [
      { say: 'Historians use the memory trick MAIN: Militarism, Alliances, Imperialism, Nationalism. Which of these means building up armies and weapons?', expect: ['militarism'], yes: 'Right, militarism.', no: 'Militarism.' },
      { say: 'Alliances meant that if one country went to war, its partners joined in. Why would that turn a small conflict into a huge one?', expect: ['join', 'domino', 'chain', 'drag', 'more countries'], yes: 'Exactly, like dominoes.', no: 'Because countries got pulled in one after another, like dominoes.' },
      { say: 'The spark was the assassination of Archduke Franz Ferdinand in 1914. Check yourself: was the assassination the only cause, or the trigger for deeper causes?', expect: ['trigger', 'spark', 'deeper', 'not the only', 'main'], yes: 'Perfect: the spark that lit MAIN.', no: 'The trigger. The deeper causes were MAIN.' },
    ],
    quiz: [
      { q: 'What does the A in MAIN stand for?', a: ['alliance'] },
      { q: 'Whose assassination triggered WWI?', a: ['franz ferdinand', 'ferdinand'] },
    ],
  },
  {
    id: 'revolution',
    subject: 'History',
    title: 'Causes of the American Revolution',
    keys: ['american revolution', 'revolutionary war', 'stamp act', 'taxation without representation', 'boston tea party', 'colonists'],
    prime: 'Why do you think the colonists became angry at Britain?',
    steps: [
      { say: 'After an expensive war, Britain taxed the colonies (Stamp Act, Townshend Acts, Tea Act). The colonists\' slogan was "no taxation without ___". Can you fill it in?', expect: ['representation'], yes: 'Yes: representation.', no: '"No taxation without representation."' },
      { say: 'They weren\'t angry only about money. They had no vote in Parliament. Why would that matter?', expect: ['vote', 'say', 'voice', 'rights'], yes: 'Exactly: they had no say in the laws.', no: 'Because they had no voice in making the laws they had to follow.' },
      { say: 'Check yourself: put these in order: Boston Tea Party, Stamp Act, Declaration of Independence.', expect: ['stamp'], yes: 'Nice: Stamp Act (1765), Boston Tea Party (1773), Declaration (1776).', no: 'Stamp Act (1765) → Boston Tea Party (1773) → Declaration of Independence (1776).' },
    ],
    quiz: [{ q: 'In what year was the Declaration of Independence signed?', a: ['1776'] }],
  },
  {
    id: 'sources',
    subject: 'History',
    title: 'Primary and secondary sources',
    keys: ['primary source', 'secondary source', 'sourcing', 'document analysis', 'dbq'],
    prime: 'If you wanted to know what a soldier felt in 1918, where would you look?',
    steps: [
      { say: 'A primary source was made at the time by someone who was there (a letter, diary, photo, speech). A secondary source is made later about it (a textbook, a documentary). Is a soldier\'s diary from 1918 primary or secondary?', expect: ['primary'], yes: 'Right, primary.', no: 'Primary: it was written at the time.' },
      { say: 'For any source, ask: Who made it? When? Why? Who was it for? Why does the "why" matter?', expect: ['bias', 'point of view', 'purpose', 'opinion'], yes: 'Exactly: purpose can create bias.', no: 'Because the purpose can create bias or a point of view.' },
      { say: 'Check yourself: is your history textbook primary or secondary?', expect: ['secondary'], yes: 'Perfect.', no: 'Secondary: it was written later.' },
    ],
    quiz: [{ q: 'A photo taken during an event is a ___ source.', a: ['primary'] }],
  },
  {
    id: 'government',
    subject: 'Civics',
    title: 'Branches of government',
    keys: ['branches of government', 'checks and balances', 'legislative', 'executive', 'judicial', 'separation of powers'],
    prime: 'Why do you think the founders split power into different parts?',
    steps: [
      { say: 'There are three branches: legislative (makes laws), executive (carries out laws), judicial (interprets laws). Which branch is Congress?', expect: ['legislative'], yes: 'Right, legislative.', no: 'Legislative: Congress makes laws.' },
      { say: 'Checks and balances let each branch limit the others. For example, the President can veto a law. Which branch can decide a law is unconstitutional?', expect: ['judicial', 'supreme court', 'court'], yes: 'Yes, the judicial branch.', no: 'The judicial branch (the courts).' },
      { say: 'Check yourself: why does splitting power protect people\'s rights?', expect: ['power', 'one', 'abuse', 'tyrann', 'control'], yes: 'Perfect: no single branch gets too much power.', no: 'So no single group can take too much power.' },
    ],
    quiz: [{ q: 'Which branch is led by the President?', a: ['executive'] }],
  },
];

export function findConcept(text) {
  const t = ' ' + String(text).toLowerCase() + ' ';
  let best = null;
  let bestScore = 0;
  for (const c of CONCEPTS) {
    let score = 0;
    for (const k of c.keys) {
      if (k.length <= 3 ? new RegExp(`[^a-z]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t) : t.includes(k)) score += k.length;
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export function conceptById(id) {
  return CONCEPTS.find((c) => c.id === id) || null;
}

export function conceptsFor(subjectName) {
  const s = String(subjectName || '').toLowerCase();
  const map = { bio: 'Biology', chem: 'Chemistry', phys: 'Physics', engl: 'English', lit: 'English', hist: 'History', civic: 'Civics', gov: 'Civics', social: 'History' };
  const hit = Object.entries(map).find(([k]) => s.includes(k));
  return hit ? CONCEPTS.filter((c) => c.subject === hit[1]) : [];
}

/** Does the student's reply contain one of the expected words? */
export function matches(reply, words) {
  const t = String(reply).toLowerCase().replace(/[₂]/g, '2');
  return (words || []).some((w) => {
    const k = w.toLowerCase();
    if (k.length <= 2) return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t);
    return t.includes(k);
  });
}
