import type { StaminaState } from './stamina';
// Request/response shapes shared by the server and the client.
import type { BattleAction, BattleSetup, Outcome } from './battle/types';
import type { MaterialStack, MissionKind, Reward } from './content/types';
import type { BannerState, PullResult } from './gacha';
import type { GearItem } from './gear';
import type { Stats } from './types';

export type UserRole = 'player' | 'admin';

export interface WalletDTO {
  gems: number;
  gold: number;
  stardust: number;
}

export interface OwnedCharacterDTO {
  id: string;
  level: number;
  copies: number;
  ascension: number;
  skillLevel: number;
  ultLevel: number;
  /** The gear set auto-equip aims for on this hero (null = whatever is strongest). */
  gearSet: string | null;
}

/** The tower page: your best floor and the leaderboard. */
export interface TowerDTO {
  best: number;
  leaders: { name: string; title: string | null; floor: number; me: boolean }[];
  /** Your place on the board, if you've cleared a floor. */
  myRank: number | null;
}

/** How many named teams a player can keep. */
export const TEAM_PRESETS = 5;

export interface TeamPresetDTO {
  slot: number;
  name: string;
  /** Character ids; for the active preset this is the current team. */
  members: string[];
}

export interface ProfileDTO {
  user: { id: string; username: string | null; role: UserRole };
  wallet: WalletDTO;
  dailyAvailable: boolean;
  /** Missions that are complete but not yet claimed. */
  missionsReady: number;
  roster: OwnedCharacterDTO[];
  team: string[];
  /** Named team presets; the active one is `team`. */
  teams: TeamPresetDTO[];
  activeTeam: number;
  clearedStages: string[];
  /** Best stars earned per cleared stage. */
  stageStars: Record<string, number>;
  /** Claimed chapter chests, as "chapterId:stars". */
  claimedChests: string[];
  stamina: StaminaState;
  /** One-time markers on the account, e.g. "tutorial-battle" once the battle tutorial is done. */
  flags: string[];
  prefs: PlayerPrefs;
  account: AccountDTO;
  /** Per event: currency held and shop purchases. */
  events: Record<string, { currency: number; purchases: Record<string, number> }>;
  guildId: string | null;
  /** Today's activity points (from claimed daily missions) and the chest thresholds already opened. */
  activity: { points: number; claimed: number[] };
  /** Things waiting for the player, for menu badges. */
  notices: { friendRequests: number; guildAttacksLeft: number };
  banners: Record<string, BannerState>;
  gear: GearItem[];
  /** Material id → count owned. */
  materials: Record<string, number>;
}

/** Account level, titles and social identity. */
export interface AccountDTO {
  level: number;
  xp: number;
  /** XP into the current level, and the XP that level needs (0 at max level). */
  xpInto: number;
  xpNeed: number;
  title: string | null;
  titles: string[];
  friendCode: string;
  /** The hero friends can borrow. */
  supportChar: string | null;
  /** Daily claims so far (the login calendar position). */
  loginDays: number;
}

/** XP from a win, and any level ups it caused. */
export interface XpGainDTO {
  gained: number;
  level: number;
  levelsGained: number;
  /** Paid for the level ups. */
  reward: { gems: number; stamina: number };
}

export interface SupportHeroDTO {
  charId: string;
  level: number;
  constellation: number;
  ascension: number;
  skillLevel: number;
  ultLevel: number;
  /** Final battle stats (gear, ascension and passive included). */
  stats: Stats;
  /** Equipped gear. */
  gear: GearItem[];
}

export interface FriendDTO {
  id: string;
  name: string;
  title: string | null;
  level: number;
  code: string;
  support: SupportHeroDTO | null;
  /** Already borrowed today. */
  usedToday: boolean;
}

export interface FriendRequestDTO {
  id: string;
  name: string;
  level: number;
  code: string;
  /** True when they asked you; false when you asked them. */
  incoming: boolean;
}

export interface SocialDTO {
  friends: FriendDTO[];
  /** What friends see when they borrow from you. */
  mySupport: SupportHeroDTO | null;
  requests: FriendRequestDTO[];
  code: string;
  maxFriends: number;
}

export interface GuildSummaryDTO {
  id: string;
  name: string;
  description: string;
  members: number;
  maxMembers: number;
  open: boolean;
}

export interface GuildMemberDTO {
  id: string;
  name: string;
  title: string | null;
  level: number;
  role: 'leader' | 'member';
  weeklyDamage: number;
  weeklyAttacks: number;
}

export interface GuildDTO extends Omit<GuildSummaryDTO, 'members'> {
  role: 'leader' | 'member';
  memberCount: number;
  members: GuildMemberDTO[];
  boss: { enemy: string; level: number; week: string; pool: number; damage: number; attemptsLeft: number; attemptsPerDay: number };
  chests: { percent: number; reward: Reward; unlocked: boolean; claimed: boolean }[];
}

/** Account-wide settings. */
export interface PlayerPrefs {
  /** Gear drops of this rarity or lower are salvaged for gold right away (0 = off). */
  autoSalvage: 0 | 3 | 4;
}

/** Gear that was salvaged automatically instead of going to the bag. */
export interface SalvagedDTO {
  count: number;
  gold: number;
  /** Reforge stones from the salvaged gear. */
  stones: number;
}

export interface BulkSalvageResponse {
  salvaged: SalvagedDTO;
  profile: ProfileDTO;
}

