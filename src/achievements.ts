import { difficultyOf } from './difficulty';
import { levels } from './engine';

type AchievementMetric = 'deliveries' | 'fixedCargo' | 'hintFree' | 'expert';

type Achievement = {
  title: string;
  requirement: string;
  metric: AchievementMetric;
  goal: number;
  symbol: string;
  color: 'gold' | 'forest' | 'river' | 'plum';
};

const achievements: readonly Achievement[] = [
  { title: 'First Delivery', requirement: 'Complete your first delivery.', metric: 'deliveries', goal: 1, symbol: '✓', color: 'gold' },
  { title: 'Wheels Rolling', requirement: 'Complete 3 deliveries.', metric: 'deliveries', goal: 3, symbol: '↗', color: 'forest' },
  { title: 'Around the Bolt', requirement: 'Complete a level with fixed cargo.', metric: 'fixedCargo', goal: 1, symbol: '⬢', color: 'river' },
  { title: 'Independent Courier', requirement: 'Complete 3 different levels without using Hint.', metric: 'hintFree', goal: 3, symbol: '✦', color: 'plum' },
  { title: 'Scenic Route', requirement: 'Complete 15 deliveries.', metric: 'deliveries', goal: 15, symbol: '⚑', color: 'gold' },
  { title: 'Precision Packer', requirement: 'Complete 5 levels with fixed cargo.', metric: 'fixedCargo', goal: 5, symbol: '✶', color: 'river' },
  { title: 'Expert Driver', requirement: 'Complete an Expert level.', metric: 'expert', goal: 1, symbol: '◆', color: 'forest' },
  { title: 'Fleet Legend', requirement: `Complete all ${levels.length} deliveries.`, metric: 'deliveries', goal: levels.length, symbol: '★', color: 'plum' },
];

export type AchievementStatus = Achievement & { progress: number; earned: boolean };

export function achievementProgress(completed: readonly boolean[], hintFreeClears: readonly boolean[]): AchievementStatus[] {
  const counts: Record<AchievementMetric, number> = { deliveries: 0, fixedCargo: 0, hintFree: 0, expert: 0 };
  for (const [index, level] of levels.entries()) {
    if (!completed[index]) continue;
    counts.deliveries++;
    if (level.blocked.length) counts.fixedCargo++;
    if (hintFreeClears[index]) counts.hintFree++;
    if (difficultyOf(index) === 'Expert') counts.expert++;
  }

  return achievements.map(achievement => {
    const progress = Math.min(achievement.goal, counts[achievement.metric]);
    return { ...achievement, progress, earned: progress === achievement.goal };
  });
}
