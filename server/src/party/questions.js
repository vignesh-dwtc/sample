// Trivia Blitz question bank — original general-knowledge questions.
// Authoring format: { c: category, q: question, a: correct answer, w: [three wrong answers] }.
// Choices are shuffled per game by the engine, so the correct answer's position is never fixed.

const RAW = [
  // Science
  { c: 'Science', q: 'Which gas do plants mainly take in from the air to make their food?', a: 'Carbon dioxide', w: ['Oxygen', 'Nitrogen', 'Helium'] },
  { c: 'Science', q: 'What is the chemical symbol for gold?', a: 'Au', w: ['Ag', 'Gd', 'Go'] },
  { c: 'Science', q: 'How many bones does a typical adult human skeleton have?', a: '206', w: ['186', '226', '256'] },
  { c: 'Science', q: 'Which is the hardest naturally occurring material?', a: 'Diamond', w: ['Quartz', 'Granite', 'Iron'] },
  { c: 'Science', q: 'At sea level, water boils at how many degrees Celsius?', a: '100', w: ['90', '110', '212'] },
  { c: 'Science', q: 'Which organ pumps blood around the human body?', a: 'Heart', w: ['Liver', 'Lungs', 'Kidneys'] },
  { c: 'Science', q: 'Which part of a plant or animal cell holds most of its DNA?', a: 'Nucleus', w: ['Ribosome', 'Cell membrane', 'Vacuole'] },
  { c: 'Science', q: 'Which gas makes up most of the air we breathe?', a: 'Nitrogen', w: ['Oxygen', 'Carbon dioxide', 'Argon'] },
  { c: 'Science', q: 'Your skin makes which vitamin when exposed to sunlight?', a: 'Vitamin D', w: ['Vitamin A', 'Vitamin C', 'Vitamin K'] },
  { c: 'Science', q: 'What is the pH of pure water at room temperature?', a: '7', w: ['0', '5', '10'] },
  { c: 'Science', q: 'What do we call the temperature at which a solid turns into a liquid?', a: 'Melting point', w: ['Boiling point', 'Dew point', 'Flash point'] },

  // Space
  { c: 'Space', q: 'Which planet is nicknamed the Red Planet?', a: 'Mars', w: ['Venus', 'Jupiter', 'Mercury'] },
  { c: 'Space', q: 'What is the largest planet in our solar system?', a: 'Jupiter', w: ['Saturn', 'Neptune', 'Earth'] },
  { c: 'Space', q: 'Which planet orbits closest to the Sun?', a: 'Mercury', w: ['Venus', 'Mars', 'Earth'] },
  { c: 'Space', q: 'Roughly how long does sunlight take to reach Earth?', a: 'About 8 minutes', w: ['About 8 seconds', 'About 8 hours', 'About 8 days'] },
  { c: 'Space', q: 'What is the name of the galaxy our solar system belongs to?', a: 'The Milky Way', w: ['Andromeda', 'Triangulum', 'Sombrero'] },
  { c: 'Space', q: 'Which planet is famous for its wide, bright ring system?', a: 'Saturn', w: ['Uranus', 'Mars', 'Mercury'] },
  { c: 'Space', q: 'What is the closest star to Earth?', a: 'The Sun', w: ['Proxima Centauri', 'Sirius', 'Polaris'] },
  { c: 'Space', q: 'What natural object orbits Earth roughly once a month?', a: 'The Moon', w: ['Halley’s Comet', 'Venus', 'The asteroid belt'] },

  // Geography
  { c: 'Geography', q: 'Which is the largest ocean on Earth?', a: 'Pacific', w: ['Atlantic', 'Indian', 'Arctic'] },
  { c: 'Geography', q: 'Which continent is the largest by land area?', a: 'Asia', w: ['Africa', 'North America', 'Europe'] },
  { c: 'Geography', q: 'What is the capital city of Japan?', a: 'Tokyo', w: ['Kyoto', 'Osaka', 'Nagoya'] },
  { c: 'Geography', q: 'The Sahara Desert covers much of which continent?', a: 'Africa', w: ['Asia', 'Australia', 'South America'] },
  { c: 'Geography', q: 'What is the capital city of Canada?', a: 'Ottawa', w: ['Toronto', 'Vancouver', 'Montreal'] },
  { c: 'Geography', q: 'Which great river flows north through Egypt to the Mediterranean?', a: 'Nile', w: ['Amazon', 'Danube', 'Mekong'] },
  { c: 'Geography', q: 'Mount Everest sits on the border between Nepal and which country?', a: 'China', w: ['India', 'Bhutan', 'Pakistan'] },
  { c: 'Geography', q: 'What is the capital city of Australia?', a: 'Canberra', w: ['Sydney', 'Melbourne', 'Perth'] },
  { c: 'Geography', q: 'Which country has the largest land area in the world?', a: 'Russia', w: ['Canada', 'China', 'Brazil'] },
  { c: 'Geography', q: 'Which US state is made up entirely of islands?', a: 'Hawaii', w: ['Alaska', 'Florida', 'Maine'] },
  { c: 'Geography', q: 'What is the smallest country in the world by area?', a: 'Vatican City', w: ['Monaco', 'San Marino', 'Liechtenstein'] },
  { c: 'Geography', q: 'Which imaginary line divides Earth into northern and southern halves?', a: 'The Equator', w: ['The Prime Meridian', 'The Tropic of Cancer', 'The Arctic Circle'] },

  // History
  { c: 'History', q: 'In which year did astronauts first walk on the Moon?', a: '1969', w: ['1959', '1972', '1965'] },
  { c: 'History', q: 'Which ancient civilization built the great pyramids at Giza?', a: 'Ancient Egyptians', w: ['Romans', 'Maya', 'Ancient Greeks'] },
  { c: 'History', q: 'Johannes Gutenberg’s famous invention made it far cheaper to produce what?', a: 'Printed books', w: ['Telescopes', 'Clocks', 'Steam engines'] },
  { c: 'History', q: 'From which English port did the Titanic set off on its first voyage?', a: 'Southampton', w: ['Liverpool', 'Belfast', 'Dover'] },
  { c: 'History', q: 'Which Roman town was buried by the eruption of Mount Vesuvius in 79 AD?', a: 'Pompeii', w: ['Carthage', 'Troy', 'Sparta'] },
  { c: 'History', q: 'Which barrier dividing a European capital came down in 1989?', a: 'The Berlin Wall', w: ['Hadrian’s Wall', 'The Great Wall', 'The Iron Bridge'] },
  { c: 'History', q: 'The Great Wall was built mainly to protect the northern borders of which country?', a: 'China', w: ['Mongolia', 'Japan', 'India'] },
  { c: 'History', q: 'Which ship carried the Pilgrims to North America in 1620?', a: 'The Mayflower', w: ['The Endeavour', 'The Beagle', 'The Victory'] },

  // Nature
  { c: 'Nature', q: 'What is the largest animal known to have ever lived?', a: 'Blue whale', w: ['African elephant', 'Whale shark', 'Giraffe'] },
  { c: 'Nature', q: 'How many legs does a spider have?', a: '8', w: ['6', '10', '12'] },
  { c: 'Nature', q: 'What is a baby kangaroo called?', a: 'Joey', w: ['Kit', 'Cub', 'Calf'] },
  { c: 'Nature', q: 'What is the fastest land animal?', a: 'Cheetah', w: ['Lion', 'Pronghorn', 'Greyhound'] },
  { c: 'Nature', q: 'Which is the only mammal capable of true powered flight?', a: 'Bat', w: ['Flying squirrel', 'Sugar glider', 'Flying fish'] },
  { c: 'Nature', q: 'How many hearts does an octopus have?', a: '3', w: ['1', '2', '4'] },
  { c: 'Nature', q: 'Bamboo makes up almost all of the diet of which animal?', a: 'Giant panda', w: ['Koala', 'Sloth', 'Gorilla'] },
  { c: 'Nature', q: 'What do caterpillars turn into?', a: 'Butterflies or moths', w: ['Beetles', 'Dragonflies', 'Bees'] },
  { c: 'Nature', q: 'Which flightless bird is the largest living bird?', a: 'Ostrich', w: ['Emu', 'Penguin', 'Kiwi'] },

  // Food
  { c: 'Food', q: 'Guacamole is made mostly from which fruit?', a: 'Avocado', w: ['Lime', 'Green tomato', 'Kiwi'] },
  { c: 'Food', q: 'Sushi is a traditional dish from which country?', a: 'Japan', w: ['China', 'Thailand', 'Vietnam'] },
  { c: 'Food', q: 'What is the main ingredient of classic hummus?', a: 'Chickpeas', w: ['Lentils', 'Peanuts', 'Black beans'] },
  { c: 'Food', q: 'Which pricey spice comes from the dried threads of a crocus flower?', a: 'Saffron', w: ['Turmeric', 'Paprika', 'Cumin'] },
  { c: 'Food', q: 'Marzipan is made mainly from ground what?', a: 'Almonds', w: ['Cashews', 'Walnuts', 'Hazelnuts'] },
  { c: 'Food', q: 'Profiteroles and éclairs are made from which kind of pastry?', a: 'Choux', w: ['Puff', 'Filo', 'Shortcrust'] },
  { c: 'Food', q: 'Which grain is used to make traditional risotto?', a: 'Rice', w: ['Barley', 'Wheat', 'Oats'] },

  // Language
  { c: 'Language', q: 'How many letters are in the English alphabet?', a: '26', w: ['24', '25', '28'] },
  { c: 'Language', q: 'What do you call a word that reads the same forwards and backwards?', a: 'Palindrome', w: ['Anagram', 'Homonym', 'Acronym'] },
  { c: 'Language', q: 'Which language has the most native speakers worldwide?', a: 'Mandarin Chinese', w: ['English', 'Spanish', 'Hindi'] },
  { c: 'Language', q: 'A word that means the opposite of another word is called what?', a: 'An antonym', w: ['A synonym', 'A homophone', 'A pronoun'] },

  // Math
  { c: 'Math', q: 'What is 7 × 8?', a: '56', w: ['54', '58', '64'] },
  { c: 'Math', q: 'How many sides does a hexagon have?', a: '6', w: ['5', '7', '8'] },
  { c: 'Math', q: 'What is the square root of 144?', a: '12', w: ['14', '11', '16'] },
  { c: 'Math', q: 'How many degrees are in a right angle?', a: '90', w: ['45', '180', '360'] },
  { c: 'Math', q: 'What is the next prime number after 7?', a: '11', w: ['9', '13', '10'] },
  { c: 'Math', q: 'How many minutes are there in one day?', a: '1,440', w: ['1,240', '1,600', '2,400'] },
  { c: 'Math', q: 'Which number is written as XII in Roman numerals?', a: '12', w: ['11', '17', '21'] },

  // Arts & Music
  { c: 'Arts', q: 'How many keys does a standard modern piano have?', a: '88', w: ['76', '92', '64'] },
  { c: 'Arts', q: 'Who painted The Starry Night?', a: 'Vincent van Gogh', w: ['Claude Monet', 'Pablo Picasso', 'Salvador Dalí'] },
  { c: 'Arts', q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', w: ['Michelangelo', 'Raphael', 'Rembrandt'] },
  { c: 'Arts', q: 'How many strings does a standard guitar have?', a: '6', w: ['4', '5', '8'] },
  { c: 'Arts', q: 'Mixing blue and yellow paint gives you which colour?', a: 'Green', w: ['Purple', 'Orange', 'Brown'] },
  { c: 'Arts', q: 'Who wrote the play Romeo and Juliet?', a: 'William Shakespeare', w: ['Christopher Marlowe', 'Charles Dickens', 'Geoffrey Chaucer'] },
  { c: 'Arts', q: 'Which composer wrote the Moonlight Sonata?', a: 'Ludwig van Beethoven', w: ['Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Frédéric Chopin'] },

  // Sports
  { c: 'Sports', q: 'How many players does each soccer team have on the pitch at once?', a: '11', w: ['9', '10', '12'] },
  { c: 'Sports', q: 'In which sport would you see a slam dunk?', a: 'Basketball', w: ['Volleyball', 'Tennis', 'Rugby'] },
  { c: 'Sports', q: 'How often are the Summer Olympic Games normally held?', a: 'Every 4 years', w: ['Every 2 years', 'Every 3 years', 'Every 5 years'] },
  { c: 'Sports', q: 'In tennis, what word means a score of zero?', a: 'Love', w: ['Nil', 'Duck', 'Blank'] },
  { c: 'Sports', q: 'How many interlocking rings appear on the Olympic flag?', a: '5', w: ['4', '6', '7'] },
  { c: 'Sports', q: 'Roughly how long is a marathon?', a: '42.2 km', w: ['26.2 km', '50 km', '30 km'] },

  // Technology
  { c: 'Tech', q: 'What does CPU stand for?', a: 'Central Processing Unit', w: ['Computer Personal Unit', 'Central Program Utility', 'Core Power Unit'] },
  { c: 'Tech', q: 'What is the number 5 written in binary?', a: '101', w: ['110', '111', '100'] },
  { c: 'Tech', q: 'In a web address, what does “www” stand for?', a: 'World Wide Web', w: ['Wide World Web', 'Web World Wide', 'World Web Window'] },
  { c: 'Tech', q: 'How many bits are in one byte?', a: '8', w: ['4', '16', '10'] },
];

/** Normalized bank: [{ id, category, text, choices[4], answer }] with the correct answer at index 0 (shuffled at play time). */
export const QUESTIONS = RAW.map((r, id) => ({
  id,
  category: r.c,
  text: r.q,
  choices: [r.a, ...r.w],
  answer: 0,
}));
