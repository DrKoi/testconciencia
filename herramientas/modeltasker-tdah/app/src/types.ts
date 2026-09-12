export type TaskState = 'backlog' | 'active' | 'parked' | 'completed';

export interface MicroStep {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  state: TaskState;
  order: number;
  createdAt: number;
  parkedAt?: number;
  parkedReason?: string;
  completedAt?: number;
  microSteps: MicroStep[];
}

export interface Preferences {
  theme: 'dark' | 'light';
  parkingLotExpanded: boolean;
  victoryLogExpanded: boolean;
  statsExpanded: boolean;
  soundEnabled: boolean;
}

export interface Stats {
  totalVictories: number;
  totalMicroStepsCompleted: number;
}

export interface AppState {
  version: number;
  activeTaskId: string | null;
  tasks: Task[];
  preferences: Preferences;
  stats: Stats;
}

export interface PendingDeletion {
  tokenId: string;
  tasks: Task[];
  timer: ReturnType<typeof setTimeout>;
}
