import type { LoreEntry } from './types';

/** Default hero titles and stories. Later entries unlock as a hero is ascended. */
export const DEFAULT_LORE: Record<string, { title: string; lore: LoreEntry[] }> = {
  ignis: {
    title: 'The Ember King',
    lore: [
      {
        unlockRank: 0,
        title: 'Crown of Cinders',
        text: 'Ignis ruled the Ember Peaks for three hundred years from a throne of cooled lava. When the summoning stars called him, he came not as a servant but as a king curious about a world that no longer feared him.',
      },
      {
        unlockRank: 2,
        title: 'The Cold Year',
        text: 'Once, the volcano at the heart of his kingdom went silent. Ignis breathed into its throat for a whole winter until it woke again. The scorch marks on his scales are from that year; he refuses to let them heal.',
      },
      {
        unlockRank: 4,
        title: 'Heir',
        text: 'He has never named an heir. Those who ask are told the Peaks will choose. Those who listen closely hear the rest: "...when I am certain they will not need me."',
      },
    ],
  },
  marina: {
    title: 'Tidecaller of the Sunken Choir',
    lore: [
      {
        unlockRank: 0,
        title: 'The Choir Below',
        text: 'Marina sang in a choir of a hundred voices beneath the Abyssal Sea. Her song could mend coral and calm storms. She surfaced to find out why the tides had started to sound afraid.',
      },
      {
        unlockRank: 2,
        title: 'Salt and Silence',
        text: 'The other ninety-nine voices went quiet the night the Kraken rose. Marina still sings their parts, one after another, every time she heals.',
      },
      {
        unlockRank: 4,
        title: 'Last Verse',
        text: 'There is a final verse to the Choir’s song that no one has sung in an age. Marina knows it. She is waiting for a crowd worth singing it to.',
      },
    ],
  },
  zephyr: {
    title: 'Blade of the High Winds',
    lore: [
      {
        unlockRank: 0,
        title: 'Skyblade',
        text: 'Zephyr was raised on the cliffs where the gale never stops, learning to fight on ledges no wider than a talon. He strikes once, from above, and is gone before the dust settles.',
      },
      {
        unlockRank: 2,
        title: 'Feather Debt',
        text: 'He carries a single grey feather that is not his own. It belonged to the rival who taught him that speed without purpose is just falling slowly.',
      },
      {
        unlockRank: 4,
        title: 'Above the Clouds',
        text: 'Zephyr has flown higher than any of his kind, to where the stars hum. He says the summoning stars sang his name before anyone on the ground ever spoke it.',
      },
    ],
  },
  gaia: {
    title: 'Stoneheart Guardian',
    lore: [
      {
        unlockRank: 0,
        title: 'The Sleeping Hill',
        text: 'For a thousand years Gaia was a hill that shepherds rested on. When the meadow was threatened, the hill stood up.',
      },
      {
        unlockRank: 2,
        title: 'Moss and Memory',
        text: 'Every scar on Gaia is a story the land told her: a flood, a war, a child who carved initials into her shoulder. She keeps them all.',
      },
      {
        unlockRank: 4,
        title: 'Bedrock',
        text: 'Gaia does not fear being broken. Stone that breaks becomes gravel, then soil, then meadow again. "I have been a mountain before," she says. "I can be patient."',
      },
    ],
  },
  yuki: {
    title: 'Fox of the White Veil',
    lore: [
      {
        unlockRank: 0,
        title: 'Snowfall Trickster',
        text: 'Yuki guards the passes of the Frozen Citadel by leading travellers in circles until they give up and go home happy. Those she likes, she leads to the gate.',
      },
      {
        unlockRank: 2,
        title: 'Nine Lanterns',
        text: 'Each of her tails once held a lantern for a lost traveller. Eight came home. She still keeps the ninth lit.',
      },
      {
        unlockRank: 4,
        title: 'The Veil',
        text: 'Behind the white veil of the Citadel is something Yuki has sworn never to describe. She will only say: the Lich was not the first thing kept there.',
      },
    ],
  },
  raijin: {
    title: 'Storm Tiger',
    lore: [
      {
        unlockRank: 0,
        title: 'Thunder’s Call',
        text: 'Raijin descends only when the storm clouds stack seven high. He is loud, proud, and absolutely convinced that every battle is a festival held in his honour.',
      },
      {
        unlockRank: 2,
        title: 'Drums',
        text: 'The thunder you hear is Raijin drumming on his own ribs. He claims he can play any song. Most of them sound like thunder.',
      },
      {
        unlockRank: 4,
        title: 'The Quiet Storm',
        text: 'Once a century Raijin goes silent, and the sky goes clear for a single day. No one knows where he goes. He comes back stronger, and never talks about it.',
      },
    ],
  },
  elara: {
    title: 'Starlight Wizard',
    lore: [
      {
        unlockRank: 0,
        title: 'The Tower Window',
        text: 'Elara learned frost magic by leaving her tower window open every winter night and arguing with the cold until it listened. Her teachers called it reckless. The cold, eventually, called her teacher.',
      },
      {
        unlockRank: 2,
        title: 'Falling Stars',
        text: 'She keeps a jar of starlight she caught the night she was summoned. On bad days she opens it a crack, just to remember that some things fall and keep shining.',
      },
    ],
  },
  varek: {
    title: 'Knight Templar',
    lore: [
      {
        unlockRank: 0,
        title: 'The Last Templar',
        text: 'The Order fell in a single night of thunder. Varek was the only knight still standing when dawn came, his shield struck so many times by lightning that it now hums when storms are near.',
      },
      {
        unlockRank: 2,
        title: 'A Quiet Vow',
        text: 'He has sworn to rebuild the Order one knight at a time. So far he has recruited Roland, who says he only joined for the cloaks.',
      },
    ],
  },
  roland: {
    title: 'Knight of the Realm',
    lore: [
      {
        unlockRank: 0,
        title: 'Plain Steel',
        text: 'Sir Roland owns one sword, one shield and one opinion: that the people behind him go home tonight. He has never had to change any of the three.',
      },
      {
        unlockRank: 2,
        title: 'Breakfast First',
        text: 'Roland refuses to march on an empty stomach and refuses to let anyone else do it either. Half his legend is battles; the other half is porridge.',
      },
    ],
  },
  celeste: {
    title: 'Sister of the Dawn',
    lore: [
      {
        unlockRank: 0,
        title: 'Small Miracles',
        text: 'Celeste believes the gods answer every prayer, just not always in words. Usually the answer looks like her, arriving with bandages and a stern expression.',
      },
      { unlockRank: 2, title: 'The Smite Question', text: 'Asked why a healer carries a mace, Celeste smiles and says that prevention is also medicine.' },
    ],
  },
  kael: {
    title: 'Ember Duelist',
    lore: [
      {
        unlockRank: 0,
        title: 'One Hundred Duels',
        text: 'Kael has fought ninety-nine duels and won them all. He is saving the hundredth for someone worth losing to, and has not met them yet.',
      },
      {
        unlockRank: 2,
        title: 'Burning Blade',
        text: 'His sword was quenched in a dragon’s breath, a story he tells often. Ignis insists it was a candle. Torch Sprite will not confirm either way.',
      },
    ],
  },
  hollow: {
    title: 'Pumpkin Knight',
    lore: [
      {
        unlockRank: 0,
        title: 'The Lantern Helm',
        text: 'Nobody has seen Hollow without his carved helm. When the Harvest Moon rises it glows from within, and the knight walks the fields keeping the festival lanterns lit until dawn.',
      },
      {
        unlockRank: 2,
        title: 'Seeds of Ember',
        text: 'He carries a pouch of pumpkin seeds that never runs out. Every one he plants grows into a lantern by morning. Every one he throws at an enemy explodes.',
      },
    ],
  },
  fenn: {
    title: 'Wandering Archer',
    lore: [
      { unlockRank: 0, title: 'The Wind’s Aim', text: 'Fenn never learned to aim properly. The wind just likes him, and nudges his arrows home.' },
      {
        unlockRank: 2,
        title: 'Spare Arrows',
        text: 'He carries twice as many arrows as he needs, because he keeps giving them to children who ask. Most of the realm’s young archers trace their first shot back to Fenn.',
      },
    ],
  },
  aldric: {
    title: 'Royal Soldier',
    lore: [
      {
        unlockRank: 0,
        title: 'Oath of the Gate',
        text: 'Aldric stood watch at the royal gate for eleven quiet years. When the summons came he was the only guard who stepped forward. He says someone had to; the others say he had been waiting all eleven years.',
      },
      {
        unlockRank: 2,
        title: 'The Dented Helm',
        text: 'His helm carries a deep dent from an orc’s club. He refuses to have it hammered out, because it reminds him he was fast enough, once.',
      },
    ],
  },
  cinder: {
    title: 'Ash-Tailed Hunter',
    lore: [
      {
        unlockRank: 0,
        title: 'Warm Rocks',
        text: 'Cinder hunts along the lava flows, where the rocks are warm enough to nap on. He bites first and asks questions never.',
      },
      {
        unlockRank: 2,
        title: 'Shed Skin',
        text: 'Every spring Cinder sheds his old skin and leaves it as a gift on Ignis’s throne. Ignis has never once acknowledged this. Cinder keeps doing it anyway.',
      },
    ],
  },
  coral: {
    title: 'Reef Medic',
    lore: [
      {
        unlockRank: 0,
        title: 'Eight Hands',
        text: 'Coral tends the wounded of the reef with eight steady arms and a surprising amount of ink. The ink is antiseptic. Mostly.',
      },
      {
        unlockRank: 2,
        title: 'Marina’s Student',
        text: 'Coral learned medicine by watching Marina heal the reef. She never learned to sing, so she learned to work twice as fast instead.',
      },
    ],
  },
  kai: {
    title: 'Wave Rider',
    lore: [
      {
        unlockRank: 0,
        title: 'Surf’s Up',
        text: 'Kai treats every fight like a wave worth catching. His cheer is contagious; so is his habit of splashing everyone.',
      },
      {
        unlockRank: 2,
        title: 'The Long Swim',
        text: 'Kai once swam from the Abyssal Sea to the Meadow Lake to deliver a single message. He forgot the message on the way, but delivered the enthusiasm.',
      },
    ],
  },
  sylph: {
    title: 'Fairy of the Breeze',
    lore: [
      {
        unlockRank: 0,
        title: 'Dandelion Wings',
        text: 'Sylph was born from a dandelion clock that a child blew on a summer day. She has been granting small wishes ever since: a cool breeze, a closed wound, a found shoe.',
      },
      {
        unlockRank: 2,
        title: 'The Big Wish',
        text: 'Sylph has saved her magic for one large wish. She hasn’t decided what it is yet. She suspects she’ll know when she sees it.',
      },
    ],
  },
  bramble: {
    title: 'Hedge Warden',
    lore: [
      { unlockRank: 0, title: 'Prickly', text: 'Bramble lives in the thick hedges of the meadow and takes his job of being in the way very seriously.' },
      {
        unlockRank: 2,
        title: 'Soft Underneath',
        text: 'The meadow children know that if you bring Bramble an apple, he will roll over and let you see the soft bit. Grown-ups are not told this.',
      },
    ],
  },
  lumen: {
    title: 'Owl of Insight',
    lore: [
      {
        unlockRank: 0,
        title: 'Night Library',
        text: 'Lumen keeps a library inside a hollow lightning-struck oak. Every book is charged faintly with static, which keeps the bookworms out.',
      },
      {
        unlockRank: 2,
        title: 'The Missing Page',
        text: 'One page is missing from Lumen’s oldest book: the page that explains the summoning stars. Lumen suspects it was torn out on purpose.',
      },
    ],
  },
  buzz: {
    title: 'Volt Hive Captain',
    lore: [
      {
        unlockRank: 0,
        title: 'Hive Mind',
        text: 'Buzz commands a hive whose honey crackles with electricity. Eating it is not recommended. Buzz eats it constantly.',
      },
      {
        unlockRank: 2,
        title: 'Queen’s Orders',
        text: 'The hive queen sent Buzz away to “see the world and stop being so loud.” He took the first part very seriously.',
      },
    ],
  },
  rime: {
    title: 'Glacier Slider',
    lore: [
      { unlockRank: 0, title: 'Belly First', text: 'Rime discovered that sliding is faster than walking, and that sliding into enemies is faster still.' },
      {
        unlockRank: 2,
        title: 'Colony',
        text: 'Rime’s colony lives on the ice shelf below the Frozen Citadel. They have heard the Lich’s bells for years. Rime decided to go and ask it to stop.',
      },
    ],
  },
  torch: {
    title: 'Little Flame',
    lore: [
      {
        unlockRank: 0,
        title: 'Night Light',
        text: 'Torch was a candle left burning in a window for a traveller who never came home. When the summoning stars passed, it decided to go looking instead.',
      },
      {
        unlockRank: 2,
        title: 'Wax and Wane',
        text: 'Torch gets a little shorter after every battle. It doesn’t mind. “A candle that never burns,” it says, “is just a stick.”',
      },
    ],
  },
  kindle: {
    title: 'Acorn Keeper',
    lore: [
      {
        unlockRank: 0,
        title: 'Warm Pockets',
        text: 'Kindle keeps hot acorns in her cheeks to stay warm through Ember winters, and hands them out to anyone who looks cold.',
      },
      {
        unlockRank: 2,
        title: 'Buried Things',
        text: 'Kindle has buried acorns all over the world and remembers every one. Some of them are trees now. She visits.',
      },
    ],
  },
  puddle: {
    title: 'Pond Healer',
    lore: [
      {
        unlockRank: 0,
        title: 'Lily Pad',
        text: 'Puddle is the healer of a very small pond, which he insists is a very large lake. His tongue is faster than most arrows.',
      },
      {
        unlockRank: 2,
        title: 'Croak of Courage',
        text: 'Puddle is afraid of almost everything. He croaks loudly so no one notices, and heals everyone so no one has to be afraid with him.',
      },
    ],
  },
  drip: {
    title: 'Tide Pool Sentinel',
    lore: [
      { unlockRank: 0, title: 'Sideways', text: 'Drip guards the tide pools and approaches every problem sideways. It works more often than you would think.' },
      { unlockRank: 2, title: 'New Shell', text: 'Drip has outgrown four shells. He keeps the old ones lined up on a rock and talks to them before battles.' },
    ],
  },
  breeze: {
    title: 'Wind Messenger',
    lore: [
      { unlockRank: 0, title: 'Tailwind', text: 'Breeze carries messages for the meadow folk and is never late, because she brings the wind with her.' },
      { unlockRank: 2, title: 'Unsent Letter', text: 'There is one letter Breeze has carried for years without delivering. It is addressed to the sky.' },
    ],
  },
  gusty: {
    title: 'Monarch of the Meadow',
    lore: [
      { unlockRank: 0, title: 'Wing Patterns', text: 'Gusty’s wings carry a pattern that, read correctly, is a map of every flower in the meadow.' },
      { unlockRank: 2, title: 'Migration', text: 'Every year Gusty’s kin fly south. Gusty stays, because someone has to keep the flowers company.' },
    ],
  },
  pebble: {
    title: 'Steadfast Shell',
    lore: [
      { unlockRank: 0, title: 'Slow and Sure', text: 'Pebble has never lost a race he cared about, mainly because he only cares about the long ones.' },
      {
        unlockRank: 2,
        title: 'Older Than He Looks',
        text: 'Pebble remembers when the meadow was a forest, and when the forest was a sea. He doesn’t talk about it unless asked politely.',
      },
    ],
  },
  mossy: {
    title: 'Garden Mender',
    lore: [
      { unlockRank: 0, title: 'Silver Trails', text: 'Wherever Mossy goes, the grass grows back greener. Gardeners leave lettuce out for her as thanks.' },
      { unlockRank: 2, title: 'The Slow Road', text: 'Mossy took nine years to cross the meadow. She says she saw everything worth seeing, twice.' },
    ],
  },
  static: {
    title: 'Spark Nibbler',
    lore: [
      {
        unlockRank: 0,
        title: 'Chewed Wires',
        text: 'Static nibbles on lightning-struck branches for the tingle. It has made him very fast and slightly fuzzy.',
      },
      {
        unlockRank: 2,
        title: 'Storm Chaser',
        text: 'Static follows Raijin’s storms at a respectful distance, hoping to one day be loud enough to be noticed.',
      },
    ],
  },
  flurry: {
    title: 'Snow Hopper',
    lore: [
      { unlockRank: 0, title: 'Powder', text: 'Flurry throws snowballs with an accuracy that is frankly unsettling for a rabbit.' },
      {
        unlockRank: 2,
        title: 'Burrow Under the Citadel',
        text: 'Flurry’s burrow connects to tunnels beneath the Frozen Citadel. She has never gone further in. She has heard bells.',
      },
    ],
  },
};