/** Instantly repeat a mastered stage (3★, or cleared on hard) or a cleared dungeon tier. */
export type SweepRequest =
  | { kind: 'stage'; stageId: string; hard?: boolean; count: number }
  | { kind: 'dungeon'; dungeonId: string; tier: number; count: number };

export interface SweepResponse {
  runs: number;
  rewards: { gems: number; gold: number };
  drops: GearItem[];
  inventoryFull: boolean;
  salvaged: SalvagedDTO;
  materials: MaterialStack[];
  xp: XpGainDTO | null;
  profile: ProfileDTO;
}

export interface CredentialsRequest {
  username: string;
  password: string;
}

export interface SummonRequest {
  bannerId: string;
  count: 1 | 10;
}

export interface SummonResultDTO extends PullResult {
  isNew: boolean;
  constellation: number;
  stardust: number;
}

export interface SummonResponse {
  results: SummonResultDTO[];
  profile: ProfileDTO;
}

export interface PullHistoryEntryDTO {
  charId: string;
  rarity: number;
  bannerId: string;
  pity: number | null;
  createdAt: number;
}

export interface SetTeamRequest {
  team: string[];
}

export interface StartBattleRequest {
  stageId: string;
}

export interface StartBattleResponse {
  battleId: string;
  mode: 'campaign' | 'arena' | 'dungeon' | 'event' | 'guild' | 'tower';
  /** Campaign stage id, or null for arena and dungeon battles. */
  stageId: string | null;
  setup: BattleSetup;
}

export interface CompleteBattleRequest {
  actions: BattleAction[];
}

export interface CompleteBattleResponse {
  outcome: Outcome;
  firstClear: boolean;
  rewards: { gems: number; gold: number };
  /** Gear that dropped (campaign victories). */
  drops: GearItem[];
  /** True if gear would have dropped but the inventory was full. */
  inventoryFull: boolean;
  /** Drops auto-salvaged for gold (see PlayerPrefs). */
  salvaged: SalvagedDTO;
  materials: MaterialStack[];
  arena: ArenaResultDTO | null;
  /** Campaign only: which of the stage's objectives this run met, and the stars. */
  objectives: boolean[];
  stars: number;
  /** True when this run beat the stage's previous best stars. */
  newBest: boolean;
  /** Campaign battles on hard mode. */
  hard: boolean;
  /** Dungeon battles: which run, and how many winning runs are left today. */
  dungeon: { id: string; tier: number } | null;
  /** Tower battles: the floor fought and the best floor after it. */
  tower: { floor: number; best: number } | null;
  /** Event battles: the currency won. */
  event: { id: string; stage: number; currency: number } | null;
  /** Guild boss attacks: damage dealt and the guild's progress. */
  guild: { damage: number; total: number; pool: number; attemptsLeft: number } | null;
  xp: XpGainDTO | null;
  profile: ProfileDTO;
}

export interface ArenaResultDTO {
  opponentName: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface MissionDTO {
  id: string;
  name: string;
  description: string;
  kind: MissionKind;
  repeat: 'once' | 'daily';
  count: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  reward: Reward;
  /** Daily activity points paid on claim. */
  points: number;
}

export interface ClaimMissionResponse {
  missions: MissionDTO[];
  profile: ProfileDTO;
}

// ---------- admin ----------

export interface AdminPlayerDTO {
  id: string;
  username: string | null;
  role: UserRole;
  createdAt: number;
  wallet: WalletDTO;
  characters: number;
  clears: number;
}

export interface AdminGrantRequest {
  gems?: number;
  gold?: number;
  stardust?: number;
  /** Give every character the player doesn't own yet. */
  allCharacters?: boolean;
  /** Set every owned character to this level. */
  level?: number;
  /** Give this many of every material. */
  materialsEach?: number;
}

export interface ShopBuyRequest {
  material: string;
  quantity: number;
}

export interface SimulateRequest {
  stageId: string;
  team: string[];
  level: number;
  runs: number;
}

export interface SimulateResponse {
  runs: number;
  wins: number;
  winRate: number;
  averageTurns: number;
  /** Share of all runs that earned every star. */
  perfectRate: number;
  /** Average player actions in winning runs. */
  averageWinActions: number;
}

// ---------- gear ----------

export interface GearActionResponse {
  item: GearItem | null;
  profile: ProfileDTO;
}

// ---------- arena ----------

export interface ArenaOpponentDTO {
  id: string;
  name: string;
  rating: number;
  isBot: boolean;
  team: { id: string; level: number }[];
  power: number;
}

export interface ArenaHistoryDTO {
  id: number;
  opponentName: string;
  youAttacked: boolean;
  youWon: boolean;
  /** Your rating change. */
  delta: number;
  createdAt: number;
}

export interface ArenaStatusDTO {
  rating: number;
  rank: number;
  wins: number;
  losses: number;
  tickets: number;
  maxTickets: number;
  defense: string[];
  defensePower: number;
  opponents: ArenaOpponentDTO[];
  history: ArenaHistoryDTO[];
  week: string;
  /** Set once, right after a weekly season ends and its reward is paid. */
  seasonReward: { tier: string; icon: string; reward: Reward; ratingAfterReset: number } | null;
}

export interface ArenaLeaderboardEntryDTO {
  rank: number;
  name: string;
  rating: number;
  isYou: boolean;
}
