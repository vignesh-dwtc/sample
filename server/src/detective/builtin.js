// Three original, handcrafted cozy-mystery cases. Fully playable without an API key.
// Each culprit tells a story with a contradiction that the clues and the other suspects expose.
// Everything here is server-only; toPublicCase() (service.js) strips the secret parts.

export const BUILTIN_CASES = [
  // ───────────────────────────────────────────────────────────── 1 ──
  {
    key: 'larkspur',
    title: 'The Last Note at Larkspur Hall',
    setting: 'Larkspur Hall, a lakeside concert hall, on the stormy night before its centenary gala',
    victim: 'Maestro Edmund Vail, the hall’s celebrated and famously difficult conductor',
    victimAliases: ['edmund', 'vail', 'maestro', 'conductor', 'victim'],
    intro:
      'Rain lashed Larkspur Hall all evening as the orchestra prepared for tomorrow’s centenary gala. ' +
      'At 9:00 pm a lightning strike knocked out the power. At 10:15 pm the stage manager found Maestro Edmund Vail ' +
      'slumped in the armchair of his green room, a half-finished cup of tea at his elbow. He never woke: someone had ' +
      'stirred a heavy dose of sleeping tincture into his tea. Four people were in the building that night — and one of them is lying to you.',
    clues: [
      'Power log: the storm cut the hall’s electricity from 9:00 pm to 9:20 pm. Every light in the building — including the great glass façade facing the lawn — went dark.',
      'The maestro’s tea was brewed during the blackout on the old spirit kettle in the green room. Two cups had been used.',
      'The empty tincture bottle from the backstage first-aid cabinet was found hidden behind a potted fern in the piano lounge.',
      'A green umbrella with a bamboo handle, its canopy still damp, was leaning against the green-room door when the body was found.',
      'The maestro’s desk diary, today’s page: “Tell T. tonight — the Nocturne is mine now. C. must hear about the soloist decision.”',
    ],
    culpritId: 'theo',
    motive:
      'The maestro planned to premiere Theo’s “Nocturne in Grey” at the gala under his own name, stealing three years of Theo’s work.',
    method:
      'During the blackout Theo slipped back in through the stage door under the borrowed green umbrella, took the sleeping tincture from the first-aid cabinet (whose lock he knew was broken), ' +
      'brewed two cups of tea on the spirit kettle as a “peace offering”, and laced the maestro’s cup. He hid the empty bottle behind the fern in the piano lounge and fled, forgetting the umbrella at the green-room door.',
    explanation:
      'Theo swore he sat in the garden pavilion from 8:15 until after 10:15 without an umbrella, and that the hall’s lights were blazing all evening. ' +
      'But the whole building went dark from 9:00 to 9:20; Rowan had locked the pavilion at 6 pm and lent Theo the very umbrella found at the green-room door; ' +
      'Celeste saw a rust corduroy sleeve carrying two teacups into the green room at 9:10; and Dahlia heard someone hum the Nocturne — a tune only Theo and the maestro knew — on the way there. ' +
      'Theo even pretended not to know where the first-aid cabinet was, though Rowan had shown him the week before.',
    suspects: [
      {
        id: 'celeste',
        name: 'Celeste Ambrose',
        role: 'First violin',
        emoji: '🎻',
        description: 'Poised and precise, first chair for eleven years. Rumour says the maestro meant to hand her gala solo to someone younger.',
        personality: 'Cool, articulate and a little proud; softens when she talks about music.',
        alibi: 'Practised scales by candlelight in Rehearsal Room B from about 8:50 to 9:30 pm.',
        secret: 'She has secretly signed with an orchestra abroad and planned to resign after the gala, so losing the solo barely mattered to her.',
        knowledge: 'Around 9:10 pm she saw a tall figure in a rust corduroy jacket carry two teacups into the green room. She knows Theo wrote the Nocturne.',
        aliases: ['celeste', 'ambrose', 'violinist', 'first violin', 'violin'],
        lines: {
          greet: ['Detective. I imagine you want to know where I was. Ask — I have nothing to hide.'],
          alibi: [
            'Rehearsal Room B, from about ten to nine until half past. When the power died I lit a candle and kept running scales — a violinist doesn’t need light for scales.',
            'Scales, by candlelight, in Room B. Mrs Fenwick was waiting by the stairwell right outside; she must have heard every note.',
          ],
          victim: [
            'Edmund taught me everything I know, and then spent ten years reminding me of it. Brilliant and cruel in equal measure. I’ll miss the brilliant half.',
          ],
          saw: [
            'Yes, actually. Around ten past nine, in the blackout, I stepped into the corridor for more candles. Someone tall went past the far end carrying two teacups toward the green room. My candle caught a sleeve — rust-coloured corduroy.',
            'Two teacups, a tall figure, rust corduroy. They went into the green room and the door closed behind them. I assumed Edmund had company and went back to my scales.',
          ],
          motive: [
            'You’ve heard about the solo. Yes, Edmund meant to give it to some twenty-year-old prodigy. Would I poison a man over eight minutes of music? Please.',
            'Let’s just say the solo matters far less to me than people assume. My plans for next season are… my own business.',
          ],
          accuse: [
            'No. I was playing scales while somebody else was playing host with the teacups. Find the person in the corduroy jacket.',
          ],
          suspicion: [
            'I don’t deal in guesses. But I know what I saw at ten past nine, and I know who owns a rust corduroy jacket. Ask Theo where he really was.',
          ],
        },
        about: {
          rowan: [
            'Rowan keeps this building running on string and sticky tape. When the lights went he was down in the plant room — I could hear him clanging about through the floor vent, swearing at the fuse box.',
          ],
          dahlia: [
            'Our patron. She writes large cheques and expects large bows. Though I hear lately her cheques have been… slow to arrive.',
          ],
          theo: [
            'Theo Marsh, the young composer — sweet, nervous, talented. The “Nocturne in Grey” Edmund rehearsed all week is Theo’s; I’ve seen the pencil manuscript in his satchel. And Theo is the only person here who wears rust corduroy.',
          ],
        },
        topics: [
          { keys: ['resign', 'leave', 'leaving', 'abroad', 'offer', 'contract', 'career', 'next season', 'plans', 'future', 'new job', 'quit'],
            replies: ['Fine. I’ve signed with the Halvard Philharmonic and I was going to resign the morning after the gala. Edmund didn’t know. So you see, his little soloist game meant nothing to me.'] },
          { keys: ['jacket', 'corduroy', 'sleeve', 'figure', 'tall', 'teacups', 'two cups', 'tray', 'cups'],
            replies: ['Rust corduroy with leather elbow patches. I’d know it anywhere — Theo has worn it to every rehearsal this season. Whoever wore it went straight into the green room with the tea.'] },
          { keys: ['nocturne', 'melody', 'tune', 'composition', 'manuscript', 'piece', 'composer', 'compose', 'wrote', 'hum'],
            replies: ['The Nocturne in Grey. Edmund announced it as “a rediscovered work of his youth”. Nonsense — it’s Theo’s. I’ve seen the manuscript in his hand. Edmund was going to put his own name on it.'] },
          { keys: ['solo', 'soloist', 'prodigy', 'replace', 'replaced'],
            replies: ['The gala solo was to go to a girl from the conservatory. Edmund liked to keep his players frightened. It didn’t work on me — not this time.'] },
          { keys: ['tea', 'kettle', 'tincture', 'bottle', 'medicine', 'first aid', 'cabinet', 'fern', 'lounge', 'poison', 'sleeping'],
            replies: ['I never touch the green-room tea; Edmund brewed it like tar. The first-aid cabinet is backstage by the stage door — whether it locks properly, ask Rowan.'] },
          { keys: ['umbrella', 'rain', 'outside', 'pavilion', 'garden'],
            replies: ['I didn’t set foot outside — I’m not foolish enough to carry a violin through that downpour. There’s a stand of umbrellas by the stage door; Rowan lends them out.'] },
          { keys: ['candle', 'dark', 'blackout', 'power', 'lights', 'storm', 'lightning'],
            replies: ['The lights died at nine on the dot with a crack of thunder. The whole building went black — through the window I could see the lake and not a single lit window on our side. Rowan had them back about twenty past.'] },
          { keys: ['diary', 'soloist decision', 'c.'],
            replies: ['“C. must hear about the soloist decision”? That’s me. I’d heard already. Gossip travels faster than Edmund ever did.'] },
        ],
        fallback: [
          'I’m not sure what you’re driving at, Detective. Ask me about tonight — where I was, what I saw.',
          'I play the violin; I don’t do riddles. Try something specific.',
        ],
      },
      {
        id: 'rowan',
        name: 'Rowan Pike',
        role: 'Stage manager',
        emoji: '🔦',
        description: 'Keeper of the keys and fixer of fuses. Twenty years at Larkspur Hall — and the one who found the body.',
        personality: 'Gruff, practical, quietly terrified of losing his job.',
        alibi: 'In the basement plant room from 9:00 to 9:20 pm restoring power, then on his rounds until he found the maestro at 10:15 pm.',
        secret: 'The lock on the backstage first-aid cabinet has been broken for weeks; he never reported it for fear of being blamed.',
        knowledge: 'He lent Theo the green bamboo-handled umbrella at 8:15 pm. He locked the garden pavilion at 6 pm and holds the only key. Last week he showed Theo the first-aid cabinet.',
        aliases: ['rowan', 'pike', 'stage manager', 'stagehand'],
        lines: {
          greet: ['Evening. Or what’s left of it. Make it quick — there are constables tramping mud through my hall.'],
          alibi: [
            'Lightning took out the transformer at nine sharp. I was down in the basement plant room from nine until I got the breakers reset, about twenty past. Then I did my rounds, and at quarter past ten I knocked on the maestro’s door with his gala notes. That’s when I found him.',
          ],
          victim: [
            'Twenty years I worked for the maestro. Never once said thank you, never once forgot a mistake. But he made this hall sing. I’d not have wished this on him.',
          ],
          saw: [
            'When I found him there was a green umbrella leaning on his door, the bamboo-handled one from the stage-door stand. Canopy still damp. I’d lent it out myself earlier tonight.',
            'Two teacups used in the green room, an umbrella that had been out in the rain, and the maestro asleep for good. He had company tonight, Detective — someone who came in from outside.',
          ],
          motive: [
            'Me? The maestro was the reason I have a job. With him gone, the board will bring in some flashy events company and I’ll be out on my ear. I’ve lost more than anyone tonight.',
          ],
          accuse: [
            'I found him, Detective. Doesn’t make me the one who did it. I was elbow-deep in a fuse box when that tea was poured.',
          ],
          suspicion: [
            'Not my place to say. But somebody came in from the rain with my umbrella, and there’s only one person I lent it to.',
          ],
        },
        about: {
          celeste: [
            'Ms Ambrose was in Rehearsal Room B. Its vent runs right past the plant room — I could hear her scales the whole time the lights were out, plain as anything.',
          ],
          dahlia: [
            'Mrs Fenwick spent the evening in the lobby on the telephone, pacing about like she owns the place. Well — she nearly does, with what she’s given. Or promised to give.',
          ],
          theo: [
            'Young Mr Marsh? Nice lad. Went out at quarter past eight, said he needed air. I lent him the green umbrella from the stand — the bamboo-handled one — because it was already tipping down.',
            'And he knows his way round backstage, mind. Last week he sliced his finger on a music stand and I walked him to the first-aid cabinet myself.',
          ],
        },
        topics: [
          { keys: ['umbrella', 'bamboo', 'lent', 'borrow'],
            replies: ['Green, bamboo handle, belongs to the stage door. I lent it to Theo Marsh at quarter past eight when he went out. Next time I saw it, it was leaning on the maestro’s door at quarter past ten with the canopy still damp.'] },
          { keys: ['pavilion', 'garden', 'gazebo', 'lawn', 'outside', 'keys', 'key'],
            replies: ['The garden pavilion? Locked it myself at six — the roof leaks in a storm. The only key’s on this ring and it hasn’t left my belt all night. Nobody’s been sitting in that pavilion tonight.'] },
          { keys: ['cabinet', 'first aid', 'tincture', 'bottle', 'medicine', 'sleeping', 'broken', 'lock', 'secure', 'report'],
            replies: [
              'The first-aid cabinet’s backstage, by the stage door. The tincture is for musicians with bad nerves — doctor’s orders. It’s… it’s kept secure.',
              'All right. The lock’s been broken for weeks. I kept meaning to report it, but they’d have blamed me — they blame me for everything. Anyone who knew where that cabinet was could have opened it. And I showed Theo where it was myself.',
            ] },
          { keys: ['blackout', 'power', 'lights', 'fuse', 'storm', 'lightning', 'dark', 'transformer', 'breaker', 'façade', 'facade', 'glass'],
            replies: ['Lightning hit the transformer at nine on the dot. Every light in the building went black, the big glass front included — you couldn’t see a thing from the lawn. Back on by twenty past. Anyone who says the hall was lit up in that window is having you on.'] },
          { keys: ['tea', 'kettle', 'teacup', 'cups', 'cup'],
            replies: ['The maestro brewed his own tea on that old spirit kettle — runs without electricity, so he could brew in a blackout. When I found him, two cups had been used. He wasn’t drinking alone.'] },
          { keys: ['fern', 'piano lounge', 'lounge', 'stage door'],
            replies: ['The piano lounge sits between the stage door and the green room. Anyone slipping in from outside would pass that fern on the way to the maestro.'] },
          { keys: ['nocturne', 'music', 'melody', 'tune', 'piano'],
            replies: ['Music’s not my department. Though he’d been hammering the same slow tune on the green-room piano all week. “My Nocturne,” he called it.'] },
          { keys: ['job', 'fired', 'board', 'events company'],
            replies: ['The board’s been itching to modernise. The maestro kept me on out of habit. Now? I’ll be lucky to keep my key ring.'] },
        ],
        fallback: [
          'Couldn’t tell you. I deal in fuses and floorboards, not riddles.',
          'Ask me something I’d know — doors, keys, lights, who went where.',
        ],
      },
      {
        id: 'dahlia',
        name: 'Dahlia Fenwick',
        role: 'Patron of the hall',
        emoji: '💎',
        description: 'Elegant, generous and very public about it. Her name is on the new wing — and on a huge gala pledge.',
        personality: 'Grand, theatrical, prickly about money.',
        alibi: 'On the telephone in the lobby until 9:00 pm, then frozen by the main stairwell through the blackout.',
        secret: 'She is nearly bankrupt and her gala pledge would bounce; the maestro found out and threatened to tell the board.',
        knowledge: 'She heard violin scales from Room B throughout the blackout. Around 9:10 someone in a rough sleeve, smelling of rain, brushed past her humming the maestro’s “Nocturne”.',
        aliases: ['dahlia', 'fenwick', 'patron', 'benefactor', 'donor'],
        lines: {
          greet: ['Oh, Detective, thank heavens. What a ghastly, ghastly night. Do ask me anything — anything at all.'],
          alibi: [
            'I was in the lobby on the telephone with my accountant — tiresome man — until nine, when the lights went and the line died. I simply froze by the main stairwell. Couldn’t see my own hand! I stayed put until the lights came back.',
          ],
          victim: [
            'Edmund and I were friends for thirty years. I funded his very first orchestra, you know. He could be a beast, but he was our beast. Larkspur will never be the same.',
          ],
          saw: [
            'See? Darling, it was pitch black. But I heard things. Violin scales from Rehearsal Room B, on and on, the whole time — Celeste, of course. And at about ten past nine, someone brushed right past me in the corridor, humming.',
            'They were humming a slow, aching little melody — the very tune Edmund had been rehearsing all week. His “Nocturne”. Note for note.',
          ],
          motive: [
            'Motive? I adored him. And I’ve pledged a small fortune to his gala — why on earth would I harm the man about to make my name immortal?',
            'We may have had a small disagreement about the timing of my pledge. Money is so dreary. It was nothing.',
          ],
          accuse: [
            'How dare you. I spent the blackout clinging to a banister like a frightened hen. Ask the stage manager — he’ll have heard me shrieking for a torch.',
          ],
          suspicion: [
            'Whoever passed me humming that tune, darling. One doesn’t hum a melody one doesn’t know — and nobody knew that piece except Edmund and whoever he’d pinched it from.',
          ],
        },
        about: {
          celeste: [
            'Celeste played scales the entire blackout — I heard every note from Room B, steady as a metronome. She couldn’t have been anywhere else. Poor dear, losing her solo.',
          ],
          rowan: [
            'Rowan was down in the bowels of the building fixing the lights; one heard him clanging about under the floor. Loyal sort. Hopelessly disorganised.',
          ],
          theo: [
            'The young composer? He announced he was going out for air hours before the storm turned vicious. Odd boy — always humming. Edmund was terribly excited about some “rediscovered” piece of his own he meant to premiere at the gala.',
          ],
        },
        topics: [
          { keys: ['hum', 'humming', 'melody', 'tune', 'nocturne', 'music', 'song'],
            replies: ['Unmistakable. Edmund had played it on the green-room piano every day this week — “my Nocturne”, he called it, though in thirty years I’d never heard it before. Whoever passed me was humming it, heading toward the green room.'] },
          { keys: ['corridor', 'passed', 'brushed', 'figure', 'sleeve', 'smell'],
            replies: ['Someone tall. I felt a rough sleeve — corduroy, perhaps — and they smelled of rain, as if they’d just come in from outside. They came from the piano lounge and went toward the green room.'] },
          { keys: ['pledge', 'donation', 'cheque', 'bankrupt', 'broke', 'debt', 'accountant', 'board', 'finances', 'wealth', 'rich', 'telephone', 'phone'],
            replies: [
              'My accountant and I were discussing… arrangements. Do we have to talk about money? It’s so terribly common.',
              'Very well. My accountant called to say my pledge won’t clear. I’m rather less wealthy than my wing suggests. Edmund found out last week and threatened to tell the board. Humiliating — but one doesn’t kill a man over one’s dignity, darling. One sells a villa.',
            ] },
          { keys: ['tea', 'cups', 'tincture', 'bottle', 'cabinet', 'first aid', 'fern', 'lounge'],
            replies: ['Tea? I wouldn’t touch Edmund’s tea. And I wouldn’t know a first-aid cabinet if it bit me — I don’t go backstage, darling. That’s what stage managers are for.'] },
          { keys: ['umbrella', 'rain', 'wet', 'outside', 'pavilion', 'garden'],
            replies: ['I came by car with a driver. My shoes haven’t touched a puddle since 1987.'] },
          { keys: ['blackout', 'dark', 'lights', 'power', 'storm', 'lightning'],
            replies: ['Black as a coal cellar. The lights died at nine — I was mid-sentence and the line went dead too. Even the glass front went dark; the whole hall was a shadow. Rowan had it all back by twenty past.'] },
          { keys: ['solo', 'soloist'],
            replies: ['Edmund did love a little cruelty with his casting. Celeste took the news with remarkable calm — suspiciously calm, if you ask me. Something’s cheering that girl up.'] },
        ],
        fallback: [
          'I’m sure I don’t know, darling.',
          'You’ll have to be clearer, Detective — my nerves are in absolute tatters.',
        ],
      },
      {
        id: 'theo',
        name: 'Theo Marsh',
        role: 'Young composer & assistant',
        emoji: '🎼',
        description: 'Twenty-four, gangly, ink on his fingers and a rust corduroy jacket. Has been copying parts and fetching tea for the maestro all season.',
        personality: 'Earnest and jittery; over-explains when nervous.',
        alibi: 'Claims he walked to the garden pavilion at 8:15 pm without an umbrella and sat there alone until he heard shouting after 10:15 pm, and that the hall’s lights were blazing all evening.',
        secret: 'He wrote the “Nocturne in Grey” that the maestro was about to premiere as his own.',
        knowledge: 'Everything — but he will not say so.',
        aliases: ['theo', 'marsh', 'composer', 'assistant'],
        lines: {
          greet: ['H-hello. Sorry. This is all a bit much. What do you need to know?'],
          alibi: [
            'I went out to the garden pavilion at about quarter past eight to clear my head. I sat there all evening, honestly, just watching the rain on the lake. I didn’t come back until I heard Rowan shouting, after ten.',
            'The pavilion. The whole time. I didn’t even take an umbrella — I got soaked just walking over, which is why I stayed put.',
          ],
          victim: [
            'The maestro gave me my first real job — copying parts, fetching his tea, that sort of thing. He was… a great man. Everyone says so.',
          ],
          saw: [
            'From the pavilion? Only the hall across the lawn — lit up, every window blazing, the whole evening. It looked beautiful in the rain. I didn’t see anybody.',
          ],
          motive: [
            'Why would I hurt him? He was my mentor. Without him I’m just a copyist with an unfinished symphony.',
            'I don’t have a motive, Detective. I barely have a salary.',
          ],
          accuse: [
            'No! I was out in the pavilion the whole time, I told you. I wasn’t even in the building.',
            'I didn’t do anything. You should be asking Mrs Fenwick about her money, not me.',
          ],
          suspicion: [
            'I don’t like to say… but Celeste was furious about losing the solo. And Mrs Fenwick and the maestro were rowing about money all week.',
          ],
        },
        about: {
          celeste: ['Celeste? She was furious about losing the solo. Everyone knows. Really furious. I’m only saying.'],
          rowan: ['Rowan’s all right. He has keys to everything, though, hasn’t he? Every door, every cupboard.'],
          dahlia: ['Mrs Fenwick and the maestro had a row about money on Tuesday — I heard raised voices through the green-room door. You should ask her about that.'],
        },
        topics: [
          { keys: ['locked', 'key', 'keys'],
            replies: ['Locked? I… well, then I sat on the steps. Under the eaves. It’s the same thing, really — I was there.'] },
          { keys: ['pavilion', 'garden', 'gazebo', 'lawn', 'outside', 'bench', 'lake'],
            replies: ['It’s lovely out there. Quiet. I just sat and watched the rain on the lake until I heard shouting.'] },
          { keys: ['umbrella', 'bamboo', 'soaked', 'wet', 'rain'],
            replies: [
              'Umbrella? No, I didn’t have one. I got soaked. That green one could be anyone’s — there’s a whole stand of them by the stage door.',
              'I don’t remember any umbrella. Maybe Rowan’s confused. He’s had a long night.',
            ] },
          { keys: ['blackout', 'power', 'lights', 'dark', 'storm', 'lightning', 'façade', 'facade'],
            replies: ['A blackout? No — the hall was lit up the whole time I was out there. I’d have noticed. Wouldn’t I? Maybe it was only one part of the building.'] },
          { keys: ['nocturne', 'melody', 'tune', 'hum', 'humming', 'composition', 'manuscript', 'piece', 'compose', 'wrote', 'write', 'music', 't.'],
            replies: [
              'The Nocturne in Grey? It’s the maestro’s. A rediscovered work from his youth, he said. It’s… very beautiful.',
              'Fine — yes, I wrote it. Three years of my life. But that doesn’t mean anything. Lots of people hum things.',
            ] },
          { keys: ['tea', 'cups', 'cup', 'kettle', 'tray', 'teacup'],
            replies: ['I usually make his tea, yes. But not tonight. I wasn’t there tonight. I was in the pavilion.'] },
          { keys: ['cabinet', 'first aid', 'tincture', 'bottle', 'medicine', 'sleeping', 'fern', 'lounge'],
            replies: ['The first-aid cabinet? I don’t even know where it is. Why would I?'] },
          { keys: ['jacket', 'corduroy', 'sleeve', 'clothes'],
            replies: ['This old thing? I wear it every day. Yes, it’s damp — I told you, I got rained on walking to the pavilion.'] },
          { keys: ['diary'],
            replies: ['“Tell T. tonight”? Could be anyone. Tobias in the brass section. Or the piano tuner — his name’s… something with a T, probably.'] },
        ],
        fallback: [
          'Sorry — sorry, what was the question?',
          'I don’t really know anything about that. I was outside all night.',
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── 2 ──
  {
    key: 'gullcrest',
    title: 'The Lamp on Gullcrest Point',
    setting: 'Gullcrest, a tiny tidal island whose causeway disappears under the sea every night',
    victim: 'Harriet Quill, the island’s retired lighthouse keeper, who was finishing a tell-all memoir',
    victimAliases: ['harriet', 'quill', 'keeper', 'victim', 'aunt'],
    intro:
      'Every night the causeway to Gullcrest Island vanishes under the tide, leaving its handful of residents alone with the gulls. ' +
      'This morning Harriet Quill, the old lighthouse keeper, was found at the foot of the lighthouse’s spiral stairs. She fell — or was pushed — at around eleven last night. ' +
      'The final chapter of her memoir, the one she promised would “set this island straight”, is missing. Nobody could have left the island or reached it during the night. The answer is here.',
    clues: [
      'Harbour tide table: the causeway was under water from 9:00 pm last night until 3:00 am. The sea was too rough for any boat to leave the harbour.',
      'Fragments of green lantern glass glittered on the top landing of the lighthouse stairs.',
      'In the keeper’s room, a pot of cocoa and two cups were set out — Harriet was expecting a visitor.',
      'The memoir’s contents page lists “Chapter 12: Borrowed Names”. Those pages are gone.',
    ],
    culpritId: 'lyle',
    motive:
      'Chapter 12 revealed that “Dr” Ambrose Lyle never qualified as a doctor — he had practised on the island for twenty years under a dead classmate’s diploma.',
    method:
      'After Marguerite’s 10:15 pm phone call gave him a pretext, Lyle walked to the lighthouse with his green-glass lantern. Harriet confronted him over cocoa at the top of the tower; ' +
      'he pushed her on the stairs, smashing his lantern, snatched Chapter 12 and hurried home in the dark.',
    explanation:
      'Dr Lyle claimed he was at a dinner on the mainland until midnight and then drove home across the causeway — impossible, because the causeway was under water from 9 pm until 3 am. ' +
      'Marguerite reached him on his own island telephone at 10:15 pm, Finn saw his car outside his house at 9:30 and photographed a green light climbing the tower at 10:40, ' +
      'and Nell saw his green-glass lantern on the cliff path. The broken green glass on the top landing came from the lantern he claims to have “mislaid”.',
    suspects: [
      {
        id: 'nell',
        name: 'Nell Harrow',
        role: 'Fisherwoman & neighbour',
        emoji: '🎣',
        description: 'Weathered, blunt and up before dawn. Her late father and Harriet were bitter rivals for forty years.',
        personality: 'Terse, suspicious of outsiders, honest once cornered.',
        alibi: 'Claims she mended nets in her shed and went to bed at ten; really she was on the cliff path at 10:30 pm.',
        secret: 'She poaches lobsters from the protected cove at night — that is why she was on the cliff path.',
        knowledge: 'Around 10:30 pm she saw a green-glowing lantern — Dr Lyle’s, the only green-glass lantern on the island — heading up toward the lighthouse.',
        aliases: ['nell', 'harrow', 'fisherwoman', 'fisher', 'neighbour', 'neighbor'],
        lines: {
          greet: ['Hm. You’re the detective. Say what you’ve come to say — tide waits for no one.'],
          alibi: [
            'Mending nets in my shed. Went to bed at ten. Slept like a stone.',
            'All right. I wasn’t in bed. I was out on the cliff path about half ten. Don’t ask me why.',
          ],
          victim: [
            'Harriet and my father fought for forty years over who ran this island. I inherited the feud with the boat. Doesn’t mean I wanted her dead. She was part of the scenery. Island’s quieter without her — I don’t like it.',
          ],
          saw: [
            'Saw nothing from my bed, did I?',
            'Fine. Half ten, on the cliff path, I saw a lantern bobbing up the track to the lighthouse. Glowing green. There’s only one green lantern on Gullcrest — the doctor’s. His old dad’s, green glass.',
          ],
          motive: [
            'Because she was writing about my father in that book of hers? Calling him a smuggler? He was. Everyone knows. Can’t libel the dead, and I don’t care what she wrote.',
          ],
          accuse: [
            'If I wanted Harriet gone I’d have had forty years to do it. I was nowhere near the tower.',
          ],
          suspicion: [
            'Ask yourself who was walking up to that lighthouse with a green lantern at half ten. It wasn’t me, and it wasn’t a ghost.',
          ],
        },
        about: {
          lyle: [
            'The doctor carries that green-glass lantern on his night rounds — you can spot it a mile off. Saw it heading up to the lighthouse last night, half ten, plain as a buoy.',
          ],
          finn: [
            'The “photographer”. Two weeks here and I’ve not seen him point a camera at a single bird. Points it at windows, mostly. Asks about Harriet’s book in every conversation.',
          ],
          marguerite: [
            'Marguerite’s a soft one. Moved here to nurse her aunt and gets nothing but grief for it. Though I’ve seen her loading parcels onto the morning ferry a lot lately. Heavy ones.',
          ],
        },
        topics: [
          { keys: ['lobster', 'pots', 'cove', 'poach', 'fishing', 'why were you', 'what were you doing', 'cliff', 'path', 'out there'],
            replies: [
              'I was on the cliff path. That’s all you need to know.',
              'Lobster pots. In the protected cove. There — happy? It’s the only decent catch left round here. I’ll pay the fine. But I didn’t go near the lighthouse, and I know what I saw on the track.',
            ] },
          { keys: ['lantern', 'lamp', 'green', 'glass', 'light'],
            replies: ['Green glass lantern. The doctor’s — he got it from his father. Only one like it on Gullcrest. It was moving up the track toward the lighthouse at half ten.'] },
          { keys: ['tide', 'causeway', 'flood', 'boat', 'mainland', 'ferry'],
            replies: ['Causeway went under at nine last night, same as the table says. Nobody crossed till three in the morning — and no boat went out either, not in that swell. Whoever was on the island at nine was stuck here.'] },
          { keys: ['memoir', 'book', 'chapter', 'manuscript', 'smuggl'],
            replies: ['Harriet bragged at the pub that chapter twelve would “make a certain somebody pack his bags”. She didn’t say who. Wasn’t about my dad — she’d done him in chapter three.'] },
          { keys: ['cocoa', 'cups', 'visitor'],
            replies: ['Harriet only made cocoa for company she wanted to have a proper talk with. Two cups means she invited someone up.'] },
          { keys: ['nets', 'shed', 'bed', 'sleep'],
            replies: ['Nets don’t mend themselves. Neither does a reputation.'] },
        ],
        fallback: [
          'Don’t know. Don’t care. Next.',
          'Ask me about the island, the tide or who goes where at night. That I know.',
        ],
      },
      {
        id: 'lyle',
        name: 'Dr Ambrose Lyle',
        role: 'Island doctor',
        emoji: '🩺',
        description: 'Kindly and silver-haired, the island’s only doctor for twenty years. Rarely seen without his bag — or his lantern.',
        personality: 'Warm, reassuring, condescending when pushed; never admits uncertainty.',
        alibi: 'Claims he was at a medical society dinner on the mainland until about midnight, then drove back across the causeway and went straight to bed.',
        secret: 'He never qualified as a doctor; his diploma is a dead classmate’s.',
        knowledge: 'Everything — but he will not say so.',
        aliases: ['lyle', 'ambrose', 'doctor', 'dr', 'doc', 'physician'],
        lines: {
          greet: ['Detective. A sad morning for Gullcrest. How can I help?'],
          alibi: [
            'I was on the mainland last night — the Coastal Medical Society dinner at the Anchor Hotel. Dreadful speeches. I drove back across the causeway around midnight and went straight to bed. I only heard about Harriet when Marguerite came banging on my door this morning.',
            'Midnight, give or take. The road was clear, the causeway was fine. I was tired, Detective — I wasn’t taking notes.',
          ],
          victim: [
            'Harriet was my patient for twenty years. Stubborn as granite, sharp as a fish hook. A terrible loss for the island.',
          ],
          saw: ['I saw nothing, Detective. I wasn’t here.'],
          motive: [
            'I’m a doctor. I’ve spent twenty years keeping people alive on this rock. What possible reason could I have?',
          ],
          accuse: [
            'That’s absurd. I was twenty miles away eating overcooked salmon. Ask anyone at the Anchor Hotel.',
            'I won’t dignify that. I was not on the island when Harriet fell.',
          ],
          suspicion: [
            'I don’t like to point fingers, but Marguerite inherits everything, and she’s been short of money for a long while. And Nell Harrow is always out on those cliffs at night.',
          ],
        },
        about: {
          nell: ['Nell and Harriet hated each other — or rather Nell’s father and Harriet did, and Nell inherited the grudge with the boat. Ask her why she’s always out on the cliffs at night.'],
          finn: ['The photographer turned up a fortnight ago asking everyone about Harriet’s book. Calls himself a nature photographer. I’ve yet to see him photograph a bird.'],
          marguerite: ['Marguerite inherits the cottage, the lighthouse lease, everything. I don’t like to say it, but she’s been short of money for a long while.'],
        },
        topics: [
          { keys: ['tide', 'causeway', 'flood', 'water', 'drove', 'drive', 'car', 'crossed', 'cross'],
            replies: [
              'The tide? Well — it was low enough. I’ve driven that causeway for twenty years; I know when it’s passable.',
              'Perhaps it was a little later than midnight. Or earlier. Does it really matter? I was not on the island when Harriet fell.',
            ] },
          { keys: ['phone', 'call', 'telephone', 'rang', 'ring', 'marguerite called'],
            replies: ['A telephone call? Nobody could have reached me last night — I was at the dinner. I told you.'] },
          { keys: ['lantern', 'lamp', 'green', 'glass'],
            replies: [
              'Yes, I carry a lantern on my rounds. Green glass — it was my father’s. I seem to have mislaid it. It’s probably in the car.',
              'Plenty of glass on an island, Detective. Bottles, floats, sea glass. I wouldn’t read much into a few green shards.',
            ] },
          { keys: ['memoir', 'book', 'chapter', 'manuscript', 'borrowed names', 'pages'],
            replies: ['Her memoir? Old feuds and smuggling stories, mostly. I can’t imagine there was anything in it about me.'] },
          { keys: ['diploma', 'certificate', 'qualif', 'degree', 'medical school', 'university', 'licen', 'training', 'trained'],
            replies: ['My diploma hangs in my surgery for anyone to see. I don’t care for the insinuation, Detective.'] },
          { keys: ['cocoa', 'cups', 'visitor', 'expecting'],
            replies: ['Harriet drank cocoa every night of her life. Who she shared it with, I really couldn’t say.'] },
          { keys: ['dinner', 'anchor', 'hotel', 'society', 'salmon', 'speech'],
            replies: ['The Anchor Hotel, mainland side. Twelve doctors, one microphone and far too much port. I left around half eleven.'] },
          { keys: ['stairs', 'fall', 'fell', 'pushed', 'push', 'injur', 'time of death'],
            replies: ['From what I saw this morning, she fell around eleven. Those stairs are treacherous — I warned her a dozen times.'] },
        ],
        fallback: [
          'I’m afraid I can’t help with that, Detective.',
          'Doctor–patient confidentiality, I’m afraid. Ask me something else.',
        ],
      },
      {
        id: 'finn',
        name: 'Finn Calloway',
        role: 'Visiting photographer',
        emoji: '📸',
        description: 'Arrived two weeks ago with three cameras, a tripod and a lot of questions about Harriet’s memoir.',
        personality: 'Charming and fast-talking; turns everything into a story.',
        alibi: 'Ran a long-exposure shot of the lighthouse from the dunes between 10:30 and 11:15 pm, then went back to the guesthouse.',
        secret: 'He is really a tabloid reporter hoping to get an advance copy of the memoir.',
        knowledge: 'At 9:30 pm he saw Dr Lyle’s car parked outside the doctor’s house. His time-stamped long exposure shows a green light climbing the tower windows at about 10:40 and hurrying down at about 11:00.',
        aliases: ['finn', 'calloway', 'photographer', 'reporter', 'journalist'],
        lines: {
          greet: ['Detective! Finn Calloway. Terrible business. I’ll help however I can — I notice things, it’s the job.'],
          alibi: [
            'I was on the dunes from half ten to quarter past eleven with my tripod, shooting a long exposure of the lighthouse against the stars. Then back to the guesthouse for a nightcap.',
          ],
          victim: [
            'Harriet? Fabulous woman. Sharp as a tack. I was hoping to… photograph her for a feature. She kept telling me to wait for the book.',
          ],
          saw: [
            'Funny you ask. Walking to the dunes at half nine I passed the doctor’s house — his car was parked right outside, bonnet cold, lights on upstairs.',
            'And my long exposure caught something. Around 10:40 a green light climbs the tower windows, stops at the top, then comes down fast around eleven. The timestamps are all in the camera.',
          ],
          motive: [
            'I’m a visitor. Harriet was my best story — er, subject. She was worth far more to me alive.',
          ],
          accuse: [
            'Me? I was half a mile away behind a tripod, and I’ve got forty-five minutes of timestamped exposure to prove it.',
          ],
          suspicion: [
            'Follow the green light, Detective. Someone carried it up that tower at 10:40 and came down in a hurry. My money’s on whoever owns a green lantern.',
          ],
        },
        about: {
          nell: ['The fisherwoman? Out at all hours. I saw a torch on the cliff path around half ten — plain white, moving toward the cove, not the tower. That’d be her.'],
          lyle: [
            'The doctor told everyone he’d be on the mainland last night. But his car was parked outside his house at half nine — after the causeway had already gone under. I photographed it, actually. Habit.',
          ],
          marguerite: ['The niece? Nervy. Sells antique brass on the internet under a fake name — I recognised a sextant from Harriet’s mantelpiece in a listing. Not that I’m judging.'],
        },
        topics: [
          { keys: ['photo', 'picture', 'camera', 'exposure', 'shot', 'image', 'timestamp', 'star'],
            replies: ['Long exposure, 10:30 to 11:15. Star trails, the tower, and — here — a faint green light moving up the stair windows at 10:40, pausing at the top, racing back down about eleven. Timestamped in camera.'] },
          { keys: ['car', 'drove', 'parked', 'house'],
            replies: ['The doctor’s car was outside his house at half nine. Bonnet cold. I walked right past it. Funny — I heard him tell the pub he’d be at a dinner on the mainland all evening.'] },
          { keys: ['reporter', 'journalist', 'tabloid', 'newspaper', 'press', 'really a', 'birds', 'nature', 'scoop', 'story', 'job'],
            replies: [
              'Nature photographer, freelance. Birds, coastlines, that sort of thing.',
              'Fine — I write for the Weekly Lantern. Harriet’s memoir is the scoop of the year and I wanted an early look. That’s not a crime. Well — not much of one.',
            ] },
          { keys: ['memoir', 'book', 'chapter', 'manuscript', 'borrowed names'],
            replies: ['Harriet told me chapter twelve was about “a man who wears another man’s name on his wall”. Wouldn’t say who. I’d have given my tripod to read it.'] },
          { keys: ['tide', 'causeway', 'flood', 'boat', 'mainland'],
            replies: ['Causeway was underwater by nine — I watched it go. Nobody drove across it after that, not unless they’ve got a submarine.'] },
          { keys: ['lantern', 'lamp', 'green', 'glass', 'light'],
            replies: ['That green light in my picture is a lantern with green glass, has to be. Normal torches come out white.'] },
        ],
        fallback: [
          'Not my area, Detective — but ask me about anything I saw. I see a lot.',
          'Ha. Good question. No idea.',
        ],
      },
      {
        id: 'marguerite',
        name: 'Marguerite Holloway',
        role: 'Harriet’s niece & heir',
        emoji: '🧶',
        description: 'Soft-spoken, moved to the island last year to look after her aunt. Stands to inherit the cottage and the lighthouse lease.',
        personality: 'Gentle, anxious, guilt-ridden.',
        alibi: 'Home in her cottage knitting all evening; telephoned Dr Lyle at 10:15 pm about Harriet’s cough; fell asleep around eleven.',
        secret: 'She has been quietly selling Harriet’s antique brass navigation instruments to pay her debts.',
        knowledge: 'At 10:15 pm she telephoned Dr Lyle at his house on the island. He answered and said he would “look in on Harriet”.',
        aliases: ['marguerite', 'holloway', 'niece', 'heir'],
        lines: {
          greet: ['Oh — hello. Sorry. I haven’t slept. Please, ask whatever you need.'],
          alibi: [
            'I was home in the cottage all evening, knitting. Auntie had a nasty cough at supper, so at about quarter past ten I telephoned Dr Lyle. Then I must have dozed off in my chair around eleven.',
          ],
          victim: [
            'Auntie Harriet raised me every summer when I was small. She was fierce and funny and impossible. I moved here to look after her. I should have gone up there myself last night.',
          ],
          saw: [
            'I didn’t see anything — the curtains were drawn. But I spoke to Dr Lyle on the telephone at quarter past ten. He was at home; he said he’d look in on Auntie on his way past.',
          ],
          motive: [
            'People think I wanted the cottage. I’d give it all back to have her bickering at me over breakfast.',
          ],
          accuse: [
            'No. Never. I loved her. I was in my chair with my knitting — I didn’t even wake when the dog barked.',
          ],
          suspicion: [
            'I don’t understand it. Dr Lyle said he’d look in on her… did he not go? If he went up there, he must have seen something.',
          ],
        },
        about: {
          nell: ['Nell is gruff, but she brought Auntie fish every Friday even while they were feuding. I don’t believe she’d hurt her.'],
          lyle: [
            'Dr Lyle was so kind on the phone. I rang his house at quarter past ten and he picked up straight away — he said he’d pop over to Auntie with his lantern, since it was on his way.',
          ],
          finn: ['Mr Calloway keeps asking me if Auntie left the manuscript to me. It makes me uncomfortable.'],
        },
        topics: [
          { keys: ['phone', 'call', 'telephone', 'rang', 'ring', 'cough'],
            replies: ['I rang Dr Lyle at home at quarter past ten — the island line, not his mobile. He answered on the second ring and said he’d look in on Auntie on his way past. I felt so relieved.'] },
          { keys: ['brass', 'instrument', 'sextant', 'sell', 'selling', 'sold', 'parcel', 'listing', 'antique', 'debt', 'owe'],
            replies: [
              'Auntie’s things? They’re… in storage. Some of them.',
              'I sold some of her old brass instruments. A sextant, two compasses. I have debts from before I came here and I was ashamed to tell her. I was going to buy them back. I was — I was going to tell her.',
            ] },
          { keys: ['inherit', 'will', 'cottage', 'lease'],
            replies: ['Yes, she left me the cottage and the lighthouse lease. She told me so herself. I never asked for it.'] },
          { keys: ['memoir', 'book', 'chapter', 'manuscript'],
            replies: ['Auntie said chapter twelve would “clear out a cupboard that’s been locked for twenty years”. She was nervous about it — she asked me to post the manuscript to her publisher this morning.'] },
          { keys: ['cocoa', 'cups', 'visitor'],
            replies: ['Two cups? She must have been expecting someone. I didn’t go up. Oh — I should have gone up.'] },
          { keys: ['tide', 'causeway', 'mainland', 'dinner'],
            replies: ['A dinner on the mainland? Dr Lyle didn’t mention any dinner. And the causeway goes under at nine — he couldn’t have been over there and answered his phone here at quarter past ten.'] },
          { keys: ['lantern', 'lamp', 'green'],
            replies: ['Dr Lyle always carries his father’s green lantern at night. Auntie used to tease him that he looked like a ship’s starboard light.'] },
        ],
        fallback: [
          'I’m sorry, I don’t know. My head is all fog.',
          'Could you ask that a different way? I want to help, I really do.',
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────── 3 ──
  {
    key: 'brindlewood',
    title: 'Stopped at 8:52',
    setting: 'The Brindlewood Museum of Timekeeping, during its glittering midsummer gala',
    victim: 'Augustus Penhallow, the museum’s exacting director',
    victimAliases: ['augustus', 'penhallow', 'director', 'victim'],
    intro:
      'At the Brindlewood Museum of Timekeeping every clock is wound, checked and polished daily — so when the Great Clock in the tower froze in the middle of the midsummer gala, people noticed. ' +
      'At 9:30 pm the master restorer climbed to the tower workshop to see why, and found director Augustus Penhallow lying beneath the mechanism, struck down with a heavy brass gear. ' +
      'Four people had business with the director tonight. One of them has a story that doesn’t keep time.',
    clues: [
      'The Great Clock’s hands froze at 8:52 pm. A shred of midnight-blue velvet was caught in its gear train.',
      'The tower workshop is always locked. There was no sign of forced entry — the door had been opened with a key.',
      'On the director’s desk: an envelope addressed to the Board, marked “To be read at the gala, 9:30 pm”. It had been torn open and emptied.',
      'A catalogue labelled “Tower inventory — urgent” lay abandoned halfway up the tower stairs.',
    ],
    culpritId: 'silas',
    motive:
      'For years Silas had been swapping museum treasures for clever replicas and selling the originals. Penhallow had discovered it and planned to expose him to the Board at 9:30 pm.',
    method:
      'Silas borrowed Ines’s workshop key that morning on a pretext, lured Penhallow to the tower at 8:50 to “discuss a donation”, and struck him with a brass gear during their argument. ' +
      'Fleeing, he tore his velvet sleeve in the gears and jammed the Great Clock at 8:52. He emptied the Board envelope, met Priya on the stairs, and returned the key to Ines at 9:05.',
    explanation:
      'Silas said he spent 8:30 to 9:15 on the terrace and watched the Great Clock show nine o’clock exactly — but the clock had frozen at 8:52, and Bart locked the terrace doors at 8:30 because of the rain. ' +
      'Priya met Silas hurrying down the tower stairs at 8:55 clutching his sleeve, Ines says he returned her workshop key at 9:05, and the midnight-blue velvet in the gears matches the jacket he wore all night.',
    suspects: [
      {
        id: 'ines',
        name: 'Ines Castellano',
        role: 'Master clock restorer',
        emoji: '⌚',
        description: 'Twenty years restoring the museum’s clocks. The director had just announced plans to outsource her department.',
        personality: 'Precise, proud, dry humour; hates sloppiness.',
        alibi: 'Demonstrated the brass orrery to a crowd of guests in the East Hall from 8:30 to 9:15 pm.',
        secret: 'She has been taking spare clock parts home to build her own astronomical clock.',
        knowledge: 'That morning she lent her tower workshop key to Silas Wren, who wanted to “admire the mechanism”. He returned it to her in the East Hall at 9:05 pm, out of breath. She also suspects the museum’s 1720 Harwood carriage clock is a modern replica.',
        aliases: ['ines', 'castellano', 'restorer', 'clockmaker'],
        lines: {
          greet: ['Detective. Let’s be efficient — I’ve had a long night, and I’m the one who found him.'],
          alibi: [
            'East Hall, from half eight to quarter past nine, demonstrating the orrery. Forty guests watched me wind planets for forty-five minutes. Ask any of them.',
          ],
          victim: [
            'Augustus was a pedant, and so am I. We got along like two gears with the same tooth count — grinding. He wanted to outsource my workshop. Still, he loved these clocks. I’ll give him that.',
          ],
          saw: [
            'At 9:30 I noticed the Great Clock’s ticking was gone — you can hear it everywhere in this building. I went up to the tower and found him. The hands were stopped at 8:52.',
            'And at five past nine, in the middle of my demonstration, Silas Wren pushed through the crowd, out of breath, and handed me back my workshop key. I’d lent it to him that morning.',
          ],
          motive: [
            'Yes, he was outsourcing my department. Do you know how many restorers are hired after outsourcing? None. But a dead director doesn’t un-sign a contract. I’m not stupid.',
          ],
          accuse: [
            'I was in front of forty witnesses spinning Saturn. If you think I can strike a man in the tower from the East Hall, you’ve been reading too much fiction.',
          ],
          suspicion: [
            'Ask who had my workshop key tonight. I lent it to exactly one person.',
          ],
        },
        about: {
          silas: [
            'Silas Wren. Collector, board member, connoisseur — so he says. This morning he asked to borrow my workshop key to “admire the Great Clock’s mechanism”. He gave it back at five past nine in the East Hall, breathing hard.',
            'And between us — the 1720 Harwood carriage clock he “restored” for us last year is a replica. Good one. I noticed months ago and said nothing. More fool me.',
          ],
          bart: ['The caterer. Loud, jolly, and his éclairs are excellent. The director was refusing to pay him, I heard. Bart was red in the face about it all week.'],
          priya: ['Priya is the cleverest person in this building and Augustus put his name on her research. She has every reason to resent him. She also doesn’t have a violent bone in her body.'],
        },
        topics: [
          { keys: ['key', 'keys', 'lent', 'borrow', 'workshop key', 'lock', 'locked', 'forced'],
            replies: ['There are two workshop keys: the director’s and mine. I lent mine to Silas Wren this morning — he said he wanted to admire the mechanism. He returned it to me at five past nine in the East Hall, out of breath.'] },
          { keys: ['clock', 'great clock', '8:52', 'stopped', 'froze', 'gear', 'gears', 'mechanism', 'tick'],
            replies: ['The Great Clock stopped at 8:52 — something jammed the gear train. A shred of dark blue velvet, caught in the escapement wheel. Hasn’t moved since. It did not show nine o’clock tonight, I promise you that.'] },
          { keys: ['velvet', 'blue', 'jacket', 'fabric', 'sleeve', 'cloth'],
            replies: ['Midnight-blue velvet. The only person wearing velvet tonight was Silas Wren. Most of us were in black, or flour.'] },
          { keys: ['replica', 'fake', 'forg', 'harwood', 'carriage clock', 'collection', 'swap'],
            replies: ['The Harwood carriage clock in Gallery Two is a replica. The patina’s chemical, the screws are machine-cut. Silas “restored” it for us last year. I suspect Augustus worked that out too.'] },
          { keys: ['parts', 'take home', 'taking', 'steal', 'own clock', 'astronomical', 'home'],
            replies: [
              'Parts? Restorers always have parts about. Occupational hazard.',
              'Fine. I’ve been taking spare wheels and springs home to finish my own astronomical clock. Scrap, mostly. Augustus would have called it theft. It’s not why he’s dead.',
            ] },
          { keys: ['outsourc', 'contract', 'job', 'fired', 'department'],
            replies: ['He signed with an outsourcing firm last month. My workshop closes in autumn. Killing him doesn’t change a signed contract — but I’d have loved to see his face when the first outsourced repair came back wrong.'] },
          { keys: ['envelope', 'board', '9:30', 'announcement'],
            replies: ['Augustus told me he had “an announcement that would rattle a display case or two”. He looked right at Silas when he said it.'] },
          { keys: ['orrery', 'east hall', 'demonstration', 'guests'],
            replies: ['The brass orrery. Six planets, forty guests, forty-five minutes. Silas interrupted at five past nine to hand me my key, and Priya came through at quarter past looking white as a sheet.'] },
        ],
        fallback: [
          'Imprecise question. Try again.',
          'I fix clocks, Detective. Ask me about clocks, keys or who was where.',
        ],
      },
      {
        id: 'silas',
        name: 'Silas Wren',
        role: 'Collector & board member',
        emoji: '🎩',
        description: 'Silver-tongued, in a midnight-blue velvet jacket. Owns the finest private clock collection in the county and trades pieces with the museum.',
        personality: 'Urbane, amused, condescending; pivots to flattery when cornered.',
        alibi: 'Claims he was on the east terrace from 8:30 to 9:15 pm with a cigar, and looked up at the Great Clock as it showed exactly nine o’clock.',
        secret: 'He has been swapping museum pieces for replicas and selling the originals.',
        knowledge: 'Everything — but he will not say so.',
        aliases: ['silas', 'wren', 'collector', 'board member'],
        lines: {
          greet: ['Detective — what a pleasure, despite the circumstances. Silas Wren. Do ask away.'],
          alibi: [
            'The terrace, Detective. I stepped out at half past eight for a cigar and stayed until about quarter past nine. Glorious view of the Great Clock — I remember looking up as it showed nine o’clock exactly and thinking what a splendid mechanism it is.',
            'Terrace. Cigar. Nine o’clock on the Great Clock. I’m a collector; I notice clocks.',
          ],
          victim: [
            'Augustus and I sat on the board together for ten years. We disagreed often — he lacked vision — but I respected him enormously.',
          ],
          saw: [
            'From the terrace? Rain, roses and the Great Clock reading nine. Nothing sinister, I’m afraid.',
          ],
          motive: [
            'I am the museum’s most generous lender. Augustus was my friend. I had every reason to keep him healthy.',
          ],
          accuse: [
            'My dear Detective. I was on the terrace with a cigar. You’ll find the ash, if the rain hasn’t taken it.',
            'Charming theory. Entirely wrong.',
          ],
          suspicion: [
            'I wouldn’t want to cast aspersions… but Ines was losing her job, and our little archivist was rather bitter about whose name went on her research.',
          ],
        },
        about: {
          ines: ['Ines? Gifted, prickly, and about to be outsourced. Augustus told me she took it very badly. One does wonder.'],
          bart: ['The caterer? Unpaid invoices, raised voices. Augustus refused to pay for what he called “sparkling vinegar”. Bart threatened him in front of the whole kitchen.'],
          priya: ['A clever girl. Augustus published her research under his own name. If I were her, I’d have been furious.'],
        },
        topics: [
          { keys: ['rain', 'terrace door', 'doors', 'locked', 'lock', 'wet', 'awning'],
            replies: [
              'Rain? A little drizzle. I stood under the awning. Locked? Not that I noticed — I came and went as I pleased.',
              'Perhaps I stood just inside the doors, then. Admiring the view through the glass. The point stands.',
            ] },
          { keys: ['clock', 'great clock', 'nine', '8:52', 'stopped', 'froze', 'time'],
            replies: [
              'I tell you, it showed nine. I notice clocks — it’s my passion.',
              'Perhaps it stopped after I looked. These old movements are temperamental. I can hardly be expected to keep watch on it.',
            ] },
          { keys: ['key', 'keys', 'workshop key', 'borrow', 'lent'],
            replies: [
              'Ines’s key? Why would I have— oh. Yes. I may have borrowed it this morning to admire the mechanism. I returned it long before the gala.',
              'Before the gala, after the gala — I returned it. I can’t be expected to remember every trivial errand.',
            ] },
          { keys: ['velvet', 'jacket', 'sleeve', 'torn', 'tear', 'blue', 'cloth'],
            replies: ['This jacket? Tailored in Milan. A small tear — the terrace railing caught it. Do you have an interest in tailoring, Detective?'] },
          { keys: ['stairs', 'tower', 'wrong turn', 'cloakroom', 'workshop'],
            replies: ['I went nowhere near the tower tonight. Why would I? I was on the terrace.'] },
          { keys: ['envelope', 'board', '9:30', 'announcement'],
            replies: ['Augustus loved his little announcements. Budget reshuffles, mostly. I haven’t the faintest idea what this one concerned.'] },
          { keys: ['replica', 'fake', 'forg', 'harwood', 'carriage clock', 'collection', 'sell', 'swap', 'auction'],
            replies: ['Replicas? Every museum shows a few for conservation reasons. I do hope you’re not insinuating anything, Detective. My lawyers are terribly bored.'] },
          { keys: ['cigar', 'smoke', 'ash'],
            replies: ['A Havana — well, a very good one. I always step out for a cigar at a gala. One needs air after an hour of small talk.'] },
        ],
        fallback: [
          'What a curious question. I couldn’t say.',
          'Detective, I’m a simple collector. Ask me about clocks — I could talk all night.',
        ],
      },
      {
        id: 'bart',
        name: 'Bartholomew Gage',
        role: 'Gala caterer',
        emoji: '🍰',
        description: 'Jolly, flour-dusted, loud. The director refused to pay his last invoice and threatened to ruin his reputation.',
        personality: 'Cheerful, gossipy, gets defensive about his food and wine.',
        alibi: 'In the kitchen all evening piping éclairs; locked the terrace doors at 8:30 pm when the rain started; Priya came in for coffee at 8:40.',
        secret: 'He served cheap sparkling wine instead of the vintage champagne the museum paid for, and pocketed the difference.',
        knowledge: 'He locked the terrace doors at 8:30 and kept the key in his apron — nobody went out after. At 8:20 Silas asked him twice when the director would be up in his workshop. Silas wore a midnight-blue velvet jacket.',
        aliases: ['bart', 'bartholomew', 'gage', 'caterer', 'chef', 'cook'],
        lines: {
          greet: ['Detective! Éclair? No? Your loss. Fire away, I’m an open book — mostly recipes.'],
          alibi: [
            'Kitchen, all night, piping éclairs — three hundred of the little beggars. At half eight the rain came in sideways so I locked the terrace doors and pocketed the key. Priya popped in for coffee about twenty to nine.',
          ],
          victim: [
            'Penhallow? Owed me four thousand for the spring gala and called my wine “sparkling vinegar” in front of the whole board. I didn’t like him. But I cater funerals too, and I’d rather not do his.',
          ],
          saw: [
            'At twenty past eight Mr Wren came into my kitchen and asked — twice — what time the director would be up in his tower workshop. Odd thing for a guest to care about.',
            'And nobody used the terrace after half eight. I had the key in my apron. Those doors stayed shut till the police opened them.',
          ],
          motive: [
            'Unpaid invoice, sure. But you don’t get paid by a dead man, Detective. I wanted him alive and writing cheques.',
          ],
          accuse: [
            'I had a piping bag in each hand from eight till half nine. Hard to bash anyone with an éclair.',
          ],
          suspicion: [
            'Whoever was so very interested in when the director would be alone in his workshop. I can name him for you, but I bet you can too.',
          ],
        },
        about: {
          ines: ['Ines was spinning those brass planets in the East Hall all evening — I could hear the applause from my kitchen every few minutes.'],
          silas: [
            'Mr Wren? Fancy fellow in midnight-blue velvet. Came into my kitchen at twenty past eight asking — twice — when the director would be up in the tower workshop. Then he went off toward the stairs, not the terrace.',
          ],
          priya: ['Priya came in for coffee at twenty to nine, said she was taking a catalogue up to the director. Came back through about ten past nine looking like she’d seen a ghost.'],
        },
        topics: [
          { keys: ['terrace', 'doors', 'door', 'locked', 'lock', 'rain', 'key', 'keys', 'awning'],
            replies: ['I locked the terrace doors at half eight on the dot — wind was blowing rain straight onto my canapés. Key went in my apron. Nobody was out there after that, and nobody came in from there either.'] },
          { keys: ['velvet', 'jacket', 'blue', 'sleeve'],
            replies: ['Midnight-blue velvet jacket — Mr Wren’s. You couldn’t miss it. Only bit of velvet in the building, unless you count my tiramisu.'] },
          { keys: ['wine', 'champagne', 'vinegar', 'sparkling', 'bubbly', 'invoice', 'pocket', 'profit'],
            replies: [
              'The wine? Excellent vintage. Very… sparkling.',
              'All right, all right. The museum paid for vintage champagne and I served a decent cava. Pocketed the difference. That’s what the invoice row was about. It’s fraud, I know — it’s not murder.',
            ] },
          { keys: ['coffee', 'kitchen', 'eclair', 'éclair', 'pastry', 'food'],
            replies: ['Three hundred éclairs, two hundred tartlets, and a coffee for Priya at twenty to nine. The kitchen was my whole world tonight.'] },
          { keys: ['clock', 'great clock', 'time', 'nine', 'stopped'],
            replies: ['I noticed the tower went quiet sometime before nine — you get used to that tick, like a heartbeat. Thought it was the rain drowning it out.'] },
          { keys: ['stairs', 'tower', 'workshop'],
            replies: ['From my kitchen door you can see the bottom of the tower stairs. Mr Wren headed that way after he spoke to me. Priya went up later with her catalogue.'] },
        ],
        fallback: [
          'No idea, Detective. Ask me about food, wine, or who went through my kitchen.',
          'Hmm. That one’s above my pay grade — which, given I’m not being paid, is low.',
        ],
      },
      {
        id: 'priya',
        name: 'Priya Raman',
        role: 'Junior archivist',
        emoji: '🗂️',
        description: 'Brilliant and overworked. The director recently presented her research on medieval water clocks as his own.',
        personality: 'Quiet, precise, nervous but observant.',
        alibi: 'In the archive until 8:40 pm, fetched coffee from the kitchen, then climbed the tower stairs at about 8:55 pm with a catalogue for the director.',
        secret: 'She has been copying archive files to take to an interview at a rival museum.',
        knowledge: 'On the tower stairs at about 8:55 she met Silas Wren hurrying down, clutching his left sleeve; he claimed he had “taken a wrong turn looking for the cloakroom”. She noticed the Great Clock had gone silent, got frightened, dropped the catalogue and left.',
        aliases: ['priya', 'raman', 'archivist'],
        lines: {
          greet: ['Hello, Detective. I’ll try to be accurate. I’m an archivist — it’s a habit.'],
          alibi: [
            'I was in the archive until 8:40, got a coffee from Bart in the kitchen, then at about 8:55 I took the tower inventory catalogue up to Dr Penhallow — he’d asked for it urgently.',
            'I never reached his workshop. I got halfway up the stairs and… something felt wrong. I left the catalogue on the step and went back down.',
          ],
          victim: [
            'He was my boss. He presented my water-clock research at the conference as his own work. I was angry. I still am. But I wanted credit, not… this.',
          ],
          saw: [
            'On the tower stairs at 8:55, Mr Wren came hurrying down past me, holding his left sleeve. He said he’d “taken a wrong turn looking for the cloakroom”. The cloakroom is on the ground floor, by the entrance.',
            'And the tower was silent. The Great Clock always ticks so loudly on those stairs. That’s why I got frightened and dropped the catalogue.',
          ],
          motive: [
            'He stole my research. That’s a motive, I suppose. But I’ve already got a way out — I didn’t need him gone.',
          ],
          accuse: [
            'I never reached the workshop. I was on the stairs at 8:55 and the clock had already stopped at 8:52. Whatever happened up there had already happened.',
          ],
          suspicion: [
            'I keep thinking about Mr Wren on the stairs. No one takes a wrong turn up a spiral staircase looking for a ground-floor cloakroom.',
          ],
        },
        about: {
          ines: ['Ines was in the East Hall with the orrery — I walked through there at quarter past nine and she was still mid-demonstration.'],
          silas: [
            'Mr Wren passed me on the tower stairs at 8:55, coming down fast, clutching his left sleeve. He said he’d taken a wrong turn looking for the cloakroom. He was breathing hard and wouldn’t look at me.',
          ],
          bart: ['Bart made me a coffee at 8:40. He was up to his elbows in éclairs and complaining about the rain on the terrace.'],
        },
        topics: [
          { keys: ['stairs', 'tower', 'wrong turn', 'cloakroom', 'sleeve', 'hurry'],
            replies: ['Mr Wren, on the tower stairs at 8:55, coming down fast and holding his left sleeve. “Wrong turn looking for the cloakroom,” he said. The cloakroom is on the ground floor by the front door.'] },
          { keys: ['catalogue', 'catalog', 'inventory', 'urgent'],
            replies: ['The tower inventory — the director asked for it urgently this afternoon. He said he needed to “check some numbers against the Board”. I left it on the stairs when I lost my nerve.'] },
          { keys: ['files', 'copy', 'copied', 'interview', 'rival', 'laptop', 'new job', 'way out', 'leave', 'leaving'],
            replies: [
              'I… have a few options for my career. That’s all.',
              'I copied some archive files — my own research notes, mostly — for an interview at the Halden Collection. Technically that’s against policy. I wasn’t going to tell anyone.',
            ] },
          { keys: ['clock', 'great clock', 'tick', 'silent', 'quiet', 'stopped', '8:52', 'time'],
            replies: ['By 8:55 the tower was silent. You can always hear the escapement on those stairs — tock, tock, tock. Not tonight. It must already have stopped.'] },
          { keys: ['research', 'water clock', 'credit', 'conference', 'paper'],
            replies: ['Medieval water clocks. Two years of work. He stood up at the conference and said “my findings”. I sat in the third row and clapped.'] },
          { keys: ['envelope', 'board', 'announcement', 'replica', 'fake'],
            replies: ['He was preparing something for the Board — he had me pull acquisition records for every piece Mr Wren has lent or traded since 2015. I didn’t ask why.'] },
          { keys: ['velvet', 'jacket', 'blue'],
            replies: ['Mr Wren’s jacket was midnight-blue velvet. When he passed me on the stairs, I think the cuff was torn — he was holding it closed.'] },
        ],
        fallback: [
          'I’m not sure I understand. Could you rephrase?',
          'I don’t have a record of that — but ask me about tonight, I wrote down the times.',
        ],
      },
    ],
  },
];

export const getBuiltin = (key) => BUILTIN_CASES.find((c) => c.key === key) || null;

/** Server-side "secret" record stored in detective_cases.secret for a built-in case. */
export function builtinSecret(c) {
  return {
    builtinKey: c.key,
    title: c.title,
    setting: c.setting,
    victim: c.victim,
    intro: c.intro,
    clues: c.clues,
    culpritId: c.culpritId,
    motive: c.motive,
    method: c.method,
    explanation: c.explanation,
    suspects: c.suspects.map(({ id, name, role, emoji, description, personality, alibi, secret, knowledge }) =>
      ({ id, name, role, emoji, description, personality, alibi, secret, knowledge })),
  };
}
